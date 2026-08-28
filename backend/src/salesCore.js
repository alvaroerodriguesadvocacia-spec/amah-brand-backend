/* AMÁH Brand — backend: núcleo de finalização de venda, extraído de
 * routes/operations.js (2026-08-28) pra poder ser chamado de dois lugares:
 *
 *  1. A rota autenticada POST /api/v1/operations/sales/finalize (Vender/
 *     Modo Vendedor) — o vendedor logado é o "ator" da venda.
 *  2. O webhook de pagamento (routes/payments.js), quando um pagamento
 *     Mercado Pago da Vitrine é confirmado — aí não existe um usuário
 *     logado (é o próprio cliente pagando em casa), então a venda é
 *     atribuída a um "ator" do sistema em vez de uma pessoa da equipe.
 *
 * A lógica de negócio em si (cálculo de total, validação de estoque,
 * geração de número sequencial, contas a receber, baixa de estoque etc.)
 * é EXATAMENTE a mesma nos dois casos — só muda quem assina a venda.
 */
'use strict';

const crypto = require('crypto');

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

async function saldoProduto(client, productId) {
  const r = await client.query("SELECT data FROM store_inventory_movements WHERE data->>'productId' = $1", [productId]);
  const STOCK_TIPOS = {
    ENTRADA_COMPRA: 1, ENTRADA_DEVOLUCAO: 1, ENTRADA_AJUSTE: 1, ENTRADA_INICIAL: 1,
    SAIDA_VENDA: -1, SAIDA_PERDA: -1, SAIDA_AVARIA: -1, SAIDA_AJUSTE: -1,
    ESTORNO_VENDA: 1, ESTORNO_COMPRA: -1
  };
  return r.rows.reduce((sum, row) => sum + (STOCK_TIPOS[row.data.type] || 0) * Number(row.data.quantity || 0), 0);
}

function buildStockMovement(params) {
  const quantity = Number(params.quantity);
  if (!isFinite(quantity) || quantity <= 0) throw httpError(400, 'A quantidade movimentada deve ser maior que zero.');
  if (!params.productId) throw httpError(400, 'Movimentação de estoque sem produto associado.');
  return {
    id: uuid(), productId: params.productId, type: params.type, quantity: quantity,
    relatedDocument: params.relatedDocument || null, reason: params.reason || null, notes: params.notes || null,
    createdAt: nowIso()
  };
}

async function putRow(client, table, id, data) {
  await client.query(
    'INSERT INTO ' + table + ' (id, data, updated_at) VALUES ($1,$2, now()) ' +
    'ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()',
    [id, Object.assign({}, data, { id })]
  );
}

// params: { items, payments, customerId, discountTotal, cashSessionId }
// actor: { sub, name } — quem "assina" a venda (sellerId/sellerName). Para
// vendas criadas automaticamente por um pagamento on-line da Vitrine, passe
// um ator do sistema, ex.: { sub: null, name: 'Vitrine (pagamento automático)' }.
async function finalizeSaleCore(client, params, actor) {
  const items = params.items || [];
  const payments = params.payments || [];
  if (items.length === 0) throw httpError(400, 'A venda precisa ter ao menos um item no carrinho.');
  if (payments.length === 0) throw httpError(400, 'Selecione ao menos uma forma de pagamento.');

  const productIds = items.map((i) => i.productId);
  const productMap = {};
  for (const id of productIds) {
    if (productMap[id]) continue;
    const p = await getRow(client, 'store_products', id, true);
    if (!p) throw httpError(400, 'Um dos produtos do carrinho não foi encontrado (pode ter sido excluído).');
    productMap[id] = p;
  }

  const counterDoc = await getRow(client, 'store_settings', 'counters', true);
  const paymentMethodsDoc = await getRow(client, 'store_settings', 'payment_methods', false);
  const customer = params.customerId ? await getRow(client, 'store_customers', params.customerId, true) : null;

  const stockMap = {};
  for (const id of Object.keys(productMap)) {
    stockMap[id] = await saldoProduto(client, id);
  }

  let subtotal = 0, itemDiscountTotal = 0;
  const saleItems = items.map((it) => {
    const product = productMap[it.productId];
    if (!product.active) throw httpError(400, 'Produto "' + product.name + '" está inativo e não pode ser vendido.');
    const qty = Number(it.qty);
    if (!isFinite(qty) || qty <= 0) throw httpError(400, 'Quantidade de "' + product.name + '" deve ser maior que zero.');
    const unitPrice = Number(it.unitPrice);
    if (!isFinite(unitPrice) || unitPrice <= 0) {
      throw httpError(400, 'A peça "' + product.name + '" ainda não tem preço definido. Defina o preço de varejo em Produtos antes de vender.');
    }
    const discount = Number(it.discount) || 0;
    const lineTotal = round2(qty * unitPrice - discount);
    if (lineTotal < 0) throw httpError(400, 'Desconto maior que o valor do item "' + product.name + '".');
    const available = stockMap[product.id] || 0;
    if (available - qty < 0) {
      throw httpError(400, 'Estoque insuficiente para "' + product.name + '". Disponível: ' + available + ', solicitado: ' + qty + '.');
    }
    subtotal += qty * unitPrice;
    itemDiscountTotal += discount;
    const unitCostAtSale = (Number(product.cost) || 0) + (Number(product.additionalCosts) || 0);
    return {
      id: uuid(), saleId: null, productId: product.id, productName: product.name, sku: product.sku,
      qty: qty, unitPrice: unitPrice, discount: discount, total: lineTotal,
      unitCostAtSale: unitCostAtSale, returnedQty: 0
    };
  });

  const discountTotal = round2(itemDiscountTotal + (Number(params.discountTotal) || 0));
  const total = round2(subtotal - discountTotal);
  if (total <= 0) throw httpError(400, 'O total da venda deve ser maior que zero.');

  const methods = (paymentMethodsDoc && paymentMethodsDoc.items) || [];
  const methodMap = {}; methods.forEach((m) => { methodMap[m.id] = m; });
  let paymentsSum = 0;
  const paymentRecords = payments.map((p) => {
    const method = methodMap[p.methodId];
    if (!method) throw httpError(400, 'Forma de pagamento inválida.');
    const amount = Number(p.amount);
    if (!isFinite(amount) || amount <= 0) throw httpError(400, 'Valor em ' + method.name + ' inválido.');
    paymentsSum += amount;
    const feePercent = Number(method.feePercent) || 0;
    const feeAmount = round2(amount * feePercent / 100);
    const netAmount = round2(amount - feeAmount);
    return {
      id: uuid(), saleId: null, methodId: method.id, methodName: method.name, feePercent: feePercent,
      grossAmount: round2(amount), feeAmount: feeAmount, netAmount: netAmount,
      deferred: isDeferredMethod(method.name), dueDate: p.dueDate || null,
      affectsCash: method.affectsCash !== false && (method.name === 'Dinheiro' || method.name === 'PIX' || !!method.affectsCash),
      // Rastreabilidade do pagamento automático (Mercado Pago) — nulo pra
      // qualquer forma de pagamento tradicional (2026-08-28).
      mpPaymentId: p.mpPaymentId || null,
      createdAt: nowIso()
    };
  });
  if (Math.abs(round2(paymentsSum) - total) > 0.01) {
    throw httpError(400, 'A soma dos pagamentos não corresponde ao total da venda.');
  }

  const nextNum = ((counterDoc && counterDoc.saleNumber) || 0) + 1;
  const saleNumberStr = 'V' + String(nextNum).padStart(6, '0');
  const now = nowIso();
  const sale = {
    id: uuid(), number: saleNumberStr, customerId: params.customerId || null,
    subtotal: round2(subtotal), discountTotal: discountTotal, total: total,
    status: 'concluida', cancelReason: null, cancelledAt: null, cashSessionId: params.cashSessionId || null,
    sellerId: (actor && actor.sub) || null,
    sellerName: (actor && actor.name) || null,
    // Origem da venda — permite diferenciar no relatório uma venda feita
    // pela equipe (Vender/Modo Vendedor) de uma concluída sozinha pelo
    // pagamento automático da Vitrine (2026-08-28).
    source: params.source || 'gestao',
    createdAt: now, updatedAt: now
  };
  saleItems.forEach((si) => { si.saleId = sale.id; });
  paymentRecords.forEach((pr) => { pr.saleId = sale.id; });

  const stockMovements = saleItems.map((si) => buildStockMovement({
    productId: si.productId, type: 'SAIDA_VENDA', quantity: si.qty, relatedDocument: sale.number, reason: 'Venda ' + sale.number
  }));

  const receivables = [];
  paymentRecords.forEach((pr) => {
    if (pr.deferred) {
      receivables.push({
        id: uuid(), customerId: sale.customerId, saleId: sale.id, paymentId: pr.id, parcelNumber: 1,
        dueDate: pr.dueDate || addDays(now, 30), amount: pr.netAmount, status: 'pendente', paidAt: null, paidAmount: 0, createdAt: now
      });
    }
  });

  const cashMovements = [];
  if (params.cashSessionId) {
    paymentRecords.forEach((pr) => {
      if (pr.affectsCash && !pr.deferred) {
        cashMovements.push({
          id: uuid(), cashSessionId: params.cashSessionId, type: 'venda', amount: pr.netAmount, direction: 1,
          description: 'Venda ' + sale.number + ' — ' + pr.methodName, relatedDocument: sale.number, createdAt: now
        });
      }
    });
  }

  const cDoc = counterDoc || { id: 'counters' };
  cDoc.saleNumber = nextNum;
  await putRow(client, 'store_settings', 'counters', cDoc);
  await putRow(client, 'store_sales', sale.id, sale);
  for (const si of saleItems) await putRow(client, 'store_sale_items', si.id, si);
  for (const pr of paymentRecords) await putRow(client, 'store_payments', pr.id, pr);
  for (const m of stockMovements) await putRow(client, 'store_inventory_movements', m.id, m);
  for (const r of receivables) await putRow(client, 'store_accounts_receivable', r.id, r);
  for (const cm of cashMovements) await putRow(client, 'store_cash_movements', cm.id, cm);

  for (const si of saleItems) {
    const p = productMap[si.productId];
    const updated = Object.assign({}, p, { totalSold: (p.totalSold || 0) + si.qty, lastSaleAt: now, updatedAt: now });
    productMap[si.productId] = updated;
    await putRow(client, 'store_products', p.id, updated);
  }

  if (customer) {
    const updatedCustomer = Object.assign({}, customer, {
      totalPurchased: round2((customer.totalPurchased || 0) + sale.total),
      purchaseCount: (customer.purchaseCount || 0) + 1,
      firstPurchaseAt: customer.firstPurchaseAt || now, lastPurchaseAt: now, updatedAt: now
    });
    await putRow(client, 'store_customers', customer.id, updatedCustomer);
  }

  await auditLog(client, {
    operation: 'CREATE', entity: 'sales', entityId: sale.id, newValue: sale, reason: 'Finalização de venda',
    userId: actor && actor.sub
  });

  return sale;
}

module.exports = { finalizeSaleCore, httpError, getRow, putRow, round2, nowIso, uuid };
