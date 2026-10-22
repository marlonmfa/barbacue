# Gestor iFood (três lojas)

Tela `/admin/ifood` e atalho **Gestor iFood (3 lojas)** no menu e na bandeja do
aplicativo Windows "Barbacue Pedidos". Reúne Chelas, Barbacue e Hotdog (Barbadog)
em um só painel, no lugar de três abas do gestor do iFood.

## Como funciona

- **Pedidos:** vêm do banco, importados pelo monitor (`packages/ifood`), que
  continua sendo o **único** leitor de eventos (polling + ACK). A tela atualiza a
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

- Não há polling na tela: se o monitor parar, pedidos novos não aparecem.
  Confira `/tmp/ifood-health.json` do monitor.
- Plataforma de negociação (disputas), avaliações e cardápio continuam no
  gestor do iFood.
