/* AMÁH Brand — backend: pool de conexão PostgreSQL + lista de "stores"
 * (entidades). Os nomes abaixo espelham exatamente as stores do IndexedDB do
 * app local (js/db.js), para que a troca de IndexedDB por esta API no
 * frontend seja mecânica (ver ARQUITETURA.md, seção 9).
 */
'use strict';

const { Pool } = require('pg');

// Bancos remotos (Render, Railway etc.) normalmente exigem SSL; localhost não.
// rejectUnauthorized:false porque esses provedores usam certificados que a
// cadeia de confiança padrão do Node não reconhece — é a configuração
// recomendada pelo próprio Render para conexões vindas de fora da rede interna.
var connectionString = process.env.DATABASE_URL;
var isLocal = /localhost|127\.0\.0\.1/.test(connectionString || '');
var pool = new Pool({
  connectionString: connectionString,
  ssl: isLocal ? false : { rejectUnauthorized: false }
});

// Mesma lista de entidades do js/db.js (frontend), mais "public_orders",
// que é nova nesta fase (pedidos recebidos pela Vitrine on-line).
const STORE_NAMES = [
  'settings',
  'categories',
  'suppliers',
  'products',
  'inventory_movements',
  'audit_logs',
  'customers',
  'sales',
  'sale_items',
  'payments',
  'accounts_receivable',
  'accounts_payable',
  'expenses',
  'cash_sessions',
  'cash_movements',
  'purchases',
  'purchase_items',
  'stock_counts',
  'stock_count_items',
  'public_orders',
  // Cobranças Mercado Pago (Fase "Pagamentos automáticos", 2026-08-28): uma
  // linha por tentativa de cobrança PIX/cartão/boleto, tanto da Vitrine
  // quanto do Modo Vendedor presencial. Rota dedicada (não CRUD genérico —
  // ver app.js), pra nunca expor isto sem autenticação nem deixar o
  // frontend inventar/editar o status de um pagamento diretamente.
  'mp_charges'
];

function tableName(store) {
  return 'store_' + store;
}

// Envolve uma função numa transação real do Postgres: BEGIN antes, COMMIT se
// resolver, ROLLBACK se lançar — mesmo padrão do txRoute() de operations.js,
// mas utilizável fora de uma rota Express (ex.: pelo webhook de pagamento,
// que precisa da mesma atomicidade/trava de linha ao converter uma cobrança
// confirmada numa venda de verdade, mas não é chamado por um cliente HTTP
// autenticado como as rotas de operations.js).
async function withTransaction(handler) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await handler(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, STORE_NAMES, tableName, withTransaction };
