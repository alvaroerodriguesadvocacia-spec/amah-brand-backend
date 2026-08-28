/* AMÁH Brand — backend: cliente fino da API do Mercado Pago (Fase
 * "Pagamentos automáticos", 2026-08-28).
 *
 * Único arquivo que fala HTTP com o Mercado Pago — o resto do backend nunca
 * monta uma URL da API deles diretamente, só chama as funções daqui (mesmo
 * princípio do js/apiClient.js no frontend: um único ponto de integração).
 *
 * Usa o `fetch` nativo do Node (disponível desde o Node 18) em vez do SDK
 * oficial — evita mais uma dependência externa pra uma integração pequena e
 * bem definida (3 chamadas: criar preferência, criar pagamento PIX, consultar
 * pagamento).
 *
 * Fica DESATIVADO (enabled=false) enquanto a variável de ambiente
 * MERCADOPAGO_ACCESS_TOKEN não estiver configurada no Render — nesse caso as
 * rotas que dependem disto respondem com uma mensagem clara em vez de
 * quebrar, e a Vitrine/Modo Vendedor voltam ao comportamento de antes
 * (WhatsApp / registro manual do pagamento).
 */
'use strict';

const ACCESS_TOKEN = process.env.MERCADOPAGO_ACCESS_TOKEN || '';
const API_BASE = 'https://api.mercadopago.com';
const enabled = !!ACCESS_TOKEN;

async function mpFetch(path, options) {
  if (!enabled) {
    const err = new Error('Pagamento automático (Mercado Pago) ainda não foi configurado neste sistema.');
    err.httpStatus = 503;
    throw err;
  }
  options = options || {};
  const headers = Object.assign(
    {
      Authorization: 'Bearer ' + ACCESS_TOKEN,
      'Content-Type': 'application/json',
      // Evita processar duas vezes a mesma criação de cobrança em caso de
      // reenvio automático de rede — usamos nosso próprio id de referência
      // como chave de idempotência quando fornecido pelo chamador.
      'X-Idempotency-Key': options.idempotencyKey || undefined
    },
    options.headers || {}
  );
  const res = await fetch(API_BASE + path, {
    method: options.method || 'GET',
    headers: headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = (data && (data.message || (data.cause && data.cause[0] && data.cause[0].description))) || 'Erro na comunicação com o Mercado Pago.';
    const err = new Error(message);
    err.httpStatus = res.status >= 400 && res.status < 500 ? 400 : 502;
    err.mpResponse = data;
    throw err;
  }
  return data;
}

// Cria uma "Preference" (Checkout Pro) — página de pagamento hospedada pelo
// próprio Mercado Pago, onde o cliente escolhe PIX, cartão ou boleto. Usado
// pela Vitrine (todos os métodos) e pelo cartão presencial do Modo Vendedor
// (restrito só a cartão via excludedPaymentTypes).
async function createPreference(params) {
  const body = {
    items: params.items.map((it) => ({
      title: it.title,
      quantity: it.quantity,
      unit_price: it.unitPrice,
      currency_id: 'BRL'
    })),
    external_reference: params.externalReference,
    notification_url: params.notificationUrl,
    back_urls: params.backUrls,
    auto_return: params.autoReturn || undefined,
    payer: params.payerEmail ? { email: params.payerEmail } : undefined,
    payment_methods: params.excludedPaymentTypes
      ? { excluded_payment_types: params.excludedPaymentTypes.map((id) => ({ id: id })) }
      : undefined
  };
  return mpFetch('/checkout/preferences', { method: 'POST', body: body, idempotencyKey: params.externalReference });
}

// Cria um pagamento PIX direto (sem passar pelo Checkout Pro) — o Mercado
// Pago devolve na hora o QR Code dinâmico (imagem base64 + código "copia e
// cola"). Usado pelo PIX presencial do Modo Vendedor, onde queremos mostrar
// o QR Code imediatamente na tela, sem redirecionar pra lugar nenhum.
async function createPixPayment(params) {
  const body = {
    transaction_amount: params.amount,
    description: params.description,
    payment_method_id: 'pix',
    external_reference: params.externalReference,
    notification_url: params.notificationUrl,
    payer: { email: params.payerEmail || 'cliente@amahbrand.com.br' }
  };
  return mpFetch('/v1/payments', { method: 'POST', body: body, idempotencyKey: params.externalReference });
}

// Consulta o estado atual de um pagamento pelo id do Mercado Pago — a fonte
// da verdade sempre é isto (nunca o corpo da notificação do webhook, que só
// avisa "algo mudou", sem garantir autenticidade do conteúdo).
async function getPayment(paymentId) {
  return mpFetch('/v1/payments/' + encodeURIComponent(paymentId));
}

module.exports = { enabled, createPreference, createPixPayment, getPayment };
