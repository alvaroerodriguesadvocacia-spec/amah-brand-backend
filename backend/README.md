# AMÁH Brand — Backend (Fase 10)

API central em Node.js + Express + PostgreSQL, compartilhada pelo sistema de
gestão interno e pela Vitrine (loja on-line). Implementa a arquitetura
aprovada em `ARQUITETURA.md` §9: cada "store" do frontend local (IndexedDB)
vira uma tabela genérica `store_<nome>` (`id`, `data JSONB`), o que torna a
troca de IndexedDB por chamadas HTTP mecânica, sem reescrever a camada de
domínio do app.

## Como rodar localmente

Pré-requisitos: Node.js 18+ e PostgreSQL rodando (local ou remoto).

```bash
cd backend
npm install
cp .env.example .env        # ajuste DATABASE_URL, JWT_SECRET, ADMIN_EMAIL/PASSWORD
npm run seed                 # cria o schema + usuário administrador + configurações padrão
npm start                    # sobe a API em http://localhost:8787
```

Dica: se a senha do admin tiver `#` ou espaços, coloque-a entre aspas no
`.env` — o `dotenv` trata `#` fora de aspas como início de comentário.

## Rotas

- `GET  /api/v1/health` — verificação de disponibilidade.
- `POST /api/v1/auth/login` — login do time da loja (e-mail/senha) → token JWT.
- `GET  /api/v1/auth/me` — dados do usuário autenticado.
- `GET  /api/v1/public/products` — catálogo público (produtos ativos, com
  estoque calculado a partir das movimentações — nunca custo/margem). Inclui
  `whyAmahr` (texto "Por que você vai Amáhr", gerado no sistema de gestão —
  ver `js/core/whyAmahrEngine.js` no frontend; vem vazio até a equipe gerar
  ou aprovar um texto para o produto).
- `GET  /api/v1/public/categories` — categorias ativas.
- `POST /api/v1/public/orders` — registra um pedido fechado na Vitrine.
- `GET  /api/v1/admin/orders` (autenticado) — lista os pedidos da Vitrine.
- `PATCH /api/v1/admin/orders/:id/status` (autenticado) — atualiza status do pedido.
- `/api/v1/<store>` (autenticado) — CRUD genérico por entidade, uma rota por
  store do `js/db.js` do frontend (ex.: `/api/v1/products`,
  `/api/v1/sales`, `/api/v1/inventory-movements`, ...):
  - `GET /` — lista tudo (equivalente a `getAll`)
  - `GET /?index=campo&value=x` — filtra por campo (equivalente a `getByIndex`)
  - `GET /:id` — busca um (equivalente a `getById`)
  - `POST /` / `PUT /:id` — cria/atualiza (equivalente a `put`)
  - `POST /bulk` — cria/atualiza em lote (equivalente a `putMany`)
  - `DELETE /:id` — remove (equivalente a `remove`)
  - `DELETE /` — limpa a entidade inteira (equivalente a `clearStore` — uso administrativo)

## Ponte com o app local (sincronização via backup)

O módulo **Backup** do sistema de gestão local (`js/modules/backup.js`) já
exporta todos os dados em um único JSON versionado — pensado desde a Fase 1
para também servir de payload de sincronização (ver `ARQUITETURA.md` §8).

Para levar os dados de uma instalação local para o backend central:

```bash
# 1. No sistema de gestão (navegador), vá em Backup → Exportar backup (.json)
# 2. Rode:
cd backend
node scripts/import-backup.js caminho/para/o-backup-exportado.json
```

O script faz login com as credenciais do `.env` e importa cada entidade via
`POST /bulk`.

## Dados de demonstração da Vitrine

```bash
node scripts/seed-demo-storefront.js
```

Cria 6 peças de exemplo (com os mesmos textos do artefato de design
original da marca) para testar a loja on-line rapidamente.

## Operações atômicas (`/api/v1/operations/*`, autenticado)

Além do CRUD genérico, o backend agora também expõe as operações complexas
do sistema de gestão — as mesmas regras de `js/core/*Engine.js`, só que
rodando dentro de uma transação real do PostgreSQL (`BEGIN` / `SELECT ...
FOR UPDATE` nas linhas envolvidas / `COMMIT` ou `ROLLBACK`) em vez de uma
transação do IndexedDB. Isso é o que permite duas pessoas usarem o PDV ao
mesmo tempo sem o estoque ou os contadores (número da venda, da compra)
ficarem inconsistentes.

- `POST /sales/finalize`, `POST /sales/:id/cancel`, `POST /sales/items/:id/return`
- `POST /purchases`, `POST /purchases/:id/receive`, `POST /purchases/:id/cancel`
- `GET /cash/open-session`, `POST /cash/open`, `POST /cash/movement`, `POST /cash/:id/close`
- `POST /inventory/count/start`, `POST /inventory/count/:id/reading`,
  `GET /inventory/count/:id/divergences`, `POST /inventory/count/:id/confirm-adjustments`,
  `POST /inventory/count/:id/finish`

Cada uma valida exatamente as mesmas regras do app local (estoque
insuficiente, pagamentos que não batem com o total, caixa já aberto/fechado,
compra já recebida, etc.) e devolve os mesmos formatos de erro em
português. Testado ponta a ponta (`/tmp/test-operations.js` no ambiente de
build): venda com baixa de estoque, tentativa de venda além do estoque
(rejeitada), cancelamento com estorno de estoque, recebimento parcial de
compra, ajuste de inventário por divergência e fechamento de caixa com
cálculo de diferença — tudo bateu com o esperado.

O frontend local (`js/core/*Engine.js`) continua funcionando sozinho contra
o IndexedDB — ele não foi alterado. Ligar o sistema de gestão a estas rotas
(pra virar multiusuário de verdade) é a próxima etapa, e é uma troca
mecânica: cada `App.db.runAtomic(...)` vira uma chamada HTTP para o endpoint
equivalente acima.

## Deploy em produção

Este backend está pronto para rodar atrás de qualquer provedor Node.js +
PostgreSQL (Railway, Render, Fly.io, um VPS próprio, etc.). Antes de publicar
na internet:

1. Gere um `JWT_SECRET` novo e aleatório (`openssl rand -hex 32`).
2. Troque a senha do admin.
3. Restrinja `CORS_ORIGINS` aos domínios reais da Vitrine e do sistema de
   gestão (nunca deixe `*` em produção).
4. Ative TLS (HTTPS) — a maioria dos provedores faz isso automaticamente.

A escolha de provedor e o deploy em si dependem de uma conta/credenciais que
só você tem — este backend fica pronto para ser implantado assim que
decidirmos onde.
