/* AMÁH Brand — backend: gestão de usuários do time (Modo Vendedor, Fase A).
 * Rotas administrativas para cadastrar vendedores (role='vendedor') e demais
 * contas da equipe. A tabela `users` já existia desde a Fase 10 (auth.js);
 * este arquivo só expõe o CRUD que faltava — antes só existia via seed/script.
 * Nunca devolve password_hash.
 */
'use strict';

const express = require('express');
const crypto = require('crypto');
const { pool } = require('../db');
const { requireAuth, requireRole, hashPassword } = require('../auth');

const router = express.Router();
router.use(requireAuth, requireRole('admin'));

function publicUser(row) {
  return { id: row.id, email: row.email, name: row.name, role: row.role, active: row.active, createdAt: row.created_at };
}

router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM users ORDER BY created_at');
    res.json(result.rows.map(publicUser));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { email, password, name, role } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Informe e-mail e senha.' });
    if (String(password).length < 6) return res.status(400).json({ error: 'A senha precisa ter ao menos 6 caracteres.' });
    const finalRole = role === 'vendedor' ? 'vendedor' : 'admin';
    const id = crypto.randomUUID();
    const passwordHash = await hashPassword(password);
    const result = await pool.query(
      'INSERT INTO users (id, email, password_hash, name, role, active) VALUES ($1,$2,$3,$4,$5,true) RETURNING *',
      [id, String(email).toLowerCase().trim(), passwordHash, name || '', finalRole]
    );
    res.json(publicUser(result.rows[0]));
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Já existe um usuário com este e-mail.' });
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const { name, role, active, password } = req.body || {};
    const existing = await pool.query('SELECT * FROM users WHERE id = $1', [req.params.id]);
    if (!existing.rows[0]) return res.status(404).json({ error: 'Usuário não encontrado.' });

    const fields = [];
    const values = [];
    let i = 1;
    if (name !== undefined) { fields.push(`name = $${i++}`); values.push(name); }
    if (role !== undefined) { fields.push(`role = $${i++}`); values.push(role === 'vendedor' ? 'vendedor' : 'admin'); }
    if (active !== undefined) { fields.push(`active = $${i++}`); values.push(!!active); }
    if (password) {
      if (String(password).length < 6) return res.status(400).json({ error: 'A senha precisa ter ao menos 6 caracteres.' });
      fields.push(`password_hash = $${i++}`);
      values.push(await hashPassword(password));
    }
    if (!fields.length) return res.json(publicUser(existing.rows[0]));

    values.push(req.params.id);
    const result = await pool.query(`UPDATE users SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`, values);
    res.json(publicUser(result.rows[0]));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
