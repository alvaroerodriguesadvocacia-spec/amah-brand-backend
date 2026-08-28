# AMÁH Brand — Vitrine on-line + Backend central (Fase 10)

## O que foi analisado e integrado

O artefato enviado é a **Vitrine** — um mini-app mobile (mockup de "phone")
com duas abas: **Vitrine** (loja on-line pública, cliente navega, monta
carrinho e finaliza pelo WhatsApp) e **Loja** (ferramenta rápida da equipe
para cadastrar peça nova com foto, preço, margem e estoque inicial). Design
e paleta (rosa/champanhe/dourado, tipografia Cinzel/Cormorant/Jost) já
seguem a identidade AMÁH Brand.

Como a arquitetura da Fase 10 estava aprovada, a integração foi direto para
o backend central em vez de deixar a Vitrine com dados fixos:

- **Backend novo** (`backend/`): Node.js + Express + PostgreSQL, seguindo
  exatamente o plano do `ARQUITETURA.md` §9 — cada entidade do sistema de
  gestão (produtos, categorias, movimentações de estoque, vendas, etc.) virou
  uma tabela genérica no banco, com uma API REST autenticada por JWT que
  espelha 1:1 a API que o app local já usava (`App.db.getAll/getById/put/...`).
- **Vitrine adaptada** (`storefront/index.html`): a aba pública agora busca
  produtos e estoque reais em `GET /api/v1/public/products` (nunca expõe
  custo/margem), calculado pela mesma Regra de Ouro do Estoque. O checkout
  registra o pedido no backend (`POST /api/v1/public/orders`) além de abrir o
  WhatsApp. A aba Loja agora exige login (mesmo usuário do sistema de gestão)
  e publica peças de verdade — inclusive a foto anexada é salva no produto.
- **Ponte entre o app local e a nuvem**: o próprio exportador de Backup do
  sistema de gestão (`js/modules/backup.js`) virou o payload de sincronização
  — `backend/scripts/import-backup.js` importa qualquer backup exportado do
  app local para o banco central, sem precisar reescrever nada no frontend.

## O que foi testado (tudo passou)

- Backend isolado: login, CRUD genérico, SKU duplicado bloqueado, cálculo de
  estoque, endpoints públicos, criação de pedido pela Vitrine.
- Vitrine (Playwright, ponta a ponta): catálogo real carregado da API,
  detalhe do produto, carrinho, login na aba Loja, publicação de peça nova
  refletida na vitrine pública imediatamente.
- Ponte de sincronização: exportei um backup real do sistema de gestão (20
  produtos, 5 categorias, 19 movimentações) e importei para o backend — os
  produtos apareceram no catálogo público com o estoque correto.
- Suíte completa do sistema de gestão (Fases 1–9) rodada novamente — nenhuma
  regressão.

## Como rodar tudo localmente

```bash
# 1) Banco de dados
service postgresql start   # ou seu PostgreSQL local

# 2) Backend
cd backend
npm install
cp .env.example .env       # ajuste as credenciais
npm run seed
npm start                  # http://localhost:8787

# 3) Sistema de gestão (como sempre) — abra index.html direto no navegador

# 4) Vitrine — abra storefront/index.html direto no navegador
#    (ou sirva os dois com um servidor local; ambos funcionam via file://)
```

Por padrão a Vitrine aponta para `http://localhost:8787`. Para apontar para
outro backend, defina `window.AMAH_API_BASE` antes de abrir a página (ex.:
uma linha `<script>window.AMAH_API_BASE='https://api.amahbrand.com.br'</script>`
antes do `<script>` principal do arquivo).

## O que falta para a Vitrine ficar acessível na internet de verdade

Este backend roda hoje só dentro do meu ambiente de sessão — para o público
acessar a Vitrine e a equipe usar de qualquer lugar, ele precisa ser
publicado em um provedor de nuvem (Railway, Render, Fly.io, um VPS, etc.) com
um banco PostgreSQL de produção. Isso depende de uma conta/credenciais que só
você tem — me diga qual provedor prefere (ou se já tem um) que eu preparo o
deploy.

## O que ainda não foi migrado (próximo incremento natural da Fase 10)

As operações mais complexas do sistema de gestão (finalizar venda, receber
compra, abrir/fechar caixa, confirmar ajustes de inventário) ainda rodam
localmente contra IndexedDB — o backend por enquanto cobre autenticação,
catálogo/estoque e o CRUD genérico de todas as entidades, mais os endpoints
públicos da Vitrine. Migrar essas operações é mecânico (cada uma vira um
endpoint que replica a mesma transação, hoje em `App.db.runAtomic`, dentro de
uma transação real do PostgreSQL) e pode ser feito a qualquer momento sem
alterar as regras de negócio já validadas.
