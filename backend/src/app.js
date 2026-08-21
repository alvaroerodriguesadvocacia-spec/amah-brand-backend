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

// Modo Vendedor (Fase D do plano) — stores inteiramente fora do alcance do
// papel 'vendedor': dados administrativos/estratégicos (fornecedores, compras,
// financeiro, contagens de inventário). Nada disso está na lista do que o
// vendedor pode ver/fazer (ver diagnóstico, seção 07).
const BLOCKED_FOR_VENDEDOR = [
  'suppliers', 'purchases', 'purchase_items', 'accounts_payable', 'accounts_receivable',
  'expenses', 'stock_counts', 'stock_count_items'
];

// Stores onde o vendedor pode LER (precisa, para vender/consultar) mas só o
// administrador pode escrever pela API genérica — o catálogo e as
// configurações são responsabilidade da gestão, não do balcão.
const ADMIN_WRITE_ONLY = ['products', 'categories', 'settings'];

// audit_logs é um caso à parte: o vendedor não deve CONSULTAR o histórico
// administrativo, mas várias telas que ele PODE usar (ex.: cadastrar
// cliente) gravam ali como efeito colateral via App.db.runAtomic — por isso
// só a leitura é bloqueada, nunca a escrita (ver genericStore.js).
const READ_BLOCKED_FOR_VENDEDOR = ['audit_logs'];

// Campos removidos das respostas para o papel 'vendedor' — nunca custo,
// margem ou valor de estoque a custo (ver diagnóstico, item "o que o
// vendedor não deve ver").
const STRIP_FOR_VENDEDOR = { products: ['cost', 'additionalCosts'] };

function buildApp() {
  const app = express();

  const origins = (process.env.CORS_ORIGINS || '*').split(',').map((s) => s.trim());
  app.use(cors({ origin: origins.includes('*') ? true : origins }));
  app.use(express.json({ limit: '5mb' }));

  app.get('/api/v1/health', (req, res) => res.json({ ok: true, service: 'amah-brand-backend', time: new Date().toISOString() }));

  app.use('/api/v1/auth', require('./routes/auth'));
  app.use('/api/v1/public', require('./routes/public'));
  app.use('/api/v1/admin/orders', require('./routes/adminOrders'));
  app.use('/api/v1/admin/users', require('./routes/users'));
  app.use('/api/v1/operations', require('./routes/operations'));

  // Monta um router CRUD genérico e autenticado para cada store conhecida
  // (categories, products, sales, ... — ver src/db.js), com as restrições de
  // papel acima aplicadas por store.
  STORE_NAMES.forEach((store) => {
    if (store === 'public_orders') return; // já tem rota dedicada (admin/orders + public/orders)
    const routerOpts = {};
    if (BLOCKED_FOR_VENDEDOR.indexOf(store) !== -1) routerOpts.blockedRoles = ['vendedor'];
    if (READ_BLOCKED_FOR_VENDEDOR.indexOf(store) !== -1) routerOpts.readBlockedRoles = ['vendedor'];
    if (ADMIN_WRITE_ONLY.indexOf(store) !== -1) routerOpts.writeRoles = ['admin'];
    if (STRIP_FOR_VENDEDOR[store]) routerOpts.stripFieldsForRoles = { vendedor: STRIP_FOR_VENDEDOR[store] };
    app.use('/api/v1/' + store.replace(/_/g, '-'), createStoreRouter(store, routerOpts));
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
