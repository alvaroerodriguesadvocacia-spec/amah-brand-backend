/* AMÁH Brand — backend: pool de conexão PostgreSQL + lista de "stores"
 * (entidades). Os nomes abaixo espelham exatamente as stores do IndexedDB do
 * app local (js/db.js), para que a troca de IndexedDB por esta API no
 * frontend seja mecânica (ver ARQUITETURA.md, seção 9).
 */
'use strict';

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
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
  'public_orders'
];

function tableName(store) {
  return 'store_' + store;
}

module.exports = { pool, STORE_NAMES, tableName };
