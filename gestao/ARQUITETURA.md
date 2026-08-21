# AMÁH Brand — Análise Arquitetural e Plano de Fases

Versão do documento: 1.0 · Data: 19/08/2026 · Status: Fase 1 (Fundação) em entrega

## 1. Arquitetura proposta

Aplicação web local, single-page, sem framework pesado (JS puro modular, "vanilla"), organizada em três camadas:

- **Camada de apresentação** (`js/app.js`, `js/router.js`, `js/modules/*.js`): renderização de views, formulários, tabelas e modais. Cada módulo é uma IIFE que expõe um objeto no namespace global `App.modules.<nome>` — evita módulos ES nativos (que exigem servidor HTTP para funcionar via `file://`) e mantém o sistema executável apenas abrindo o `index.html`.
- **Camada de domínio/regras de negócio** (`js/core/*.js`): funções puras que aplicam as regras de estoque, precificação, margem e validação. Nenhuma tela manipula dados diretamente — sempre passa pela camada de domínio, que é a única autorizada a gravar nas entidades sensíveis (ex.: estoque só muda por meio de `StockEngine.registrarMovimentacao()`).
- **Camada de persistência** (`js/db.js`): wrapper sobre IndexedDB (`BijouDB`), com stores equivalentes às entidades centralizadas do item 53 da especificação. Toda a camada de domínio fala apenas com essa API — nunca com IndexedDB diretamente — para que a troca futura por chamadas HTTP/API REST não exija reescrever regra de negócio, apenas a implementação de `db.js`.

Motivo da escolha de IndexedDB (e não apenas `localStorage`): `localStorage` é síncrono, limitado a ~5–10MB, armazena só strings e não suporta índices — inadequado para milhares de produtos/movimentações (requisito 50). IndexedDB é assíncrono, indexado, tolera dezenas de MB e tem semântica de transação, o que ajuda a cumprir a exigência de "operação como transação lógica única" (item 11).

## 2. Estrutura dos módulos

```
index.html                    shell da aplicação (sidebar + topbar + view container + modais)
css/styles.css                design system (tokens, componentes, responsivo)
js/db.js                      wrapper IndexedDB (abrir banco, CRUD genérico, transações)
js/core/idgen.js              geração de IDs estáveis (UUID v4)
js/core/format.js             formatação de moeda, data, percentual
js/core/validation.js         validadores centralizados (SKU único, campos obrigatórios etc.)
js/core/stockEngine.js        única porta de entrada para alterar estoque (grava em inventory_movements
                               e recalcula o saldo do produto a partir do histórico)
js/core/audit.js              registro centralizado de auditoria
js/router.js                  roteador por hash (#/produtos, #/fornecedores, ...) e montagem de views
js/app.js                     bootstrap, sidebar, primeira execução, orquestração dos módulos
js/demoData.js                gerador de dados de demonstração e rotina de limpeza
js/modules/dashboard.js
js/modules/categories.js
js/modules/suppliers.js
js/modules/products.js
js/modules/settings.js
js/modules/backup.js
```

Módulos das fases seguintes (vendas/PDV, compras, clientes, financeiro, inteligência, estoque avançado)
já têm entradas na navegação, porém desabilitadas e sinalizadas como "Em breve — Fase N", conforme
requisito 58 (nunca simular funcionalidade pronta).

## 3. Modelo de dados (entidades e relacionamentos)

Entidades implementadas na Fase 1 (schema completo, mesmo que a tela de uso só apareça em fase posterior):

- **categories**: `id, name, parentId?, description, active, createdAt`
- **suppliers**: `id, name, razaoSocial, cnpjCpf, phone, whatsapp, email, address, contact, conditions, avgLeadTimeDays, notes, active, createdAt, updatedAt`
- **products**: `id, sku, barcode?, qrcode?, name, description, categoryId, subcategory, collection, model, color, material, supplierId?, cost, additionalCosts, totalCost (derivado), wholesalePrice, retailPrice, promoPrice?, minStock, idealStock, location {shelf,drawer,box}, active, notes, image?, createdAt, updatedAt, lastPurchaseAt?, lastSaleAt?, totalSold`
  - **Estoque atual não é um campo gravável do produto.** É sempre calculado a partir de `inventory_movements` (soma de entradas − saídas para aquele `productId`). Isso implementa desde a Fase 1 a "Regra de Ouro do Estoque" (item 54) e evita que Fase 2/3 precisem migrar dados.
- **inventory_movements**: `id, productId, type (ENTRADA_COMPRA | ENTRADA_DEVOLUCAO | ENTRADA_AJUSTE | ENTRADA_INICIAL | SAIDA_VENDA | SAIDA_PERDA | SAIDA_AVARIA | SAIDA_AJUSTE | ESTORNO_VENDA | ESTORNO_COMPRA), quantity, relatedDocument?, reason?, notes?, createdAt`
- **audit_logs**: `id, timestamp, operation, entity, entityId, oldValue?, newValue?, reason?`
- **settings**: registro único — dados da empresa, categorias de despesa configuráveis (lista, sem lançamentos ainda), formas de pagamento configuráveis (lista, sem taxas operacionais ainda), preferências de exibição.

Entidades já nomeadas no schema, mas **sem tabela/tela ainda** (reservadas para não exigir migração futura): `customers, purchases, purchase_items, sales, sale_items, payments, accounts_receivable, accounts_payable, expenses, cash_movements, stock_counts, stock_count_items`. Serão criadas no `db.js` conforme cada fase for aberta, com `id` sempre UUID v4 (estável, apto a virar chave primária num banco central futuro) — nunca autoincrement dependente do IndexedDB, justamente para facilitar migração.

Relacionamentos-chave: `products.categoryId → categories.id`; `products.supplierId → suppliers.id`; `inventory_movements.productId → products.id`. Toda referência é por ID estável, nunca por nome (evita quebra em renomeações).

## 4. Fluxo de estoque

`estoque_atual(produto) = Σ entradas(movements) − Σ saídas(movements)`, sempre. Nenhuma tela — incluindo a edição de produto — escreve diretamente nesse número. Cadastro de produto com "estoque inicial" gera automaticamente um `ENTRADA_INICIAL`. O ajuste manual (única operação de estoque já disponível na Fase 1, como antecipação útil da Fase 2) gera `ENTRADA_AJUSTE`/`SAIDA_AJUSTE` com motivo obrigatório e fica registrado no histórico do produto. Esse mesmo mecanismo (`StockEngine`) será reutilizado, sem alterações de assinatura, pelas Fases 2 (compras/PDV) e 6 (inventário) — cumprindo o item 18/54.

## 5. Fluxo de venda (planejado para a Fase 3, arquitetura já reservada)

PDV → carrinho em memória (nenhuma baixa de estoque enquanto o item está só no carrinho) → `FINALIZAR VENDA` dispara uma transação lógica única: valida estoque → grava `sales` + `sale_items` → chama `StockEngine` para `SAIDA_VENDA` de cada item → grava `payments` (podendo ser múltiplos, com validação de soma = total) → grava `accounts_receivable` quando a forma é a prazo → grava `cash_movements` quando a forma afeta caixa físico → recalcula margem/lucro por item usando o custo vigente no momento da venda (não o custo atual) → atualiza `lastSaleAt`/`totalSold` do produto e do cliente. Cancelamento/estorno usa os mesmos tipos de movimentação em sentido inverso (`ESTORNO_VENDA`), preservando o registro original (nunca `DELETE`).

## 6. Fluxo financeiro (planejado para a Fase 4)

Separação estrita de quatro conceitos, cada um em sua própria tabela, para que nenhum relatório futuro os confunda (item 55): **Faturamento** (valor bruto da venda, tabela `sales`) ≠ **Recebimento** (valor líquido após taxas, tabela `payments`, com `grossAmount`, `feeAmount`, `netAmount`) ≠ **Caixa** (`cash_movements`, só entradas/saídas físicas de caixa aberto) ≠ **Lucro** (calculado em relatório: `netRevenue − custoDaMercadoriaVendida − despesasAlocadas`, nunca persistido como valor fixo, sempre recalculado).

## 7. Tecnologia recomendada para o scanner (Fases 3/5/6)

Recomendo **duas bibliotecas combinadas**, sem depender só da `BarcodeDetector` nativa (que não existe no Safari/iOS e em vários Android):

- **ZXing-js** (`@zxing/browser` / `@zxing/library`) como leitor principal de código de barras (Code128, EAN13) e QR via câmera — maduro, funciona em praticamente todos os navegadores modernos via `getUserMedia`, com fallback de decodificação por software.
- **qrcode** (geração) para criar QR Codes de etiquetas e **JsBarcode** para gerar Code128 na etiqueta imprimível.
- Debounce de leitura (300–500ms por código idêntico consecutivo) para resolver o requisito de "impedir leituras duplicadas".
- Fallback sempre visível: campo de digitação manual do código, para quando a câmera falhar ou o dispositivo não tiver permissão.

Essas libs serão vendorizadas localmente (arquivo em `js/lib/`) para o sistema continuar funcionando sem internet, já que o requisito de execução simples e eventual PWA offline (itens 3 e 45) não deve depender de CDN.

## 8. Estratégia de armazenamento

IndexedDB é a fonte de verdade local. Cada escrita relevante (produto, movimentação, venda…) também gera uma linha em `audit_logs`. O módulo de Backup serializa **todas** as stores para um único JSON versionado (`{ version, exportedAt, data: {...} }|`), permitindo restaurar em qualquer instalação do sistema — esse mesmo formato JSON é o que será usado como payload de sincronização quando o backend existir (Fase 10), então o investimento no serializador não é descartado depois.

## 9. Estratégia de evolução para banco de dados centralizado (Fase 10 — não será executada agora)

Proposta a ser validada com você antes da implementação:

- Backend em Node.js (Express/Fastify) + PostgreSQL, replicando 1:1 o schema das entidades acima (os nomes de tabela/campo já foram escolhidos pensando em SQL).
- Autenticação via JWT + tabela `users`/`roles` (a auditoria já grava espaço para `userId`, hoje nulo).
- API REST versionada (`/api/v1/...`); a camada `db.js` do frontend passa a ser um *adapter* que troca IndexedDB por `fetch` contra a API — como a camada de domínio nunca fala direto com IndexedDB, essa troca é localizada.
- Sincronização: fila de operações pendentes (outbox pattern) gravada localmente quando offline, replicada ao reconectar — suporta o requisito de PWA parcialmente offline (item 45).
- Multi-dispositivo/multi-usuário: cada dispositivo mantém cache local (IndexedDB) como camada de leitura rápida + PWA instalável; a API central é a fonte de verdade.

## 10. Riscos técnicos identificados

- **Concorrência multi-aba/multi-dispositivo local**: hoje, se o mesmo navegador for aberto em duas abas, IndexedDB pode gerar condição de corrida na numeração de venda/estoque. Mitigação: todas as escritas de estoque usam transação IndexedDB (`readwrite`) atômica por produto.
- **Perda de dados por limpeza de navegador**: IndexedDB pode ser apagado pelo usuário ou pelo SO em pouco uso de disco. Mitigação: lembrete periódico de backup (a implementar em fase futura) e exportação manual disponível desde a Fase 1.
- **Câmera em navegadores diferentes**: comportamento de `getUserMedia` varia entre iOS Safari e Android Chrome. Mitigação: fallback manual sempre visível (item 7.8) e testes específicos na Fase 8.
- **Performance com milhares de movimentações**: somar movimentações a cada leitura de estoque pode ficar lento em escala. Mitigação já prevista: índice IndexedDB por `productId` em `inventory_movements`, e — se necessário no futuro — um campo de saldo "cacheado" recalculado de forma incremental (nunca editável manualmente), mantendo a integridade sem perder performance.
- **SKU/código de barras duplicado**: tratado já na Fase 1 com índice único (`unique: true`) em `products.sku`; duplicidade de `barcode` é permitida apenas com confirmação explícita do usuário (ex.: variações da mesma peça), conforme item 48.

## 11. Melhorias sugeridas à especificação

- Definir, já na Fase 1, se "custo total" do produto inclui rateio de frete/impostos por peça ou é só custo + custos adicionais informados manualmente — adotei a segunda opção por simplicidade, ajustável depois.
- Sugiro que "estoque ideal" seja opcional no cadastro (nem toda pequena loja consegue estimar isso de início); mantive como campo não obrigatório.
- Sugiro registrar, desde já, o **custo vigente no momento de cada venda** dentro do item de venda (Fase 3), não recalcular pelo custo atual do produto — senão o histórico de margem muda retroativamente quando o custo do produto for atualizado.
- Sugiro adicionar um campo `unit` (unidade: peça, par, conjunto) ao produto — bijuteria frequentemente vende em pares (brincos) e isso afeta a baixa de estoque de kits (item 26).

## 12. Status

Este documento cobre a arquitetura completa do AMÁH Brand. A implementação a seguir corresponde exclusivamente à **Fase 1 — Fundação**, conforme especificado no item 60. As fases seguintes reutilizarão esta base sem reescrevê-la (item 69).
