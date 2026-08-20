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

  // GET /?index=indexName&value=algumValor  -> equivalente a getByIndex
  // GET /                                    -> equivalente a getAll
  router.get('/', async (req, res) => {
    try {
      if (req.query.index && req.query.value !== undefined) {
        const result = await pool.query(
          `SELECT id, data FROM ${table} WHERE data->>$1 = $2 ORDER BY created_at`,
          [req.query.index, req.query.value]
        );
        return res.json(result.rows.map((r) => r.data));
      }
      const result = await pool.query(`SELECT id, data FROM ${table} ORDER BY created_at`);
      res.json(result.rows.map((r) => r.data));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /:id -> equivalente a getById
  router.get('/:id', async (req, res) => {
    try {
      const result = await pool.query(`SELECT data FROM ${table} WHERE id = $1`, [req.params.id]);
      if (!result.rows[0]) return res.status(404).json({ error: 'Registro não encontrado.' });
      res.json(result.rows[0].data);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

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

  router.post('/', async (req, res) => {
    try {
      const id = req.body.id || crypto.randomUUID();
      await upsert(id, req.body, res);
    } catch (err) {
      res.status(err.code === '23505' ? 409 : 500).json({ error: friendlyConflict(err, storeName) });
    }
  });

  router.put('/:id', async (req, res) => {
    try {
      await upsert(req.params.id, req.body, res);
    } catch (err) {
      res.status(err.code === '23505' ? 409 : 500).json({ error: friendlyConflict(err, storeName) });
    }
  });

  // POST /bulk -> equivalente a putMany
  router.post('/bulk', async (req, res) => {
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
  router.delete('/:id', async (req, res) => {
    try {
      await pool.query(`DELETE FROM ${table} WHERE id = $1`, [req.params.id]);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE / -> equivalente a clearStore (uso administrativo/backup — cuidado)
  router.delete('/', async (req, res) => {
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
