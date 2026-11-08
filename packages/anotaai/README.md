# Integração Anota AI (API oficial de pedidos v2)

Monitor contínuo dos pedidos das lojas Anota AI do Barbacue, Barbadog e Chelas, no mesmo molde de
`packages/ifood`. Os pedidos entram em `orders` com `channel = 'anotaai'`, id determinístico
(`anotaLocalId`), a marca da loja e itens no mesmo formato do iFood, e aparecem em `/admin/orders`.

Cliente e mapeamento portados do Food COG (`food.cog.ia.br` `src/lib/anotaai/{client,map}.ts`):
Content-Length em toda requisição, User-Agent próprio, token OAuth de 1 h reaproveitado e
`success:false` tratado como erro. `src/map.ts` é cópia literal; mantenha os dois iguais.

## Decisões (08/11/2026)

- **Quem opera os pedidos:** o Barbacue (decisão do Marlon). `ANOTAAI_ACTIONS=on` (padrão). O Food COG
  fica só recebendo (modo readOnly, polling a cada 90 s).
- **Sem webhooks aqui:** o `linkpage-by-token` é do parceiro "Food COG", compartilhado pelos dois sistemas,
  e uma nova chamada sobrescreveria as URLs. O polling basta.
- **Intervalo:** 60 s por loja (`ANOTAAI_POLL_INTERVAL_MS`, 30–300 s). Somado aos 90 s do Food COG,
  fica dentro do limite de 1 listagem a cada 30 s por loja.
- **Sem estado próprio nem migração:** a cada ciclo o monitor compara o `check` da listagem com o status
  da linha em `orders`. O que avançou na Anota AI vai para o painel; o que avançou no painel vira
  `accept` → `ready` → `finalize` (ou `cancel` com justificativa) na Anota AI. O status só avança.
  Por isso a ação chega à Anota AI em até um ciclo (60 s), bem dentro do prazo de 15 min de aceite.
- **iFood:** a listagem usa `excludeIfood=1`, porque o Barbacue já recebe o iFood pela Merchant API.
- **check 6** (cliente pediu cancelamento) vira uma nota no pedido; ninguém cancela sozinho.
- **Dry run por padrão**, como o monitor iFood: só grava com `ANOTAAI_DRY_RUN=false`.

| check Anota AI | status no painel |
|---|---|
| 0 | pending |
| -2, 1 | confirmed |
| 2 | ready |
| 3 | delivered |
| 4, 5 | cancelled |

## Variáveis (`.env` da raiz)

```sh
ANOTAAI_CLIENT_ID=          # parceiro Food COG (mesmas credenciais do food.cog.ia.br)
ANOTAAI_CLIENT_SECRET=
ANOTAAI_PAGES_JSON=[{"pageId":"<idpage>","brand":"barbacue","name":"Barbacue"},{"pageId":"<idpage>","brand":"barbadog","name":"Barbadog"},{"pageId":"<idpage>","brand":"chelas","name":"Chelas"}]
ANOTAAI_POLL_INTERVAL_MS=60000
ANOTAAI_ACTIONS=on
ANOTAAI_DRY_RUN=false
```

O `idpage` é o claim do Token da unidade (Portal de Integração da Anota AI); o Food COG o grava em
`Integration(kind = "ANOTA_AI_API").configJson.pages[].pageId` da loja `ifood-demo-barbacue`.

## Testes e publicação

```sh
npm test --workspace=@barbacue/anotaai
npm run typecheck --workspace=@barbacue/anotaai
docker build -f packages/anotaai/Dockerfile -t barbacue-anotaai:<tag> .
ANOTAAI_IMAGE_TAG=<tag> docker compose -f packages/anotaai/compose.prod.yml up -d   # na pasta com o .env
```

Pendente: os `pageId` das três lojas e o deploy (precisa do ok do Marlon).
