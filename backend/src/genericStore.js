/* AMÁH Brand — backend: router CRUD genérico por "store".
 *
 * Espelha 1:1 a API do frontend local (js/db.js: getAll, getById,
 * getByIndex, put, putMany, remove, clearStore) para que a troca de
 * IndexedDB por chamadas HTTP nessa camada seja mecânica, sem reescrever a
 * camada de domínio (ARQUITETURA.md §9).
 */
'use strict';

const express = require('express');
const crypto = require('crypto');
const { pool, tableName } = require('./db');
const { requireAuth } = require('./auth');

function createStoreRouter(storeName, opts) {
  opts = opts || {};
  const table = tableName(storeName);
  const router = express.Router();

  if (opts.auth !== false) {
    router.use(requireAuth);
  }

  // Bloqueia o papel inteiramente nesta store (qualquer método) — usado para
  // dados administrativos/estratégicos que o Modo Vendedor não deve alcançar
  // nem por chamada direta à API (fornecedores, compras, financeiro, auditoria).
  if (opts.blockedRoles && opts.blockedRoles.length) {
    router.use((req, res, next) => {
      if (req.user && opts.blockedRoles.indexOf(req.user.role) !== -1) {
        return res.status(403).json({ error: 'Acesso restrito para o seu perfil de usuário.' });
      }
      next();
    });
  }

  // Remove campos sensíveis da resposta conforme o papel do usuário (ex.:
  // custo/margem de produtos escondidos do papel 'vendedor'). Não é a única
  // linha de defesa — writeRoles/blockedRoles cobrem escrita e stores inteiras.
  function stripForRole(role, data) {
    const fields = opts.stripFieldsForRoles && opts.stripFieldsForRoles[role];
    if (!fields || !fields.length || !data) return data;
    const copy = Object.assign({}, data);
    fields.forEach((f) => { delete copy[f]; });
    return copy;
  }

  // Bloqueia LEITURA para o papel, mas mantém escrita liberada — usado em
  // audit_logs: o vendedor não deve conseguir consultar o histórico
  // administrativo, mas ações que ele tem permissão de fazer (ex.: cadastrar
  // cliente) continuam gerando um registro de auditoria nos bastidores
  // (App.db.runAtomic grava em audit_logs como efeito colateral de várias
  // telas — bloquear a escrita quebraria essas ações sem relação nenhuma
  // com "ver o histórico administrativo").
  function requireReadRole(req, res, next) {
    if (opts.readBlockedRoles && opts.readBlockedRoles.indexOf(req.user && req.user.role) !== -1) {
      return res.status(403).json({ error: 'Acesso restrito para o seu perfil de usuário.' });
    }
    next();
  }

  // GET /?index=indexName&value=algumValor  -> equivalente a getByIndex
  // GET /                                    -> equivalente a getAll
  router.get('/', requireReadRole, async (req, res) => {
    try {
      let rows;
      if (req.query.index && req.query.value !== undefined) {
        const result = await pool.query(
          `SELECT id, data FROM ${table} WHERE data->>$1 = $2 ORDER BY created_at`,
          [req.query.index, req.query.value]
        );
        rows = result.rows.map((r) => r.data);
      } else {
        const result = await pool.query(`SELECT id, data FROM ${table} ORDER BY created_at`);
        rows = result.rows.map((r) => r.data);
      }
      const role = req.user && req.user.role;
      res.json(rows.map((d) => stripForRole(role, d)));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /:id -> equivalente a getById
  router.get('/:id', requireReadRole, async (req, res) => {
    try {
      const result = await pool.query(`SELECT data FROM ${table} WHERE id = $1`, [req.params.id]);
      if (!result.rows[0]) return res.status(404).json({ error: 'Registro não encontrado.' });
      res.json(stripForRole(req.user && req.user.role, result.rows[0].data));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Middleware de escrita: se a store define writeRoles, só esses papéis podem
  // criar/alterar/excluir — os demais continuam podendo ler (GET acima).
  function requireWriteRole(req, res, next) {
    if (opts.writeRoles && opts.writeRoles.length) {
      if (!req.user || opts.writeRoles.indexOf(req.user.role) === -1) {
        return res.status(403).json({ error: 'Seu perfil de usuário não pode alterar estes dados.' });
      }
    }
    next();
  }

  // POST / -> cria (gera id se ausente); PUT /:id -> upsert -> equivalente a put
  async function upsert(id, record, res) {
    const finalRecord = Object.assign({}, record, { id });
    await pool.query(
      `INSERT INTO ${table} (id, data, updated_at) VALUES ($1, $2, now())
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
      [id, finalRecord]
    );
    res.json(finalRecord);
  }

  router.post('/', requireWriteRole, async (req, res) => {
    try {
      const id = req.body.id || crypto.randomUUID();
      await upsert(id, req.body, res);
    } catch (err) {
      res.status(err.code === '23505' ? 409 : 500).json({ error: friendlyConflict(err, storeName) });
    }
  });

  router.put('/:id', requireWriteRole, async (req, res) => {
    try {
      await upsert(req.params.id, req.body, res);
    } catch (err) {
      res.status(err.code === '23505' ? 409 : 500).json({ error: friendlyConflict(err, storeName) });
    }
  });

  // POST /bulk -> equivalente a putMany
  router.post('/bulk', requireWriteRole, async (req, res) => {
    const records = Array.isArray(req.body) ? req.body : req.body.records;
    if (!Array.isArray(records)) return res.status(400).json({ error: 'Envie um array de registros.' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const record of records) {
        const id = record.id || crypto.randomUUID();
        const finalRecord = Object.assign({}, record, { id });
        await client.query(
          `INSERT INTO ${table} (id, data, updated_at) VALUES ($1, $2, now())
           ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
          [id, finalRecord]
        );
      }
      await client.query('COMMIT');
      res.json({ count: records.length });
    } catch (err) {
      await client.query('ROLLBACK');
      res.status(500).json({ error: err.message });
    } finally {
      client.release();
    }
  });

  // DELETE /:id -> equivalente a remove
  router.delete('/:id', requireWriteRole, async (req, res) => {
    try {
      await pool.query(`DELETE FROM ${table} WHERE id = $1`, [req.params.id]);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE / -> equivalente a clearStore (uso administrativo/backup — cuidado)
  router.delete('/', requireWriteRole, async (req, res) => {
    try {
      await pool.query(`DELETE FROM ${table}`);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

function friendlyConflict(err, storeName) {
  if (err.code === '23505') {
    if (storeName === 'products') return 'Já existe um produto cadastrado com este SKU.';
    if (storeName === 'sales') return 'Já existe uma venda com este número.';
    return 'Registro duplicado (violação de restrição única).';
  }
  return err.message;
}

module.exports = { createStoreRouter };
