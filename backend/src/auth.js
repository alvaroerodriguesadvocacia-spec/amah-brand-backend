/* AMÁH Brand — backend: autenticação JWT (Fase 10, ARQUITETURA.md §9). */
'use strict';

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-nao-use-em-producao';
const TOKEN_TTL = '12h';

function hashPassword(plain) {
  return bcrypt.hash(plain, 10);
}

function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

function signToken(user) {
  return jwt.sign({ sub: user.id, email: user.email, role: user.role, name: user.name }, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

async function findUserByEmail(email) {
  const result = await pool.query('SELECT * FROM users WHERE email = $1', [String(email || '').toLowerCase()]);
  return result.rows[0] || null;
}

// Middleware: exige um token válido em "Authorization: Bearer <token>".
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const parts = header.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return res.status(401).json({ error: 'Autenticação necessária. Envie o token no cabeçalho Authorization.' });
  }
  try {
    const payload = jwt.verify(parts[1], JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido ou expirado. Faça login novamente.' });
  }
}

// Middleware: exige que o usuário autenticado tenha um dos papéis informados.
// Deve vir DEPOIS de requireAuth na cadeia de middlewares. Base do Modo
// Vendedor (item 25 do diagnóstico) — administrador tem acesso total; outros
// papéis (ex.: 'vendedor') só passam pelas rotas explicitamente liberadas.
function requireRole() {
  var roles = Array.prototype.slice.call(arguments);
  return function (req, res, next) {
    if (!req.user || roles.indexOf(req.user.role) === -1) {
      return res.status(403).json({ error: 'Acesso restrito. Esta ação exige o perfil: ' + roles.join(' ou ') + '.' });
    }
    next();
  };
}

module.exports = { hashPassword, verifyPassword, signToken, findUserByEmail, requireAuth, requireRole, JWT_SECRET };
