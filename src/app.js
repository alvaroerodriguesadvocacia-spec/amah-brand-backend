/* AMÁH Brand — backend: montagem do app Express (Fase 10).
 *
 * Rotas:
 *  - /api/v1/auth/*            login do time da loja (sistema de gestão)
 *  - /api/v1/public/*          catálogo e pedidos da Vitrine (sem autenticação)
 *  - /api/v1/admin/orders/*    consulta dos pedidos da Vitrine (autenticado)
 *  - /api/v1/<store>/*         CRUD genérico por entidade (autenticado),
 *                              mesma superfície do js/db.js do frontend local
 */
'use strict';

const express = require('express');
const cors = require('cors');
const { STORE_NAMES } = require('./db');
const { createStoreRouter } = require('./genericStore');

function buildApp() {
  const app = express();

  const origins = (process.env.CORS_ORIGINS || '*').split(',').map((s) => s.trim());
  app.use(cors({ origin: origins.includes('*') ? true : origins }));
  app.use(express.json({ limit: '5mb' }));

  app.get('/api/v1/health', (req, res) => res.json({ ok: true, service: 'amah-brand-backend', time: new Date().toISOString() }));

  app.use('/api/v1/auth', require('./routes/auth'));
  app.use('/api/v1/public', require('./routes/public'));
  app.use('/api/v1/admin/orders', require('./routes/adminOrders'));
  app.use('/api/v1/operations', require('./routes/operations'));

  // Monta um router CRUD genérico e autenticado para cada store conhecida
  // (categories, products, sales, ... — ver src/db.js).
  STORE_NAMES.forEach((store) => {
    if (store === 'public_orders') return; // já tem rota dedicada (admin/orders + public/orders)
    app.use('/api/v1/' + store.replace(/_/g, '-'), createStoreRouter(store));
  });

  app.use((req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: 'Erro interno do servidor.' });
  });

  return app;
}

module.exports = { buildApp };
