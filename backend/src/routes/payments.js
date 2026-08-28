/* AMÁH Brand — backend: pagamentos automáticos via Mercado Pago (Fase
 * "Pagamentos automáticos", 2026-08-28).
 *
 * Rotas aqui:
 *  - POST /vitrine/orders/:id/pay   (pública) — cria a Preference (Checkout
 *    Pro, PIX + cartão + boleto) pra um pedido já registrado pela Vitrine.
 *  - POST /presencial/charge        (autenticada) — cria uma cobrança PIX
 *    (QR Code na hora) ou cartão (link/QR pro celular do cliente) no Modo
 *    Vendedor.
 *  - GET  /presencial/charge/:id    (autenticada) — consulta o status de uma
 *    cobrança presencial, pro frontend fazer polling enquanto espera o
 *    cliente pagar.
 *  - POST /webhook                  (pública) — recebe a notificação do
 *    Mercado Pago, SEMPRE reconsulta o pagamento na API deles (nunca confia
 *    no corpo da notificação) e só então converte pedido/cobrança em venda.
 *
 * Segurança: o webhook nunca tem usuário logado (é o Mercado Pago avisando,
 * ou o próprio cliente terminando de pagar em casa) — por isso vendas
 * confirmadas por aqui usam um "ator" do sistema (ver salesCore.js), nunca
 * req.user.
 */
'use strict';

const express = require('express');
const { pool, withTransaction } = require('../db');
const { requireAuth, requireRole } = require('../auth');
const mercadoPago = require('../mercadoPago');
const { finalizeSaleCore, getRow, httpError, round2, nowIso, uuid } = require('../salesCore');

const router = express.Router();

// URL pública deste backend (pra montar a notification_url que o Mercado
// Pago chama) e da Vitrine (pra montar as back_urls do Checkout Pro).
// Configuradas como variável de ambiente no Render, do mesmo jeito que
// DATABASE_URL/JWT_SECRET — sem isso, os pagamentos ainda funcionam, só sem
// redirecionamento automático de volta pra Vitrine ao final.
const BACKEND_URL = (process.env.BACKEND_URL || '').replace(/\/$/, '');
const STOREFRONT_URL = (process.env.STOREFRONT_URL || '').replace(/\/$/, '');

function notificationUrl() {
  return BACKEND_URL ? BACKEND_URL + '/api/v1/payments/webhook' : undefined;
}

async function upsertOrder(client, id, data) {
  await client.query(
    'INSERT INTO store_public_orders (id, data, updated_at) VALUES ($1,$2, now()) ' +
    'ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()',
    [id, data]
  );
}

async function upsertCharge(client, id, data) {
  await client.query(
    'INSERT INTO store_mp_charges (id, data, updated_at) VALUES ($1,$2, now()) ' +
    'ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()',
    [id, data]
  );
}

// Descobre qual forma de pagamento cadastrada (Configurações → Formas de
// pagamento) corresponde ao pagamento Mercado Pago que acabou de ser
// confirmado, pelo tipo devolvido pela própria API deles — nunca inventa um
// id novo, sempre usa uma das 3 formas já cadastradas pela migração
// (ver migrate.js) pra manter o relatório de vendas/taxas coerente com o
// resto do sistema.
async function resolveMpMethodId(client, payment) {
  const doc = await getRow(client, 'store_settings', 'payment_methods', false);
  const methods = (doc && doc.items) || [];
  const isPix = payment.payment_type_id === 'bank_transfer' || payment.payment_method_id === 'pix';
  const isBoleto = payment.payment_type_id === 'ticket';
  const label = isPix ? 'PIX (Mercado Pago)' : isBoleto ? 'Boleto (Mercado Pago)' : 'Cartão (Mercado Pago)';
  const match = methods.find((m) => (m.name || '').indexOf(label) === 0);
  if (!match) {
    throw httpError(500, 'A forma de pagamento "' + label + '" não está cadastrada em Configurações → Formas de pagamento — não é possível registrar a venda automaticamente.');
  }
  return match.id;
}

// ------------------------------------------------------------------
// Vitrine — cria a Preference (Checkout Pro: cliente escolhe PIX, cartão ou
// boleto) pra um pedido que já foi registrado por POST /api/v1/public/orders.
// ------------------------------------------------------------------
router.post('/vitrine/orders/:id/pay', async (req, res) => {
  try {
    if (!mercadoPago.enabled) {
      return res.status(503).json({ error: 'O pagamento automático ainda não foi configurado neste sistema. Tente novamente mais tarde ou fale conosco pelo WhatsApp.' });
    }
    const orderId = req.params.id;
    const result = await pool.query('SELECT data FROM store_public_orders WHERE id = $1', [orderId]);
    const order = result.rows[0] ? result.rows[0].data : null;
    if (!order) return res.status(404).json({ error: 'Pedido não encontrado.' });
    if (order.status !== 'novo') return res.status(400).json({ error: 'Este pedido já foi processado.' });
    if (!order.items || !order.items.length) return res.status(400).json({ error: 'Pedido sem itens.' });

    const backUrl = STOREFRONT_URL || undefined;
    const preference = await mercadoPago.createPreference({
      items: order.items.map((it) => ({
        title: it.name + (it.color ? ' (' + it.color + ')' : ''),
        quantity: it.qty,
        unitPrice: it.unitPrice
      })),
      externalReference: 'vitrine:' + order.id,
      notificationUrl: notificationUrl(),
      backUrls: backUrl ? { success: backUrl + '?pagamento=sucesso', pending: backUrl + '?pagamento=pendente', failure: backUrl + '?pagamento=falha' } : undefined,
      autoReturn: backUrl ? 'approved' : undefined,
      payerEmail: order.customerEmail || undefined
    });

    res.json({ initPoint: preference.init_point, orderId: order.id });
  } catch (err) {
    // Diferente do webhook (que já logava), esta rota respondia o erro só
    // pro navegador sem deixar rastro no log do servidor — corrigido em
    // 2026-08-28 depois de um teste real da usuária não deixar pista
    // nenhuma pra investigar. mpResponse (quando existe) traz o motivo
    // exato devolvido pelo Mercado Pago (ex.: método de pagamento não
    // habilitado pra esta conta).
    console.error('Erro ao criar cobrança (Vitrine, Checkout Pro) orderId=' + req.params.id + ':', err.message, err.mpResponse || '');
    res.status(err.httpStatus || 500).json({ error: err.message });
  }
});

// Quantos minutos o link de pagamento Pix da Vitrine fica válido — a pedido
// da usuária ("quero que a pessoa receba pelo pix apenas o link de
// pagamento para pagar em alguns minutos"), 2026-08-28. Só afeta esta rota
// (Pix direto da Vitrine); cartão/boleto pelo Checkout Pro continuam sem
// prazo próprio (regra do Mercado Pago pra Preference).
const VITRINE_PIX_EXPIRATION_MINUTES = 30;

// ------------------------------------------------------------------
// Vitrine — Pix direto (sem passar pela tela de várias opções do Checkout
// Pro): cria o pagamento Pix já e devolve um LINK único (ticket_url, uma
// página do próprio Mercado Pago com o QR Code/copia-e-cola) pra cliente
// abrir e pagar. Mesmo pedido/mesma validação da rota de cima — só muda
// qual chamada é feita no Mercado Pago (Payment direto em vez de
// Preference) e o que volta pro frontend (um link em vez de initPoint).
// ------------------------------------------------------------------
router.post('/vitrine/orders/:id/pay-pix', async (req, res) => {
  try {
    if (!mercadoPago.enabled) {
      return res.status(503).json({ error: 'O pagamento automático ainda não foi configurado neste sistema. Tente novamente mais tarde ou fale conosco pelo WhatsApp.' });
    }
    const orderId = req.params.id;
    const result = await pool.query('SELECT data FROM store_public_orders WHERE id = $1', [orderId]);
    const order = result.rows[0] ? result.rows[0].data : null;
    if (!order) return res.status(404).json({ error: 'Pedido não encontrado.' });
    if (order.status !== 'novo') return res.status(400).json({ error: 'Este pedido já foi processado.' });
    if (!order.items || !order.items.length) return res.status(400).json({ error: 'Pedido sem itens.' });

    const total = round2(order.items.reduce((sum, it) => sum + it.qty * it.unitPrice, 0));
    const expiresAt = new Date(Date.now() + VITRINE_PIX_EXPIRATION_MINUTES * 60000).toISOString();

    const payment = await mercadoPago.createPixPayment({
      amount: total,
      description: 'Pedido AMÁH Brand #' + order.id,
      externalReference: 'vitrine:' + order.id,
      notificationUrl: notificationUrl(),
      payerEmail: order.customerEmail || undefined,
      dateOfExpiration: expiresAt
    });

    const txData = payment.point_of_interaction && payment.point_of_interaction.transaction_data;
    const ticketUrl = txData && txData.ticket_url;
    if (!ticketUrl) {
      throw httpError(502, 'O Mercado Pago não devolveu o link de pagamento do Pix. Tente novamente ou fale conosco pelo WhatsApp.');
    }

    res.json({
      ticketUrl: ticketUrl,
      qrCode: (txData && txData.qr_code) || null,
      qrCodeBase64: (txData && txData.qr_code_base64) || null,
      expiresAt: expiresAt,
      orderId: order.id
    });
  } catch (err) {
    console.error('Erro ao criar cobrança Pix (Vitrine, link direto) orderId=' + req.params.id + ':', err.message, err.mpResponse || '');
    res.status(err.httpStatus || 500).json({ error: err.message });
  }
});

// ------------------------------------------------------------------
// Modo Vendedor (presencial) — cria uma cobrança PIX (QR Code devolvido na
// hora, pra mostrar na tela da vendedora) ou cartão (link/QR pro celular do
// cliente escanear e pagar sozinho — ver decisão da usuária: sem maquininha).
// Nunca inclui boleto aqui (decisão explícita: boleto só na Vitrine).
// ------------------------------------------------------------------
router.post('/presencial/charge', requireAuth, requireRole('admin', 'vendedor'), async (req, res) => {
  try {
    if (!mercadoPago.enabled) {
      return res.status(503).json({ error: 'O pagamento automático ainda não foi configurado neste sistema.' });
    }
    const body = req.body || {};
    const amount = round2(body.amount);
    const methodType = body.methodType; // 'pix' | 'cartao'
    if (!isFinite(amount) || amount <= 0) return res.status(400).json({ error: 'Valor inválido.' });
    if (methodType !== 'pix' && methodType !== 'cartao') return res.status(400).json({ error: 'Tipo de cobrança inválido.' });

    const chargeId = uuid();
    const externalReference = 'presencial:' + chargeId;
    const charge = {
      id: chargeId, methodType: methodType, amount: amount,
      status: 'pendente', mpPaymentId: null, qrCode: null, qrCodeBase64: null, initPoint: null,
      createdBy: req.user.sub, createdByName: req.user.name,
      createdAt: nowIso(), updatedAt: nowIso()
    };

    if (methodType === 'pix') {
      const payment = await mercadoPago.createPixPayment({
        amount: amount,
        description: 'Venda AMÁH Brand (presencial)',
        externalReference: externalReference,
        notificationUrl: notificationUrl()
      });
      charge.mpPaymentId = String(payment.id);
      const txData = payment.point_of_interaction && payment.point_of_interaction.transaction_data;
      charge.qrCode = (txData && txData.qr_code) || null;
      charge.qrCodeBase64 = (txData && txData.qr_code_base64) || null;
      if (payment.status === 'approved') charge.status = 'pago';
    } else {
      // Restringe o Checkout Pro só a cartão — sem boleto (ticket) nem PIX
      // (bank_transfer) nem débito, já que a decisão foi cartão de crédito
      // via link no celular do próprio cliente.
      const preference = await mercadoPago.createPreference({
        items: [{ title: 'Venda AMÁH Brand (presencial)', quantity: 1, unitPrice: amount }],
        externalReference: externalReference,
        notificationUrl: notificationUrl(),
        excludedPaymentTypes: ['ticket', 'bank_transfer', 'debit_card']
      });
      charge.initPoint = preference.init_point;
    }

    await pool.query('INSERT INTO store_mp_charges (id, data, updated_at) VALUES ($1,$2, now())', [charge.id, charge]);
    res.status(201).json(charge);
  } catch (err) {
    console.error('Erro ao criar cobrança presencial (' + (req.body && req.body.methodType) + '):', err.message, err.mpResponse || '');
    res.status(err.httpStatus || 500).json({ error: err.message });
  }
});

// GET /presencial/charge/:id — pro frontend fazer polling enquanto mostra
// "aguardando pagamento…" (a cada ~3s, com desistência depois de alguns
// minutos — ver vendedorMode.js).
router.get('/presencial/charge/:id', requireAuth, async (req, res) => {
  try {
    const result = await pool.query('SELECT data FROM store_mp_charges WHERE id = $1', [req.params.id]);
    const charge = result.rows[0] ? result.rows[0].data : null;
    if (!charge) return res.status(404).json({ error: 'Cobrança não encontrada.' });
    res.json(charge);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ------------------------------------------------------------------
// Webhook do Mercado Pago — nunca confia no corpo da notificação (só usa pra
// descobrir QUAL pagamento consultar); a autoridade é sempre a resposta de
// GET /v1/payments/:id, buscada com nosso próprio token. Sempre responde 200
// (mesmo em erro nosso) pra não entrar num loop de reenvio automático do
// Mercado Pago — erros ficam só no log do Render pra investigação manual.
// ------------------------------------------------------------------
router.post('/webhook', async (req, res) => {
  try {
    const body = req.body || {};
    const query = req.query || {};
    const topic = body.type || query.type || query.topic;
    // Mercado Pago também notifica outros tópicos (ex.: merchant_order) —
    // só nos interessa 'payment'.
    if (topic && topic !== 'payment') return res.status(200).json({ received: true });

    const paymentId = (body.data && body.data.id) || query['data.id'] || query.id;
    if (!paymentId) return res.status(200).json({ received: true });

    const payment = await mercadoPago.getPayment(paymentId);
    if (payment.status !== 'approved') return res.status(200).json({ received: true });

    const ref = payment.external_reference || '';

    if (ref.indexOf('vitrine:') === 0) {
      const orderId = ref.slice('vitrine:'.length);
      await withTransaction(async (client) => {
        const orderResult = await client.query('SELECT data FROM store_public_orders WHERE id = $1 FOR UPDATE', [orderId]);
        const order = orderResult.rows[0] ? orderResult.rows[0].data : null;
        // Idempotência: se já não estiver 'novo', esta notificação é um
        // reenvio do Mercado Pago de algo que já processamos — não faz nada.
        if (!order || order.status !== 'novo') return;
        try {
          const methodId = await resolveMpMethodId(client, payment);
          const sale = await finalizeSaleCore(client, {
            items: order.items.map((it) => ({ productId: it.productId, qty: it.qty, unitPrice: it.unitPrice })),
            payments: [{ methodId: methodId, amount: order.total, mpPaymentId: String(payment.id) }],
            customerId: null,
            source: 'vitrine'
          }, { sub: null, name: 'Vitrine (pagamento automático)' });
          await upsertOrder(client, orderId, Object.assign({}, order, { status: 'convertido_em_venda', saleId: sale.id, updatedAt: nowIso() }));
        } catch (err) {
          // Ex.: estoque insuficiente entre o carrinho e o pagamento ser
          // aprovado. O pagamento já foi cobrado do cliente — não dá pra
          // simplesmente descartar; marca o pedido com erro pra alguém da
          // equipe resolver manualmente (estornar ou repor estoque).
          console.error('Falha ao converter pedido da Vitrine em venda após pagamento aprovado (orderId=' + orderId + '):', err);
          await upsertOrder(client, orderId, Object.assign({}, order, { status: 'erro_ao_converter', errorMessage: err.message, updatedAt: nowIso() }));
        }
      });
    } else if (ref.indexOf('presencial:') === 0) {
      const chargeId = ref.slice('presencial:'.length);
      await withTransaction(async (client) => {
        const chargeResult = await client.query('SELECT data FROM store_mp_charges WHERE id = $1 FOR UPDATE', [chargeId]);
        const charge = chargeResult.rows[0] ? chargeResult.rows[0].data : null;
        if (!charge || charge.status !== 'pendente') return; // idempotência
        await upsertCharge(client, chargeId, Object.assign({}, charge, { status: 'pago', mpPaymentId: String(payment.id), updatedAt: nowIso() }));
      });
    }

    res.status(200).json({ received: true });
  } catch (err) {
    console.error('Erro no webhook de pagamento Mercado Pago:', err);
    res.status(200).json({ received: true, error: err.message });
  }
});

module.exports = router;
