/* AMÁH Brand — backend: cria o usuário administrador inicial (idempotente) e
 * garante as configurações padrão (formas de pagamento, categorias de
 * despesa) — mesmos defaults do js/modules/settings.js do frontend local.
 */
'use strict';

require('dotenv').config();
const crypto = require('crypto');
const { migrate } = require('./migrate');
const { pool } = require('./db');
const { hashPassword, findUserByEmail } = require('./auth');

const DEFAULT_EXPENSE_CATEGORIES = ['Aluguel', 'Energia/Água/Internet', 'Embalagens', 'Marketing/Anúncios', 'Frete', 'Manutenção', 'Impostos/Taxas', 'Outros'];
const DEFAULT_PAYMENT_METHODS = [
  { name: 'Dinheiro', feePercent: 0 },
  { name: 'PIX', feePercent: 0 },
  { name: 'Débito', feePercent: 1.5 },
  { name: 'Crédito à vista', feePercent: 3.49 },
  { name: 'Crédito parcelado', feePercent: 4.99 },
  { name: 'Boleto', feePercent: 0 },
  { name: 'Venda a prazo', feePercent: 0 },
  { name: 'Outros', feePercent: 0 }
];

async function ensureAdminUser() {
  const email = (process.env.ADMIN_EMAIL || 'admin@amahbrand.com.br').toLowerCase();
  const existing = await findUserByEmail(email);
  if (existing) {
    console.log('[seed] Usuário admin já existe:', email);
    return;
  }
  const passwordHash = await hashPassword(process.env.ADMIN_PASSWORD || 'troque-esta-senha');
  await pool.query(
    'INSERT INTO users (id, email, password_hash, name, role, active) VALUES ($1,$2,$3,$4,$5,true)',
    [crypto.randomUUID(), email, passwordHash, process.env.ADMIN_NAME || 'Administrador', 'admin']
  );
  console.log('[seed] Usuário admin criado:', email);
}

async function ensureSettings() {
  const rows = await pool.query('SELECT id FROM store_settings');
  const existingIds = new Set(rows.rows.map((r) => r.id));

  if (!existingIds.has('company')) {
    await pool.query('INSERT INTO store_settings (id, data) VALUES ($1,$2)', [
      'company',
      { id: 'company', name: 'AMÁH Brand', cnpjCpf: '', phone: '', email: '', address: '' }
    ]);
  }
  if (!existingIds.has('expense_categories')) {
    await pool.query('INSERT INTO store_settings (id, data) VALUES ($1,$2)', [
      'expense_categories',
      { id: 'expense_categories', items: DEFAULT_EXPENSE_CATEGORIES.map((n) => ({ id: crypto.randomUUID(), name: n, active: true })) }
    ]);
  }
  if (!existingIds.has('payment_methods')) {
    await pool.query('INSERT INTO store_settings (id, data) VALUES ($1,$2)', [
      'payment_methods',
      { id: 'payment_methods', items: DEFAULT_PAYMENT_METHODS.map((m) => ({ id: crypto.randomUUID(), name: m.name, feePercent: m.feePercent, active: true })) }
    ]);
  }
  console.log('[seed] Configurações padrão OK.');
}

async function main() {
  await migrate();
  await ensureAdminUser();
  await ensureSettings();
  await pool.end();
}

if (require.main === module) {
  main().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
}

module.exports = { main };
