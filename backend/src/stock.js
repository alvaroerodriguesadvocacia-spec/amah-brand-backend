/* AMÁH Brand — backend: cálculo de saldo de estoque a partir de
 * inventory_movements — mesma "Regra de Ouro do Estoque" do frontend
 * (js/core/stockEngine.js): o saldo nunca é um campo gravável, é sempre a
 * soma das movimentações.
 */
'use strict';

const { pool } = require('./db');

const TIPOS = {
  ENTRADA_COMPRA: 1,
  ENTRADA_DEVOLUCAO: 1,
  ENTRADA_AJUSTE: 1,
  ENTRADA_INICIAL: 1,
  SAIDA_VENDA: -1,
  SAIDA_PERDA: -1,
  SAIDA_AVARIA: -1,
  SAIDA_AJUSTE: -1,
  ESTORNO_VENDA: 1,
  ESTORNO_COMPRA: -1
};

// Retorna um mapa { productId: saldo } calculado a partir de todas as
// movimentações registradas.
async function calcularSaldoTodos() {
  const result = await pool.query('SELECT data FROM store_inventory_movements');
  const map = {};
  for (const row of result.rows) {
    const m = row.data;
    const sinal = TIPOS[m.type] || 0;
    map[m.productId] = (map[m.productId] || 0) + sinal * Number(m.quantity || 0);
  }
  return map;
}

async function calcularSaldo(productId) {
  const result = await pool.query("SELECT data FROM store_inventory_movements WHERE data->>'productId' = $1", [productId]);
  return result.rows.reduce((sum, row) => sum + (TIPOS[row.data.type] || 0) * Number(row.data.quantity || 0), 0);
}

module.exports = { TIPOS, calcularSaldoTodos, calcularSaldo };
