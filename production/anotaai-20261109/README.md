# Monitor Anota AI em produção — 09/11/2026

Publicado em 09/11/2026 19:03 UTC, autorizado por Marlon ("pode publicar e teste em producao"). O Barbacue opera
os pedidos da Anota AI; o Food COG só recebe (`readOnly`, release `main-20261109-anotaai-readonly`).

- Código: `packages/anotaai` em `d5ba161` (inclui o corte `ANOTAAI_IMPORT_SINCE`: pedidos anteriores ao início
  não entram, então nada antigo vai para a cozinha). Imagem `barbacue-anotaai:20261109`, construída a partir de
  `/root/barbacue-anotaai/build-20261109` (conferido: idêntico a `d5ba161`).
- Serviço: `/root/barbacue-anotaai/compose.prod.yml`, contêiner `barbacue-anotaai-monitor-1`, `network_mode: host`,
  banco nativo do Barbacue (o mesmo `DATABASE_URL` do PM2 `barbacue`).
- `.env` (0600, fora do Git): credenciais de parceiro copiadas de `/opt/cogfood/.env`, `ANOTAAI_PAGES_JSON` com
  Barbacue `6695aa65af020700192a0885`, Barbadog `693030b936eda81ff1759ddb`, Chelas `66bbdafe61051100124ff4c3`,
  `ANOTAAI_IMPORT_SINCE=2026-11-09T19:03:33Z`, intervalo 60 s, `ANOTAAI_ACTIONS=on`.
- Backup antes: `/root/barbacue-anotaai/backups/barbacue-before-anotaai-20261109T190332Z.dump`.
- Sequência: dry run com as três lojas (ciclo ok, sem erro), depois `ANOTAAI_DRY_RUN=false` e recriação do
  contêiner. No servidor, `/root/barbacue-anotaai/run-anotaai-20261109.sh` (preparado antes) faz o mesmo direto
  em modo valendo.

## Testes em produção (09/11, 19:05–19:08 UTC)

- Token OAuth 200; `/ping/list` 200 nas três lojas, pelo Barbacue e pelo Food COG.
- Nenhum pedido Anota AI no dia nas três lojas: o teste de ponta a ponta precisa de um pedido de teste.
- Monitor saudável (`state: ok`), monitor e webhook iFood sem erros, site 200.
- Food COG: integração ACTIVE com `readOnly: true`, nenhuma ação enviada à Anota AI.

## Webhooks configurados no Portal da Anota AI

O portal aponta para `https://{barbacue,barbadog,chelas}.cog.ia.br/api/webhooks/anota/{accepted,updated,cancelled}?token=…`.

- `barbacue.cog.ia.br` tem a rota (788a0e4): GET 405, POST sem token 401. Ela só grava em `anota_webhook_inbox`;
  quem cria e atualiza os pedidos é o monitor, por polling.
- `barbadog.cog.ia.br` e `chelas.cog.ia.br` não existem no DNS, então os webhooks dessas duas lojas falham. Os
  pedidos não são afetados, porque o polling cobre as três lojas.

Parar: `cd /root/barbacue-anotaai && docker compose -f compose.prod.yml down` (sem `-v`).

## Rótulo "Anota AI" — 09/11/2026 ~20:40 UTC

`8797ce8`: canal `anotaai` aparece como "Anota AI" em `/admin/orders` e na linha "Origem" do ticket da cozinha
(o ticket já traz a marca e a nota "Loja Anota AI: …"). Web publicada com `publish.py` (BK_NAME
`backup-anotaai-labels-20261109`, em `/srv/barbacue-unified-20261106`): build `UFVaWtKTkFQlGNuukUwmD` →
`xPvAVHhzdVb9MzfEaGupR`, 135 rotas nas duas, candidata testada, troca com reversão automática. Só
`apps/web/src/app/admin/orders/page.tsx` mudou no contexto do servidor (cópia anterior ao lado,
`.before-anotaai-labels`). O `print-agent` só muda no próximo instalador Windows.

Fila de impressão: 746 tickets `queued`, nenhum impresso, nenhum agente jamais conectado. O claim
(`claimKitchenPrintJob`) pega o mais antigo, sem filtro de idade: o primeiro agente imprimiria todos.
A fila não foi alterada; aguarda decisão do Marlon.
