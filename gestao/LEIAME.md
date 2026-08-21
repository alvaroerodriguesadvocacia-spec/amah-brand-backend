# AMÁH Brand — Sistema de Gestão (completo, Fases 1–9)

## Como executar

Não precisa de instalação, servidor ou internet. Basta abrir o arquivo `index.html` em
qualquer navegador moderno (Chrome, Edge, Firefox, Safari) — funciona tanto abrindo o
arquivo diretamente (duplo clique) quanto servido por um servidor local/HTTPS, se
preferir (nesse caso o app também se instala como PWA e funciona offline, ver Fase 8
abaixo).

Os dados ficam salvos no próprio navegador (IndexedDB), no dispositivo em que o sistema
foi aberto. Use o módulo **Backup** para exportar um arquivo `.json` e levar seus dados
para outro computador, ou para se proteger contra perda de dados. Recomenda-se fazer
backup periodicamente — não há sincronização automática com nuvem nesta versão (ver
`ARQUITETURA.md`, seção 9, sobre a evolução para a Fase 10).

Na primeira abertura, escolha entre começar com **dados de demonstração** (20 produtos,
5 categorias e 3 fornecedores fictícios, para você explorar o sistema) ou **sistema
vazio** (para cadastrar os dados reais da sua empresa desde já). Dá para trocar depois
em Configurações → Dados de demonstração.

## Visão geral do que está implementado

Todas as fases da especificação original (exceto a Fase 10 — nuvem/backend, que
depende de aprovação prévia da arquitetura, já apresentada em `ARQUITETURA.md`) estão
implementadas e navegáveis a partir do menu lateral.

### Produtos e Estoque (Fase 1 e 2)
Cadastro completo de produtos (categoria, fornecedor, custos, preços de varejo/atacado,
margem automática, estoque mínimo/ideal, localização física, SKU único, código de
barras/QR), impressão de etiquetas (código de barras + QR, prontas para impressora
comum), entrada de mercadoria, saída manual (perda/avaria/ajuste), histórico completo
de movimentações com filtro e exportação CSV, alertas de estoque mínimo, sem estoque e
produtos encalhados. **Regra de ouro**: a quantidade em estoque nunca é editada
diretamente — é sempre a soma das movimentações (`js/core/stockEngine.js`).

### Clientes e Vendas / PDV (Fase 3)
Cadastro de clientes com histórico de compras e ticket médio. PDV completo: busca por
nome/SKU/código de barras, leitura por câmera (scanner com fallback de digitação
manual), consulta de produto sem adicionar ao carrinho, edição de quantidade/preço/
desconto por item, pagamento com múltiplas formas simultâneas (dinheiro, PIX, débito,
crédito com taxa, boleto, prazo), cálculo automático de valor líquido por taxa,
finalização como transação atômica única. Histórico de vendas com detalhe, cancelamento
(estorna estoque e caixa) e devolução parcial de itens.

### Financeiro (Fase 4)
Caixa: abertura com saldo inicial, movimentações manuais (suprimento/sangria),
integração automática com vendas e pagamentos de contas, fechamento com conferência
física × esperado e registro de diferença. Contas a receber (geradas automaticamente
por vendas a prazo/boleto) e a pagar (geradas por compras ou lançamentos avulsos), com
baixa manual. Despesas por categoria. Fluxo de caixa consolidado por período.

### Compras (Fase 5)
Criação de pedido de compra por fornecedor, recebimento de mercadoria (inclusive
parcial, com leitura por scanner), geração automática de contas a pagar, cancelamento
com estorno de estoque quando aplicável.

### Inventário (Fase 6)
Contagem física assistida por scanner ou leitura manual, comparação automática entre
saldo do sistema e contagem física, lista de divergências, confirmação de ajuste
**seletiva** (nunca automática — item 19 da especificação), geração de movimentações
`ENTRADA_AJUSTE`/`SAIDA_AJUSTE` apenas para os itens confirmados.

### Inteligência de negócio (Fase 7)
Relatórios por período (KPIs de faturamento, lucro, ticket médio, mais/menos vendidos),
margens e lucro por produto (sempre a partir do custo histórico da venda, nunca do
custo atual), Curva ABC (Pareto 80/15/5), giro de estoque (🔥 Alto giro / 🟢 Saudável /
🟡 Baixo giro / 🔴 Encalhado). Exportação CSV em todas as telas de relatório.

### Mobile/PWA (Fase 8)
Layout responsivo (desktop, tablet, celular), `manifest.json` com ícones para
instalação como app, Service Worker com cache de todos os arquivos do sistema para uso
offline após a primeira visita — ativado automaticamente quando o sistema é servido via
`http(s)` (em uso direto por `file://`, o app funciona normalmente, só sem o cache de
PWA, já que navegadores não permitem Service Worker nesse protocolo).

### Robustez (Fase 9)
Validações em todas as operações críticas (SKU único, quantidade positiva, soma de
pagamentos igual ao total, saldo suficiente antes de vender), transações atômicas em
todas as operações que afetam múltiplas entidades (venda, compra, caixa, inventário),
auditoria (`audit_logs`) em toda operação relevante, backup/restauração cobrindo
dinamicamente todas as entidades do sistema (inclusive as adicionadas nas fases
2 a 7), suíte de testes automatizados de ponta a ponta (ver abaixo).

## Testes realizados

Testes automatizados de ponta a ponta (Chromium via Playwright, pasta `test/`):

- `e2e-demo.js` / `e2e-empty.js` / `e2e-backup-roundtrip.js` — fluxos da Fase 1
  (cadastros, validações, backup/restauração, responsividade).
- `e2e-full-flow.js` — percorre todas as fases em sequência: abertura de caixa, venda
  completa no PDV com baixa de estoque, histórico de vendas, entrada manual de
  estoque, todas as telas de alerta de estoque, contagem de inventário com
  divergência e ajuste seletivo, todas as telas financeiras, todos os relatórios de
  inteligência, fechamento de caixa — sem nenhum erro de console.
- `e2e-golden-scenarios.js` — reproduz os dois cenários de validação obrigatórios da
  especificação original: (1) sequência de estoque 20 → 17 (venda) → cancelamento
  (volta a 20) → 18 (nova venda) → 28 (compra +10) → contagem física 27 → confirmação
  de ajuste → 27; (2) venda de R$100 com forma de pagamento de 3% de taxa → valor
  líquido recebido de exatamente R$97. Ambos os cenários passam com os valores exatos
  esperados.

Durante a construção desta fase final foi encontrado e corrigido um bug real no
roteador (`js/router.js`): rotas com mais de um segmento (ex.: `/financeiro/caixa`,
`/estoque/entrada`) não eram reconhecidas — o roteador só considerava o primeiro
segmento do caminho. Esse era o motivo pelo qual, até então, apenas as rotas de um
segmento (Produtos, Categorias, Fornecedores, Configurações, Backup) funcionavam. Após
a correção, todas as ~30 rotas do sistema foram testadas e confirmadas.

## Estrutura do código

Ver `ARQUITETURA.md` para a análise técnica completa (arquitetura, modelo de dados,
fluxos, riscos e estratégia de evolução para nuvem — Fase 10, ainda não iniciada e
sujeita à sua aprovação prévia).
