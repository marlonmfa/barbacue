# Integração iFood Developer

Cliente da Merchant API e monitor contínuo dos pedidos das três lojas. Reutiliza o
Postgres e o painel `/admin/orders` existentes; pedidos entram pelo canal `ifood`
e conservam a marca, itens, complementos, pagamento e endereço.

| Loja | Merchant ID | Marca no sistema |
|---|---|---|
| Chelas | `991532f5-0400-4efe-b38a-b2b37f8bd9b0` | `chelas` |
| Barbacue | `403af0c6-176b-4021-a6cd-3e09dca09cbf` | `barbacue` |
| Hotdog | `6cb73c63-55cd-459b-a02b-aa936967bf20` | `barbadog` |

Esses IDs são o mapeamento padrão versionado em `src/merchants.ts`. IDs identificam
as lojas; não concedem acesso à API.

## Credenciais e autorização

Aplicação identificada: **Food COG**, client ID
`19e6ca56-1a7a-483d-b28b-c945990154c7`, já utilizada por `food.cog.ia.br`.
As credenciais existentes foram configuradas no ambiente local deste projeto, sem
alterar o ambiente ou os vínculos do Food COG. O monitor usa a Merchant API pelo
mesmo aplicativo OAuth; não replica contas nem altera o webhook da Granni.

Conceda os módulos **Events e Order** para cada uma das três lojas. Merchant é
opcional para consultar o status comercial da loja. Preencha
somente as variáveis necessárias no `.env` da raiz, preservando as demais:

```dotenv
IFOOD_CLIENT_ID=
IFOOD_CLIENT_SECRET=
IFOOD_DRY_RUN=true
IFOOD_AUTO_CONFIRM=false
IFOOD_POLL_INTERVAL_MS=30000
```

`DATABASE_URL` precisa apontar para o banco já usado pelo painel, com as migrações
atuais aplicadas (incluindo a fila de impressão). Nunca recrie bancos ou contas.
O segredo fica nos ambientes privados local e do servidor, fora do Git e do navegador.
Aplicações distribuídas exigem outro fluxo OAuth e não são suportadas por este conector.

Deixe `IFOOD_MERCHANT_ID` e `IFOOD_MERCHANTS_JSON` vazios para usar as três lojas.
Um `IFOOD_MERCHANT_ID` antigo restringe o monitor a essa loja. Para sobrescrever o
mapeamento, configure `IFOOD_MERCHANTS_JSON` como array de `{id,name,brand}`.

## Validar e executar

```bash
npm run typecheck --workspace=packages/ifood
npm test --workspace=packages/ifood
npm run doctor --workspace=packages/ifood
npm run poll --workspace=packages/ifood
```

O diagnóstico autentica, confere os módulos ORDER/EVENTS por loja nas permissões
do token e tenta consultar o status pelo módulo Merchant, sem consumir eventos nem
estabelecer presença por polling. A simulação faz polling (estabelece presença no
iFood), mas não grava pedidos, envia ACK, confirma pedidos ou altera cardápios.
Não execute outro consumidor em paralelo sem coordenar com a integração existente.

Após validar credenciais, lojas e banco, defina `IFOOD_DRY_RUN=false` para importar
pedidos. A confirmação comercial continua no gestor iFood. Opcionalmente,
`IFOOD_AUTO_CONFIRM=true` solicita confirmação de novos pedidos após persistência;
o status local só muda para confirmado quando o evento CFM real chega.

## Serviço Docker

Build canônico: `packages/ifood/Dockerfile`, baseado na imagem oficial Node com
versão fixada e dependências do `package-lock.json`. Contexto: raiz do repositório.
A imagem não contém `.env` nem depende de plugins/código montados do servidor.

No host que já executa este Compose e usa o mesmo Postgres, depois de comparar a
configuração ativa e validar as migrações existentes:

```bash
docker compose --profile ifood build ifood-monitor
docker compose --profile ifood up -d --no-deps ifood-monitor
docker compose logs --tail=100 -f ifood-monitor
```

O perfil `ifood` exige ativação explícita. O serviço reinicia automaticamente após
falha/reboot. Antes da autorização, publica `waiting_authorization`, renova o token
e verifica as três lojas a cada minuto, sem consumir eventos. A importação começa
automaticamente quando as três recebem ORDER/EVENTS. O healthcheck acompanha a
atualidade dessa verificação ou, em operação, o último ciclo bem-sucedido; `/tmp/ifood-health.json` contém horário, modo e lojas monitoradas,
sem dados de clientes ou tokens. Healthcheck não envia notificações externas.
Em uma instalação fora deste Compose, ajuste apenas a conexão operacional ao banco
ativo antes de iniciar. Não substitua web, Postgres ou volumes para ativar o monitor.

Antes de atualizar uma imagem existente, preserve diferenças do serviço ativo,
teste a candidata e registre a revisão Git e o ID/digest da imagem publicada.

## Gestor no painel

A tela `/admin/ifood` (e o app Windows) opera as três lojas usando estes pedidos
importados e envia as ações pela Order API do servidor. Veja
`apps/web/docs/IFOOD-GESTOR.md`.

## Garantias e limites

- Polling com `x-polling-merchants` para as três lojas, intervalo mínimo de 30s.
- Eventos de outras lojas ou com identidade conflitante não são consumidos.
- Uma falha não impede o processamento dos outros pedidos; eventos com erro
  permanecem pendentes para nova tentativa.
- ACK somente após persistência. ID determinístico evita duplicar o mesmo pedido.
- Transições não regridem pedidos e preservam estados terminais.
- Detalhes são consultados na primeira importação; eventos seguintes usam o pedido
  já salvo. Pedidos agendados preservam o horário da fila de impressão.
- Tokens com cache, renovação em 401, timeout e retry de falhas transitórias.
- Alterações manuais no painel são internas. Despacho/cancelamento externos continuam
  no gestor iFood. Sincronização de cardápio é um comando separado e não é executada
  pelo monitor; revise a loja selecionada antes de usar `sync-menu`.

Fontes oficiais:
- https://developer.ifood.com.br/en-US/docs/food/guides/modules/authentication/centralized
- https://developer.ifood.com.br/es-CO/docs/food/guides/modules/events/polling-overview
- https://developer.ifood.com.br/en-US/docs/getting-started/documentation/best-practices

## Serviço publicado no ambiente atual

O Barbacue ativo usa PM2 e Postgres nativo no host `otherpagesandig`, SSH 2212.
O monitor foi publicado separadamente com `compose.prod.yml` deste pacote,
`network_mode: host` e o `DATABASE_URL` do processo Barbacue existente, sem alterar
web, PM2, banco ou volume. Diretório operacional: `/root/barbacue-ifood`.

```sh
cd /root/barbacue-ifood
docker compose -f compose.prod.yml ps
docker compose -f compose.prod.yml logs --tail=30 monitor
docker compose -f compose.prod.yml exec -T monitor cat /tmp/ifood-health.json
```

Imagem `barbacue-ifood:20261018`, ID
`sha256:327efc0990597cb72e7f6ca4a1032f86f7ce98b01a97047e465f804839ea0646`.
Estado verificado em 18/10/2026: `healthy`, aguardando autorização das três lojas.
O estado `healthy` durante a espera confirma o worker e a checagem de acesso;
ainda não significa recebimento de pedidos. Após a ativação, validar pedidos reais
por marca no painel e na impressão.
