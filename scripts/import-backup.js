#!/usr/bin/env node
/* AMÁH Brand — backend: importa um backup .json exportado pelo módulo
 * Backup do sistema de gestão local (js/modules/backup.js) para o banco
 * central. É a "ponte" entre o app local (IndexedDB) e a nuvem (Fase 10):
 * o mesmo formato de arquivo que já existia para backup/restauração vira o
 * payload de sincronização, exatamente como previsto em ARQUITETURA.md §8.
 *
 * Uso:
 *   node scripts/import-backup.js caminho/para/backup.json [--api http://localhost:8787]
 *
 * Requer as variáveis ADMIN_EMAIL / ADMIN_PASSWORD do .env (mesmo usuário
 * criado pelo `npm run seed`).
 */
'use strict';

require('dotenv').config();
const fs = require('fs');
const path = require('path');

async function main() {
  const args = process.argv.slice(2);
  const filePath = args.find((a) => !a.startsWith('--'));
  const apiFlagIdx = args.indexOf('--api');
  const apiBase = apiFlagIdx !== -1 ? args[apiFlagIdx + 1] : (process.env.API_BASE || 'http://localhost:8787');

  if (!filePath) {
    console.error('Uso: node scripts/import-backup.js caminho/para/backup.json [--api http://host:porta]');
    process.exit(1);
  }

  const raw = fs.readFileSync(path.resolve(filePath), 'utf8');
  const payload = JSON.parse(raw);
  if (!payload || !payload.data) {
    console.error('Arquivo inválido: seção "data" ausente (não parece um backup do AMÁH Brand).');
    process.exit(1);
  }

  console.log('[import] backup de', payload.exportedAt, '— sistema:', payload.system || '(desconhecido)');

  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    console.error('Defina ADMIN_EMAIL e ADMIN_PASSWORD no .env (mesmas credenciais do `npm run seed`).');
    process.exit(1);
  }

  const loginResp = await fetch(apiBase + '/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  if (!loginResp.ok) {
    console.error('Falha no login:', await loginResp.text());
    process.exit(1);
  }
  const { token } = await loginResp.json();

  const storeNames = Object.keys(payload.data);
  let totalImported = 0;

  for (const store of storeNames) {
    const records = payload.data[store];
    if (!Array.isArray(records) || records.length === 0) continue;
    const urlStore = store.replace(/_/g, '-');
    const resp = await fetch(apiBase + '/api/v1/' + urlStore + '/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify(records)
    });
    if (!resp.ok) {
      console.error('  ✗', store, '—', await resp.text());
      continue;
    }
    const result = await resp.json();
    totalImported += result.count || 0;
    console.log('  ✓', store, '—', result.count, 'registro(s)');
  }

  console.log('[import] concluído —', totalImported, 'registros importados de', storeNames.length, 'entidades.');
}

main().catch((err) => { console.error('[import] erro:', err); process.exit(1); });
