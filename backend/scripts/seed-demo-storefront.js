#!/usr/bin/env node
/* AMÁH Brand — semeia produtos de demonstração na Vitrine (mesmos textos do
 * artefato de design original da marca), para testar a loja on-line já
 * conectada ao backend antes de publicar peças reais.
 *
 * Uso: node scripts/seed-demo-storefront.js [--api http://localhost:8787]
 */
'use strict';

require('dotenv').config();

const PRODUCTS = [
  { sku: 'DEMO-BR001', name: 'Brinco Argola Dourada', price: 49.90, cost: 18, color: 'Dourado', qty: 8,
    description: 'Porque tem mulher que não precisa de muito para preencher um ambiente — basta ela entrar.\nFeita em aço inoxidável, acompanha a sua rotina sem pedir cuidado: não escurece, não irrita a pele e mantém o brilho no banho, no mar, no correr do dia.\nDourada e leve, vai do jeans com camiseta ao vestido de uma noite especial. É da mulher refinada, mas próxima — que carrega presença sem esforço.' },
  { sku: 'DEMO-CL001', name: 'Colar Ponto de Luz', price: 79.90, cost: 28, color: 'Prata', qty: 5,
    description: 'Porque toda mulher merece um brilho discreto que fala por ela.\nEm prata com zircônia, delicado e resistente, é do tipo que você põe e esquece que está usando — até alguém reparar.\nDo trabalho ao jantar, acompanha a mulher que sabe que menos, quando é bem escolhido, é mais.' },
  { sku: 'DEMO-BL001', name: 'Bolsa de Palha Manu', price: 189.90, cost: 70, color: 'Palha natural', qty: 3,
    description: 'Porque leveza também é uma forma de elegância.\nEstruturada em palha natural com alça de couro ecológico, carrega o essencial com charme e nenhum esforço.\nÉ da mulher que transforma um dia comum em passeio — e que sabe que estilo mora na naturalidade.' },
  { sku: 'DEMO-OC001', name: 'Óculos Gatinho', price: 129.90, cost: 45, color: 'Tartaruga', qty: 2,
    description: 'Porque atitude também é acessório.\nArmação gatinho com proteção UV400: charme retrô que protege o olhar e emoldura o rosto.\nPra mulher que gosta de ser lembrada — e que entra em qualquer lugar como se o sol fosse dela.' },
  { sku: 'DEMO-AN001', name: 'Anel Solitário Cristal', price: 39.90, cost: 14, color: 'Dourado', qty: 12,
    description: 'Porque são os pequenos detalhes que revelam quem você é.\nAjustável, com cristal lapidado que capta a luz a cada gesto, veste qualquer dedo e qualquer dia.\nDa mulher que não precisa de excesso pra brilhar — só de presença.' },
  { sku: 'DEMO-PR001', name: 'Presilha Pérola', price: 24.90, cost: 9, color: 'Off-white', qty: 2,
    description: 'Porque até prender o cabelo pode ser um gesto de cuidado consigo.\nPresilha francesa com pérolas, delicada e firme, que transforma um coque simples em detalhe de revista.\nPra mulher que acredita que elegância está nas coisas pequenas, feitas com intenção.' }
];

async function main() {
  const apiFlagIdx = process.argv.indexOf('--api');
  const apiBase = apiFlagIdx !== -1 ? process.argv[apiFlagIdx + 1] : (process.env.API_BASE || 'http://localhost:8787');

  const loginResp = await fetch(apiBase + '/api/v1/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD })
  });
  if (!loginResp.ok) { console.error('Login falhou:', await loginResp.text()); process.exit(1); }
  const { token } = await loginResp.json();
  const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token };

  for (const p of PRODUCTS) {
    const resp = await fetch(apiBase + '/api/v1/products', {
      method: 'POST', headers,
      body: JSON.stringify({
        sku: p.sku, name: p.name, retailPrice: p.price, cost: p.cost, color: p.color,
        description: p.description, active: true, createdAt: new Date().toISOString()
      })
    });
    if (!resp.ok) {
      const err = await resp.json();
      console.log('  ~', p.name, '— já existe ou erro:', err.error);
      continue;
    }
    const created = await resp.json();
    await fetch(apiBase + '/api/v1/inventory-movements', {
      method: 'POST', headers,
      body: JSON.stringify({ productId: created.id, type: 'ENTRADA_INICIAL', quantity: p.qty, reason: 'Estoque inicial de demonstração', createdAt: new Date().toISOString() })
    });
    console.log('  ✓', p.name, '— estoque inicial', p.qty);
  }
  console.log('[seed-demo-storefront] concluído.');
}

main().catch((err) => { console.error(err); process.exit(1); });
