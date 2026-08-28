# Pagamento automático (PIX, cartão e boleto) — como aplicar

## O que mudou

- **Vitrine (loja on-line):** o botão "Enviar pedido no WhatsApp" virou **"Finalizar compra"**. Agora, ao clicar, a cliente é levada direto para a página de pagamento do Mercado Pago (PIX, cartão ou boleto à vista, ela escolhe). Se por algum motivo o pagamento automático não estiver disponível, o sistema volta sozinho para o WhatsApp, como era antes — a Vitrine nunca fica sem jeito de vender.
- **Vender / Modo Vendedor (presencial):** na tela de pagamento apareceram dois botões novos, **"📱 Cobrar PIX"** e **"💳 Cobrar no cartão"**. Ao clicar, o sistema gera a cobrança na hora: para PIX, mostra um QR Code na tela pro cliente escanear; para cartão, mostra um QR Code/link que o **cliente escaneia no celular dele** (sem precisar de maquininha). Assim que o pagamento cai, a venda é registrada sozinha — sem precisar marcar "pago" manualmente. Boleto não entra aqui (só na Vitrine, porque leva de 1 a 3 dias úteis para compensar).
- Por trás disso, os pagamentos passaram a ser feitos com o **Mercado Pago** — sem taxa de mensalidade, PIX com taxa de aproximadamente 0,99%, cartão de aproximadamente 4,98% (varia conforme o Mercado Pago), boleto com taxa fixa de aproximadamente R$ 3,49.

## Passo 1 — Aplicar (é só colar por cima, sem trocar nada manualmente)

Este pacote já vem com as **3 pastas completas do jeito que ficam na sua pasta do projeto**: `backend`, `storefront` e `gestao`. Não precisa abrir nem trocar nenhum arquivo individualmente — é só:

1. Extraia o zip em algum lugar (ex.: Área de Trabalho).
2. Você vai ver 3 pastas: `backend`, `storefront`, `gestao`.
3. Arraste cada uma delas pra dentro da sua pasta do projeto (a mesma da sua imagem, `amah-brand-backend`), soltando **em cima** das pastas de mesmo nome que já existem lá.
4. O Windows vai perguntar se quer **substituir os arquivos no destino** — escolha "Substituir os arquivos no destino" (ou "Fazer isso para todos os itens atuais"). Isso troca só os arquivos que mudaram e mantém o resto intacto.
5. Abra o GitHub Desktop, confira em "Changes" se apareceram os arquivos esperados, e faça o commit + push de sempre.

*(Só uma observação: reparei que sua pasta também tem `js`, `css`, `index.html`, `manifest.json` e `service-worker.js` soltos na raiz, fora da pasta `gestao`. O que realmente vai pro ar é o que está dentro de `gestao` — pode ignorar esses arquivos soltos, não precisa mexer neles.)*

Depois do push, me avise ("feito") que eu confirmo se o deploy no Render saiu certo (o deploy automático tem falhado bastante ultimamente, então eu sempre confiro e, se precisar, disparo manualmente).

**É seguro aplicar agora**: enquanto o Mercado Pago não estiver configurado (próximo passo), tudo continua funcionando exatamente como hoje — a Vitrine cai de volta pro WhatsApp e os botões de cobrança presencial simplesmente não aparecem.

## Passo 2 — Criar sua conta no Mercado Pago

Se você ainda não tem conta: acesse mercadopago.com.br e crie uma conta (pode ser com seu CPF, não precisa de CNPJ). Depois de criada, vá em **"Seu negócio" → "Configurações" → "Credenciais"** (ou busque por "Credenciais de produção" dentro da conta) e copie o **Access Token de produção**.

**Importante:** por segurança, eu nunca devo ver nem guardar esse token — ele dá acesso a receber pagamentos na sua conta. Você mesma vai colar ele direto no Render (passo 3), nunca aqui no chat comigo.

## Passo 3 — Configurar o Render (você mesma, com o token em mãos)

No [dashboard do Render](https://dashboard.render.com), abra o serviço **amah-brand-backend** → aba **Environment** → **Add Environment Variable**, e adicione:

| Nome | Valor |
|---|---|
| `MERCADOPAGO_ACCESS_TOKEN` | (o token que você copiou no passo 2) |
| `BACKEND_URL` | `https://amah-brand-backend.onrender.com` |
| `STOREFRONT_URL` | `https://amah-brand-vitrine.onrender.com` |

Depois de salvar, o Render reinicia o backend sozinho (~1-2 minutos) e o pagamento automático já entra em ação — não precisa rodar mais nada.

*(Existe um segundo site de Vitrine na sua conta do Render, `amah-brand-vitrine-v2` — é uma cópia de diagnóstico de um problema já resolvido em 2026-08-21, não é a que você usa.)*

## O que eu já testei por aqui

Antes de te mandar este pacote, rodei o fluxo inteiro num banco de dados de teste (separado do seu banco de verdade): criei um pedido, simulei o Mercado Pago aprovando o pagamento, e confirmei que a venda é gerada certinha (com o produto baixando do estoque, o pagamento registrado com a taxa certa, e sem duplicar caso o Mercado Pago avise duas vezes do mesmo pagamento). Testei os dois fluxos — Vitrine e presencial (PIX) — e também testei que uma venda feita manualmente (sem Mercado Pago) continua funcionando exatamente como antes.
