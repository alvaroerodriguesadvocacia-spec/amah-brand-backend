/* AMÁH Brand — backend: ponto de entrada do servidor HTTP. */
'use strict';

require('dotenv').config();
const { migrate } = require('./migrate');
const { buildApp } = require('./app');

const PORT = process.env.PORT || 8787;

migrate()
  .then(() => {
    const app = buildApp();
    app.listen(PORT, () => {
      console.log('[server] AMÁH Brand backend rodando em http://localhost:' + PORT);
    });
  })
  .catch((err) => {
    console.error('[server] Falha ao migrar o schema do banco:', err);
    process.exit(1);
  });
