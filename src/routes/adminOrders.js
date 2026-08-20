/* AMÁH Brand — backend: consulta administrativa dos pedidos recebidos pela
 * Vitrine (autenticado — só o time da loja vê). Confirmação/edição de status
 * feita aqui; a conversão para venda real no sistema de gestão é manual por
 * enquanto (o operador confere o pedido e lança a venda no PDV normalmente).
 */
'use strict';

const express = require('express');
const { pool } = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT data FROM store_public_orders ORDER BY created_at DESC');
    res.json(result.rows.map((r) => r.data));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id/status', async (req, res) => {
  try {
    const { status } = req.body || {};
    const allowed = ['novo', 'confirmado', 'convertido_em_venda', 'cancelado'];
    if (!allowed.includes(status)) return res.status(400).json({ error: 'Status inválido.' });
    const existing = await pool.query('SELECT data FROM store_public_orders WHERE id = $1', [req.params.id]);
    if (!existing.rows[0]) return res.status(404).json({ error: 'Pedido não encontrado.' });
    const updated = Object.assign({}, existing.rows[0].data, { status });
    await pool.query('UPDATE store_public_orders SET data = $1, updated_at = now() WHERE id = $2', [updated, req.params.id]);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
