# Gestor iFood (três lojas)

Tela `/admin/ifood` e atalho **Gestor iFood (3 lojas)** no menu e na bandeja do
aplicativo Windows "Barbacue Pedidos". Reúne Chelas, Barbacue e Hotdog (Barbadog)
em um só painel, no lugar de três abas do gestor do iFood.

## Como funciona

- **Pedidos:** vêm do banco, importados pelo receptor de webhook com fila persistente
  e pelo monitor de contingência (`packages/ifood`). Somente o monitor envia ACK
  dos eventos de polling; ambos usam IDs determinísticos e transições monotônicas.
  A tela atualiza a
  cada 10 s, toca um alerta quando chega pedido novo e destaca em vermelho os
  pendentes há 5 min ou mais.
- **Ações:** confirmar, iniciar preparo, pronto para retirada, saiu para entrega e
  cancelar (com os motivos que o iFood aceita para o pedido). Vão direto à Order
  API pelo servidor. A etapa local só muda quando o evento do iFood chega pelo
  monitor, então a tela mostra sempre o estado real do iFood.
- **Lojas:** status de cada loja (Merchant API) e pausa/reabertura por
  interrupção (15 min a 4 h).
- **Segurança:** o client secret fica só no ambiente do servidor. O navegador e o
  desktop recebem apenas o resultado. Acesso pela permissão "Gestor iFood"
  (padrão: administrador, gerente e caixa).

## Configuração no servidor (PM2 `barbacue`)

Adicionar ao ambiente do processo web as mesmas credenciais do monitor:

```sh
IFOOD_CLIENT_ID=...
IFOOD_CLIENT_SECRET=...
IFOOD_DRY_RUN=false   # sem isto a tela mostra "Modo simulação" e não envia ações
```

`IFOOD_MERCHANTS_JSON` é opcional e segue o mesmo formato do monitor. Depois:
`pm2 restart barbacue --update-env && pm2 save`.

O app precisa dos módulos **Order**, **Events** e **Merchant** autorizados nas três
lojas. Sem Merchant, os pedidos funcionam, mas o status e a pausa das lojas
aparecem com erro.

## Limites

- A tela consulta o banco, sem consumir eventos do iFood. Confira o monitor
  (`/tmp/ifood-health.json`) e o worker de webhook
  (`/tmp/ifood-webhook-health.json`), incluindo a quantidade/idade de eventos pendentes.
- Plataforma de negociação (disputas), avaliações e cardápio continuam no
  gestor do iFood.
