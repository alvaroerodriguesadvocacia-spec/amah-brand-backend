/* AMÁH Brand — backend: operações atômicas complexas (Fase 10, próximo
 * incremento documentado no README). Replica exatamente as regras de negócio
 * já validadas no frontend local (js/core/*Engine.js) — mesmo vocabulário de
 * tipos de movimentação, mesmas fórmulas, mesmas mensagens de erro — só que
 * dentro de uma transação real do PostgreSQL (BEGIN/COMMIT/ROLLBACK com
 * SELECT ... FOR UPDATE nas linhas envolvidas) em vez de uma transação do
 * IndexedDB. Isso permite múltiplos usuários finalizando vendas, recebendo
 * compras e fechando caixa ao mesmo tempo, sem corromper o estoque nem os
 * contadores sequenciais (Regra de Ouro do Estoque e Regra de Ouro
 * Financeira, ver ARQUITETURA.md).
 */
'use strict';

const express = require('express');
const crypto = require('crypto');
const { pool } = require('../db');
const { requireAuth, requireRole } = require('../auth');
const { finalizeSaleCore } = require('../salesCore');

const router = express.Router();
router.use(requireAuth);

// Ações sensíveis (Modo Vendedor, item "sensível para v2"): cancelamento de
// venda concluída, devolução/estorno, qualquer operação de compra e ajuste
// manual de estoque por inventário exigem o perfil administrador. Vender
// (sales/finalize) e operar o caixa continuam liberados para o vendedor —
// é o núcleo da operação dele.
const adminOnly = requireRole('admin');

function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }
function nowIso() { return new Date().toISOString(); }
function addDays(iso, days) { const d = new Date(iso); d.setDate(d.getDate() + days); return d.toISOString(); }
function uuid() { return crypto.randomUUID(); }
function isDeferredMethod(name) {
  const n = (name || '').toLowerCase();
  return n.indexOf('prazo') !== -1 || n.indexOf('boleto') !== -1;
}
function httpError(status, message) {
  const err = new Error(message);
  err.httpStatus = status;
  return err;
}

const STOCK_TIPOS = {
  ENTRADA_COMPRA: 1, ENTRADA_DEVOLUCAO: 1, ENTRADA_AJUSTE: 1, ENTRADA_INICIAL: 1,
  SAIDA_VENDA: -1, SAIDA_PERDA: -1, SAIDA_AVARIA: -1, SAIDA_AJUSTE: -1,
  ESTORNO_VENDA: 1, ESTORNO_COMPRA: -1
};

const CASH_DIRECTION_BY_TYPE = {
  venda: 1, suprimento: 1, entrada: 1,
  retirada: -1, sangria: -1, despesa: -1, estorno_venda: -1, devolucao: -1
};

function buildStockMovement(params) {
  if (!STOCK_TIPOS.hasOwnProperty(params.type)) throw httpError(400, 'Tipo de movimentação de estoque inválido: ' + params.type);
  const quantity = Number(params.quantity);
  if (!isFinite(quantity) || quantity <= 0) throw httpError(400, 'A quantidade movimentada deve ser maior que zero.');
  if (!params.productId) throw httpError(400, 'Movimentação de estoque sem produto associado.');
  return {
    id: uuid(), productId: params.productId, type: params.type, quantity: quantity,
    relatedDocument: params.relatedDocument || null, reason: params.reason || null, notes: params.notes || null,
    createdAt: nowIso()
  };
}

async function auditLog(client, params) {
  const record = {
    id: uuid(), timestamp: nowIso(), operation: params.operation, entity: params.entity, entityId: params.entityId,
    oldValue: params.oldValue != null ? params.oldValue : null, newValue: params.newValue != null ? params.newValue : null,
    reason: params.reason || null, userId: params.userId || null
  };
  await client.query('INSERT INTO store_audit_logs (id, data, updated_at) VALUES ($1,$2, now())', [record.id, record]);
}

async function getRow(client, table, id, forUpdate) {
  const q = 'SELECT data FROM ' + table + ' WHERE id = $1' + (forUpdate ? ' FOR UPDATE' : '');
  const r = await client.query(q, [id]);
  return r.rows[0] ? r.rows[0].data : null;
}

async function getByIndex(client, table, field, value, forUpdate) {
  const q = 'SELECT data FROM ' + table + " WHERE data->>$1 = $2" + (forUpdate ? ' FOR UPDATE' : '');
  const r = await client.query(q, [field, value]);
  return r.rows.map((row) => row.data);
}

async function getAll(client, table, forUpdate) {
  const q = 'SELECT data FROM ' + table + (forUpdate ? ' FOR UPDATE' : '');
  const r = await client.query(q);
  return r.rows.map((row) => row.data);
}

async function putRow(client, table, id, data) {
  await client.query(
    'INSERT INTO ' + table + ' (id, data, updated_at) VALUES ($1,$2, now()) ' +
    'ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()',
    [id, Object.assign({}, data, { id })]
  );
}

async function saldoProduto(client, productId) {
  const r = await client.query("SELECT data FROM store_inventory_movements WHERE data->>'productId' = $1", [productId]);
  return r.rows.reduce((sum, row) => sum + (STOCK_TIPOS[row.data.type] || 0) * Number(row.data.quantity || 0), 0);
}

// Envolve a rota numa transação real do Postgres: BEGIN antes, COMMIT se o
// handler resolver, ROLLBACK se lançar. Espelha App.db.runAtomic do frontend.
function txRoute(handler) {
  return async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await handler(client, req);
      await client.query('COMMIT');
      res.json(result);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      const status = err.httpStatus || (err.code === '23505' ? 409 : 500);
      res.status(status).json({ error: err.message || 'Erro interno do servidor.' });
    } finally {
      client.release();
    }
  };
}

/* ---------------------------------------------------------------------- */
/* Vendas (SalesEngine)                                                    */
/* ---------------------------------------------------------------------- */

// A lógica de negócio em si mora em salesCore.js (extraída daqui em
// 2026-08-28) — o mesmo núcleo é reaproveitado pelo webhook de pagamento
// automático (routes/payments.js) quando uma venda da Vitrine é concluída
// sozinha, sem vendedora logada. Aqui só traduzimos req.user pro "ator" que
// assina a venda (Vendedor + data/hora, item 24 do diagnóstico).
router.post('/sales/finalize', txRoute(async (client, req) => {
  const actor = { sub: req.user && req.user.sub, name: (req.user && req.user.name) || (req.user && req.user.email) || null };
  return finalizeSaleCore(client, req.body || {}, actor);
}));

router.post('/sales/:id/cancel', adminOnly, txRoute(async (client, req) => {
  const reason = (req.body && req.body.reason) || '';
  if (!reason.trim()) throw httpError(400, 'Informe o motivo do cancelamento.');
  const sale = await getRow(client, 'store_sales', req.params.id, true);
  if (!sale) throw httpError(404, 'Venda não encontrada.');
  if (sale.status !== 'concluida') throw httpError(400, 'Esta venda já está cancelada.');

  const saleItems = await getByIndex(client, 'store_sale_items', 'saleId', sale.id, true);
  const receivables = await getByIndex(client, 'store_accounts_receivable', 'saleId', sale.id, true);
  const allCashMovements = await getAll(client, 'store_cash_movements');
  const allSessions = await getAll(client, 'store_cash_sessions');
  const sessionsById = {}; allSessions.forEach((s) => { sessionsById[s.id] = s; });
  const now = nowIso();

  const stockMovements = saleItems
    .filter((si) => (si.qty - (si.returnedQty || 0)) > 0)
    .map((si) => buildStockMovement({
      productId: si.productId, type: 'ESTORNO_VENDA', quantity: si.qty - (si.returnedQty || 0),
      relatedDocument: sale.number, reason: 'Cancelamento de venda ' + sale.number + ': ' + reason
    }));

  const updatedReceivables = receivables
    .filter((r) => r.status === 'pendente' || r.status === 'vencido')
    .map((r) => Object.assign({}, r, { status: 'cancelado', updatedAt: now }));

  const relatedCashMovements = allCashMovements.filter((cm) => cm.relatedDocument === sale.number && cm.type === 'venda');
  const reversalCashMovements = relatedCashMovements
    .filter((cm) => { const s = sessionsById[cm.cashSessionId]; return s && s.status === 'aberto'; })
    .map((cm) => ({
      id: uuid(), cashSessionId: cm.cashSessionId, type: 'estorno_venda', amount: cm.amount, direction: -1,
      description: 'Estorno da venda ' + sale.number + ' (cancelamento)', relatedDocument: sale.number, createdAt: now
    }));

  const updatedSale = Object.assign({}, sale, { status: 'cancelada', cancelReason: reason, cancelledAt: now, updatedAt: now });

  await putRow(client, 'store_sales', updatedSale.id, updatedSale);
  for (const m of stockMovements) await putRow(client, 'store_inventory_movements', m.id, m);
  for (const r of updatedReceivables) await putRow(client, 'store_accounts_receivable', r.id, r);
  for (const cm of reversalCashMovements) await putRow(client, 'store_cash_movements', cm.id, cm);
  await auditLog(client, {
    operation: 'UPDATE', entity: 'sales', entityId: sale.id, oldValue: sale, newValue: updatedSale, reason: reason,
    userId: req.user && req.user.sub
  });

  return updatedSale;
}));

router.post('/sales/items/:id/return', adminOnly, txRoute(async (client, req) => {
  const qty = Number(req.body && req.body.qty);
  const reason = (req.body && req.body.reason) || '';
  if (!reason.trim()) throw httpError(400, 'Informe o motivo da devolução.');
  const saleItem = await getRow(client, 'store_sale_items', req.params.id, true);
  if (!saleItem) throw httpError(404, 'Item de venda não encontrado.');
  const remaining = saleItem.qty - (saleItem.returnedQty || 0);
  if (!isFinite(qty) || qty <= 0) throw httpError(400, 'Quantidade a devolver deve ser maior que zero.');
  if (qty > remaining) throw httpError(400, 'Quantidade a devolver (' + qty + ') maior que a quantidade disponível para devolução (' + remaining + ').');

  const sale = await getRow(client, 'store_sales', saleItem.saleId, true);
  if (!sale) throw httpError(404, 'Venda original não encontrada.');
  if (sale.status !== 'concluida') throw httpError(400, 'Não é possível devolver itens de uma venda cancelada.');

  const now = nowIso();
  const movement = buildStockMovement({
    productId: saleItem.productId, type: 'ESTORNO_VENDA', quantity: qty,
    relatedDocument: sale.number, reason: 'Devolução parcial (' + qty + ' un.) — ' + reason
  });
  const updatedItem = Object.assign({}, saleItem, { returnedQty: (saleItem.returnedQty || 0) + qty, updatedAt: now });

  const cashMovements = [];
  if (sale.cashSessionId) {
    const session = await getRow(client, 'store_cash_sessions', sale.cashSessionId, false);
    if (session && session.status === 'aberto') {
      const proportionalValue = Math.round((qty / saleItem.qty) * saleItem.total * 100) / 100;
      cashMovements.push({
        id: uuid(), cashSessionId: session.id, type: 'devolucao', amount: proportionalValue, direction: -1,
        description: 'Devolução — Venda ' + sale.number + ' (' + saleItem.productName + ')',
        relatedDocument: sale.number, createdAt: now
      });
    }
  }

  await putRow(client, 'store_sale_items', updatedItem.id, updatedItem);
  await putRow(client, 'store_inventory_movements', movement.id, movement);
  for (const cm of cashMovements) await putRow(client, 'store_cash_movements', cm.id, cm);
  await auditLog(client, {
    operation: 'UPDATE', entity: 'sale_items', entityId: saleItem.id, oldValue: saleItem, newValue: updatedItem, reason: reason,
    userId: req.user && req.user.sub
  });

  return updatedItem;
}));

/* ---------------------------------------------------------------------- */
/* Compras (PurchaseEngine)                                                */
/* ---------------------------------------------------------------------- */

router.post('/purchases', adminOnly, txRoute(async (client, req) => {
  const params = req.body || {};
  const items = params.items || [];
  if (!params.supplierId) throw httpError(400, 'Selecione um fornecedor.');
  if (items.length === 0) throw httpError(400, 'Adicione ao menos um item à compra.');

  const supplier = await getRow(client, 'store_suppliers', params.supplierId, false);
  if (!supplier) throw httpError(400, 'Fornecedor não encontrado.');
  const counterDoc = await getRow(client, 'store_settings', 'counters', true);

  let itemsTotal = 0;
  const purchaseItems = items.map((it) => {
    const qty = Number(it.qty);
    if (!isFinite(qty) || qty <= 0) throw httpError(400, 'Quantidade inválida.');
    const unitCost = Number(it.unitCost);
    if (!isFinite(unitCost) || unitCost < 0) throw httpError(400, 'Custo unitário inválido.');
    itemsTotal += qty * unitCost;
    return { id: uuid(), purchaseId: null, productId: it.productId, productName: it.productName, sku: it.sku, qty: qty, unitCost: unitCost, receivedQty: 0 };
  });

  const freight = Number(params.freight) || 0;
  const additionalCosts = Number(params.additionalCosts) || 0;
  const discount = Number(params.discount) || 0;
  const total = round2(itemsTotal + freight + additionalCosts - discount);
  if (total <= 0) throw httpError(400, 'O valor total da compra deve ser maior que zero.');

  const nextNum = ((counterDoc && counterDoc.purchaseNumber) || 0) + 1;
  const now = nowIso();
  const purchase = {
    id: uuid(), number: 'C' + String(nextNum).padStart(6, '0'), supplierId: supplier.id,
    documentNumber: params.documentNumber || '', date: params.date || now, freight: freight, additionalCosts: additionalCosts,
    discount: discount, total: total, itemsTotal: round2(itemsTotal), paymentMethodId: params.paymentMethodId || null,
    expectedDeliveryDate: params.expectedDeliveryDate || null, status: 'pedido', payableGenerated: false,
    notes: params.notes || '', createdAt: now, updatedAt: now
  };
  purchaseItems.forEach((pi) => { pi.purchaseId = purchase.id; });

  const cDoc = counterDoc || { id: 'counters' };
  cDoc.purchaseNumber = nextNum;
  await putRow(client, 'store_settings', 'counters', cDoc);
  await putRow(client, 'store_purchases', purchase.id, purchase);
  for (const pi of purchaseItems) await putRow(client, 'store_purchase_items', pi.id, pi);
  await auditLog(client, { operation: 'CREATE', entity: 'purchases', entityId: purchase.id, newValue: purchase, userId: req.user && req.user.sub });

  return purchase;
}));

router.post('/purchases/:id/receive', adminOnly, txRoute(async (client, req) => {
  const receivedQtyByItemId = (req.body && req.body.receivedQtyByItemId) || {};
  const options = (req.body && req.body.options) || {};
  const purchase = await getRow(client, 'store_purchases', req.params.id, true);
  if (!purchase) throw httpError(404, 'Compra não encontrada.');
  if (purchase.status === 'recebido') throw httpError(400, 'Esta compra já foi totalmente recebida.');
  if (purchase.status === 'cancelado') throw httpError(400, 'Esta compra está cancelada.');

  const purchaseItems = await getByIndex(client, 'store_purchase_items', 'purchaseId', purchase.id, true);
  const now = nowIso();
  const stockMovements = [];
  const updatedItems = [];
  const updatedProducts = {};
  let anyReceived = false;

  for (const item of purchaseItems) {
    const qtyToReceive = Number(receivedQtyByItemId[item.id]) || 0;
    if (qtyToReceive <= 0) { updatedItems.push(item); continue; }
    const remaining = item.qty - item.receivedQty;
    if (qtyToReceive > remaining) {
      throw httpError(400, 'Quantidade a receber de "' + item.productName + '" (' + qtyToReceive + ') maior que o pendente (' + remaining + ').');
    }
    anyReceived = true;
    stockMovements.push(buildStockMovement({
      productId: item.productId, type: 'ENTRADA_COMPRA', quantity: qtyToReceive,
      relatedDocument: purchase.number, reason: 'Recebimento da compra ' + purchase.number
    }));
    const updatedItem = Object.assign({}, item, { receivedQty: item.receivedQty + qtyToReceive });
    updatedItems.push(updatedItem);

    if (!updatedProducts[item.productId]) {
      const product = await getRow(client, 'store_products', item.productId, true);
      if (product) updatedProducts[item.productId] = product;
    }
    if (updatedProducts[item.productId]) {
      updatedProducts[item.productId] = Object.assign({}, updatedProducts[item.productId], {
        cost: item.unitCost, lastPurchaseAt: now, updatedAt: now
      });
    }
  }

  if (!anyReceived) throw httpError(400, 'Informe ao menos uma quantidade a receber.');

  const allFullyReceived = updatedItems.every((i) => i.receivedQty >= i.qty);
  const someReceived = updatedItems.some((i) => i.receivedQty > 0);
  const newStatus = allFullyReceived ? 'recebido' : (someReceived ? 'parcial' : purchase.status);

  let payable = null;
  const updatedPurchase = Object.assign({}, purchase, { status: newStatus, updatedAt: now });
  if (options.generatePayable && !purchase.payableGenerated) {
    payable = {
      id: uuid(), supplierId: purchase.supplierId, purchaseId: purchase.id, categoryId: null,
      description: 'Compra ' + purchase.number, dueDate: options.payableDueDate || now, amount: purchase.total,
      status: 'pendente', paidAt: null, paidAmount: 0, createdAt: now
    };
    updatedPurchase.payableGenerated = true;
  }

  await putRow(client, 'store_purchases', updatedPurchase.id, updatedPurchase);
  for (const i of updatedItems) await putRow(client, 'store_purchase_items', i.id, i);
  for (const m of stockMovements) await putRow(client, 'store_inventory_movements', m.id, m);
  for (const id of Object.keys(updatedProducts)) await putRow(client, 'store_products', id, updatedProducts[id]);
  if (payable) await putRow(client, 'store_accounts_payable', payable.id, payable);
  await auditLog(client, {
    operation: 'UPDATE', entity: 'purchases', entityId: purchase.id, oldValue: purchase, newValue: updatedPurchase,
    reason: 'Recebimento de mercadoria', userId: req.user && req.user.sub
  });

  return updatedPurchase;
}));

router.post('/purchases/:id/cancel', adminOnly, txRoute(async (client, req) => {
  const reason = (req.body && req.body.reason) || '';
  const purchase = await getRow(client, 'store_purchases', req.params.id, true);
  if (!purchase) throw httpError(404, 'Compra não encontrada.');
  if (purchase.status === 'recebido') throw httpError(400, 'Não é possível cancelar uma compra já totalmente recebida.');
  const updated = Object.assign({}, purchase, { status: 'cancelado', cancelReason: reason, updatedAt: nowIso() });
  await putRow(client, 'store_purchases', updated.id, updated);
  await auditLog(client, {
    operation: 'UPDATE', entity: 'purchases', entityId: purchase.id, oldValue: purchase, newValue: updated, reason: reason,
    userId: req.user && req.user.sub
  });
  return updated;
}));

/* ---------------------------------------------------------------------- */
/* Caixa (CashEngine)                                                      */
/* ---------------------------------------------------------------------- */

router.get('/cash/open-session', txRoute(async (client) => {
  const sessions = await getAll(client, 'store_cash_sessions');
  return sessions.filter((s) => s.status === 'aberto')[0] || null;
}));

router.post('/cash/open', txRoute(async (client, req) => {
  const sessions = await getAll(client, 'store_cash_sessions', true);
  const existing = sessions.filter((s) => s.status === 'aberto')[0];
  if (existing) throw httpError(400, 'Já existe um caixa aberto (desde ' + existing.openedAt + '). Feche-o antes de abrir um novo.');
  const balance = Number(req.body && req.body.openingBalance);
  if (!isFinite(balance) || balance < 0) throw httpError(400, 'Saldo inicial inválido.');
  const session = {
    id: uuid(), status: 'aberto', openingBalance: balance, openedAt: nowIso(), closedAt: null,
    closingBalanceExpected: null, closingBalanceInformed: null, difference: null, notes: (req.body && req.body.notes) || ''
  };
  // FOR UPDATE acima não trava nada quando a tabela ainda está vazia (não há
  // linha pra travar) — isso só importa na primeiríssima sessão de caixa de
  // todas; o índice único store_cash_sessions_single_open_idx (migrate.js) é
  // quem garante isso de verdade nesse caso raro, então traduzimos a
  // violação dele pra uma mensagem amigável em vez do erro cru do Postgres.
  try {
    await putRow(client, 'store_cash_sessions', session.id, session);
  } catch (err) {
    if (err.code === '23505') throw httpError(400, 'Já existe um caixa aberto. Feche-o antes de abrir um novo.');
    throw err;
  }
  await auditLog(client, { operation: 'CREATE', entity: 'cash_sessions', entityId: session.id, newValue: session, userId: req.user && req.user.sub });
  return session;
}));

router.post('/cash/movement', txRoute(async (client, req) => {
  const type = req.body && req.body.type;
  if (!CASH_DIRECTION_BY_TYPE.hasOwnProperty(type)) throw httpError(400, 'Tipo de movimentação de caixa inválido: ' + type);
  const amount = Number(req.body && req.body.amount);
  if (!isFinite(amount) || amount <= 0) throw httpError(400, 'O valor deve ser maior que zero.');
  const sessions = await getAll(client, 'store_cash_sessions', true);
  const session = sessions.filter((s) => s.status === 'aberto')[0];
  if (!session) throw httpError(400, 'Não há caixa aberto. Abra o caixa antes de registrar movimentações.');
  const movement = {
    id: uuid(), cashSessionId: session.id, type: type, amount: round2(amount), direction: CASH_DIRECTION_BY_TYPE[type],
    description: (req.body && req.body.description) || '', relatedDocument: (req.body && req.body.relatedDocument) || null,
    createdAt: nowIso()
  };
  await putRow(client, 'store_cash_movements', movement.id, movement);
  await auditLog(client, { operation: 'CREATE', entity: 'cash_movements', entityId: movement.id, newValue: movement, userId: req.user && req.user.sub });
  return movement;
}));

router.post('/cash/:id/close', txRoute(async (client, req) => {
  const session = await getRow(client, 'store_cash_sessions', req.params.id, true);
  if (!session) throw httpError(404, 'Caixa não encontrado.');
  if (session.status !== 'aberto') throw httpError(400, 'Este caixa já está fechado.');
  const movements = await getByIndex(client, 'store_cash_movements', 'cashSessionId', session.id, false);
  const net = movements.reduce((sum, m) => sum + m.direction * m.amount, 0);
  const expectedBalance = round2(session.openingBalance + net);
  const informed = Number(req.body && req.body.closingBalanceInformed);
  if (!isFinite(informed) || informed < 0) throw httpError(400, 'Saldo informado inválido.');
  const difference = round2(informed - expectedBalance);
  const notes = (req.body && req.body.notes) || '';
  const updated = Object.assign({}, session, {
    status: 'fechado', closedAt: nowIso(), closingBalanceExpected: expectedBalance,
    closingBalanceInformed: informed, difference: difference, notes: (session.notes || '') + (notes ? ' | Fechamento: ' + notes : '')
  });
  await putRow(client, 'store_cash_sessions', updated.id, updated);
  await auditLog(client, {
    operation: 'UPDATE', entity: 'cash_sessions', entityId: session.id, oldValue: session, newValue: updated,
    reason: 'Fechamento de caixa', userId: req.user && req.user.sub
  });
  return updated;
}));

/* ---------------------------------------------------------------------- */
/* Inventário (InventoryEngine)                                            */
/* ---------------------------------------------------------------------- */

// Inventário é área administrativa (mesma política já aplicada às stores
// stock_counts/stock_count_items no CRUD genérico — ver app.js) — sem isso
// aqui, um vendedor conseguia iniciar/ler contagens direto pela API mesmo
// não tendo essa tela no menu (2026-08-26).
router.post('/inventory/count/start', adminOnly, txRoute(async (client, req) => {
  const all = await getAll(client, 'store_stock_counts', true);
  const open = all.filter((c) => c.status === 'em_andamento')[0];
  if (open) return open;
  const count = { id: uuid(), status: 'em_andamento', startedAt: nowIso(), finishedAt: null, notes: (req.body && req.body.notes) || '' };
  await putRow(client, 'store_stock_counts', count.id, count);
  return count;
}));

router.post('/inventory/count/:id/reading', adminOnly, txRoute(async (client, req) => {
  const stockCountId = req.params.id;
  const productId = req.body && req.body.productId;
  const mode = (req.body && req.body.mode) || 'add'; // 'add' | 'set'
  const qty = Number(req.body && req.body.qty);
  if (!productId) throw httpError(400, 'Produto obrigatório.');

  const items = await getByIndex(client, 'store_stock_count_items', 'stockCountId', stockCountId, true);
  const existing = items.filter((i) => i.productId === productId)[0];

  if (existing) {
    const updated = Object.assign({}, existing, {
      countedQty: mode === 'set' ? (Number(qty) || 0) : (existing.countedQty || 0) + (Number(qty) || 1)
    });
    await putRow(client, 'store_stock_count_items', updated.id, updated);
    return updated;
  }

  const systemQty = await saldoProduto(client, productId);
  const item = { id: uuid(), stockCountId: stockCountId, productId: productId, systemQty: systemQty, countedQty: mode === 'set' ? (Number(qty) || 0) : (Number(qty) || 1) };
  // Corrida rara: outra requisição pode criar o item pro mesmo produto
  // entre o SELECT acima e este INSERT — o índice único de banco
  // (store_stock_count_items_unique_idx) barra a duplicata em vez de
  // deixar criar. Um SAVEPOINT antes da tentativa permite recuar só esse
  // pedaço (sem abortar a transação inteira, que faria qualquer comando
  // seguinte falhar com "current transaction is aborted") e convergir: lê
  // o item que "ganhou" a corrida e aplica esta leitura nele, em vez de
  // devolver erro pra usuária (2026-08-26).
  await client.query('SAVEPOINT reading_insert');
  try {
    await putRow(client, 'store_stock_count_items', item.id, item);
    await client.query('RELEASE SAVEPOINT reading_insert');
  } catch (err) {
    if (err && err.code === '23505') {
      await client.query('ROLLBACK TO SAVEPOINT reading_insert');
      const again = await getByIndex(client, 'store_stock_count_items', 'stockCountId', stockCountId, true);
      const race = again.filter((i) => i.productId === productId)[0];
      if (race) {
        const merged = Object.assign({}, race, {
          countedQty: mode === 'set' ? (Number(qty) || 0) : (race.countedQty || 0) + (Number(qty) || 1)
        });
        await putRow(client, 'store_stock_count_items', merged.id, merged);
        return merged;
      }
    }
    throw err;
  }
  return item;
}));

router.get('/inventory/count/:id/divergences', adminOnly, txRoute(async (client, req) => {
  const items = await getByIndex(client, 'store_stock_count_items', 'stockCountId', req.params.id, false);
  return items.map((i) => Object.assign({}, i, { difference: i.countedQty - i.systemQty }));
}));

router.post('/inventory/count/:id/confirm-adjustments', adminOnly, txRoute(async (client, req) => {
  const stockCountId = req.params.id;
  const itemIds = (req.body && req.body.itemIds) || [];
  const items = await getByIndex(client, 'store_stock_count_items', 'stockCountId', stockCountId, true);
  const allWithDiff = items.map((i) => Object.assign({}, i, { difference: i.countedQty - i.systemQty }));
  // !i.adjusted evita reprocessar um item que uma chamada anterior (ex.: uma
  // repetição da mesma requisição após timeout, ou duplo clique) já ajustou —
  // sem isso, um reenvio dos mesmos itemIds gerava um segundo ajuste de
  // estoque para a mesma divergência (2026-08-26).
  const toAdjust = allWithDiff.filter((i) => itemIds.indexOf(i.id) !== -1 && i.difference !== 0 && !i.adjusted);
  if (toAdjust.length === 0) return [];

  const movements = toAdjust.map((i) => buildStockMovement({
    productId: i.productId, type: i.difference > 0 ? 'ENTRADA_AJUSTE' : 'SAIDA_AJUSTE', quantity: Math.abs(i.difference),
    relatedDocument: 'Inventário', reason: 'Ajuste de inventário — contagem física'
  }));
  const updatedItems = toAdjust.map((i) => Object.assign({}, i, { adjusted: true }));

  for (const i of updatedItems) await putRow(client, 'store_stock_count_items', i.id, i);
  for (const m of movements) await putRow(client, 'store_inventory_movements', m.id, m);
  await auditLog(client, {
    operation: 'ADJUST', entity: 'stock_counts', entityId: stockCountId, reason: 'Confirmação de divergências de inventário',
    userId: req.user && req.user.sub
  });

  return updatedItems;
}));

router.post('/inventory/count/:id/finish', adminOnly, txRoute(async (client, req) => {
  const count = await getRow(client, 'store_stock_counts', req.params.id, true);
  if (!count) throw httpError(404, 'Inventário não encontrado.');
  const updated = Object.assign({}, count, { status: 'concluido', finishedAt: nowIso() });
  await putRow(client, 'store_stock_counts', updated.id, updated);
  return updated;
}));

module.exports = router;
