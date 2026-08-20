/* AMÁH Brand — backend: login/sessão do sistema de gestão (admin). */
'use strict';

const express = require('express');
const { findUserByEmail, verifyPassword, signToken, requireAuth } = require('../auth');

const router = express.Router();

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Informe e-mail e senha.' });
    const user = await findUserByEmail(email);
    if (!user || !user.active) return res.status(401).json({ error: 'Usuário ou senha inválidos.' });
    const ok = await verifyPassword(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Usuário ou senha inválidos.' });
    const token = signToken(user);
    res.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ id: req.user.sub, email: req.user.email, name: req.user.name, role: req.user.role });
});

module.exports = router;
