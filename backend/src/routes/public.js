/* AMÁH Brand — backend: endpoints públicos (sem autenticação), consumidos
 * pela Vitrine (loja on-line). Somente leitura de catálogo + criação de
 * pedidos — nunca expõe custo, dados financeiros ou de outros clientes.
 */
'use strict';

const express = require('express');
const crypto = require('crypto');
const { pool } = require('../db');
const { calcularSaldoTodos } = require('../stock');

const router = express.Router();

// GET /api/v1/public/categories — categorias ativas (id + nome apenas).
router.get('/categories', async (req, res) => {
  try {
    const result = await pool.query('SELECT data FROM store_categories ORDER BY created_at');
    const categories = result.rows
      .map((r) => r.data)
      .filter((c) => c.active !== false)
      .map((c) => ({ id: c.id, name: c.name }));
    res.json(categories);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/public/products — catálogo ativo, com estoque calculado.
// Nunca inclui custo, margem ou fornecedor — só o que a vitrine precisa.
router.get('/products', async (req, res) => {
  try {
    const [productsResult, categoriesResult, stockMap] = await Promise.all([
      pool.query('SELECT data FROM store_products ORDER BY created_at DESC'),
      pool.query('SELECT data FROM store_categories'),
      calcularSaldoTodos()
    ]);
    const catById = {};
    categoriesResult.rows.forEach((r) => { catById[r.data.id] = r.data.name; });

    const products = productsResult.rows
      .map((r) => r.data)
      .filter((p) => p.active !== false)
      .map((p) => ({
        id: p.id,
        sku: p.sku,
        barcode: p.barcode || null,
        name: p.name,
        description: p.description || '',
        color: p.color || '',
        material: p.material || '',
        categoryId: p.categoryId || null,
        categoryName: p.categoryId ? (catById[p.categoryId] || null) : null,
        image: p.image || null,
        price: Number(p.retailPrice || 0),
        stock: Math.max(0, stockMap[p.id] || 0)
      }));

    res.json(products);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v1/public/orders — registra o carrinho fechado na Vitrine (o
// cliente é direcionado ao WhatsApp para finalizar; este registro fica
// disponível para o time confirmar/importar no sistema de gestão).
router.post('/orders', async (req, res) => {
  try {
    const body = req.body || {};
    const items = Array.isArray(body.items) ? body.items : [];
    if (items.length === 0) return res.status(400).json({ error: 'O pedido precisa ter ao menos um item.' });

    const order = {
      id: crypto.randomUUID(),
      customerName: (body.customerName || '').trim() || null,
      customerPhone: (body.customerPhone || '').trim() || null,
      items: items.map((it) => ({
        productId: it.productId || null,
        name: it.name || '',
        color: it.color || '',
        qty: Number(it.qty) || 1,
        unitPrice: Number(it.unitPrice) || 0
      })),
      total: items.reduce((s, it) => s + (Number(it.unitPrice) || 0) * (Number(it.qty) || 1), 0),
      status: 'novo', // novo -> confirmado -> convertido_em_venda | cancelado
      source: 'vitrine',
      createdAt: new Date().toISOString()
    };

    await pool.query(
      `INSERT INTO store_public_orders (id, data, updated_at) VALUES ($1, $2, now())`,
      [order.id, order]
    );
    res.status(201).json(order);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
