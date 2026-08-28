# Correção — rastrear o motivo do "Pagar com Pix" cair pro WhatsApp

## O que mudou

Nada muda na tela que você vê. É uma correção "por trás dos panos": quando
você clicou em "Pagar com Pix" e caiu no WhatsApp, o sistema não estava
guardando nenhuma pista do motivo — eu não conseguia ver nos logs do
servidor o que o Mercado Pago respondeu. Agora, sempre que uma cobrança
(Pix ou Cartão/boleto, na Vitrine ou no presencial) falhar, o motivo exato
fica registrado no log do backend, pra eu conseguir investigar.

## Como aplicar

1. Extraia o zip.
2. Você vai ver 1 pasta: `backend`.
3. Arraste ela pra dentro da sua pasta do projeto, soltando **em cima** da
   pasta `backend` que já existe lá.
4. O Windows vai perguntar se quer **substituir os arquivos no destino** —
   escolha "Substituir os arquivos no destino" (ou "Fazer isso para todos
   os itens atuais").
5. Abra o GitHub Desktop, confira em "Changes", e faça o commit + push de
   sempre.

Depois do push, me avise ("feito") que eu confirmo o deploy. Em seguida,
tente de novo clicar em **"Pagar com Pix"** na Vitrine — mesmo que caia no
WhatsApp de novo, dessa vez eu vou conseguir ver nos logs exatamente por
quê, e aí sim resolvo de verdade.

## O que eu já testei por aqui

Simulei o Mercado Pago recusando a cobrança Pix (cenário mais provável,
dado o que você já tinha visto: a tela de pagamento do Mercado Pago só
mostrando "Cartão", sem Pix nem Boleto) e confirmei que agora o motivo
aparece certinho no log, com o código e a descrição que o Mercado Pago
devolveu. Sintaxe dos 16 arquivos do backend, validada.
