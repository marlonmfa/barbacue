# Webhook Food Cog — Chelas, Barbacue e Hotdog

Atualização posterior: o receptor recebeu uma
[auditoria persistente de pedido, tipo e horários](../webhook-audit-20261023/README.md).
Para instalação nova, aplicar também a migração de auditoria e usar a imagem
indicada nessa atualização. Os detalhes abaixo registram a primeira publicação.

Publicado em 23/10/2026, America/Sao_Paulo. Aplicativo centralizado Food Cog,
`19e6ca56-1a7a-483d-b28b-c945990154c7`. Não depende da homologação de MERCHANT:
as três lojas já têm ORDER e EVENTS autorizados.

## Estado anterior e caminho publicado

O aplicativo já tinha webhook ativo no iFood em `https://cog.ia.br/api/ifood/webhook`.
O receptor central COG, imagem `cog-webhooks:20261022-locked`, encaminhava Granni
ao Grano e usava Food COG como fallback. As três lojas do Barbacue eram atendidas
apenas pelo monitor de polling, sem cadastro de lojas no banco do Food COG.

Agora os três merchant IDs de `merchant-routes.json` são encaminhados pela central
ao receptor `https://barbacue.cog.ia.br/api/ifood/webhook`. O aplicativo/credenciais
Food Cog são os mesmos; não foram criadas lojas, contas ou configurações fiscais
duplicadas no Food COG. Pedidos continuam no painel Barbacue, com suas marcas.
Granni/Grano e fallback existentes foram preservados.

O receptor verifica HMAC-SHA256 nos bytes recebidos e só responde 202 depois de
persistir o lote na tabela `ifood_webhook_inbox`. O worker processa a fila a cada
segundo, reaproveitando o processamento do monitor, sem confirmação comercial
automática. Eventos repetidos usam o ID oficial como chave única. Falhas permanecem
na fila e são tentadas novamente após 30 s. O payload é removido após sucesso;
o ID é retido para deduplicação. Eventos que não correspondem a estados suportados
pelo importador seguem o mesmo comportamento do monitor: não alteram pedidos.

O monitor anterior continua em polling a cada 30 s, como contingência. Polling e
webhook têm entregas independentes; IDs determinísticos e transições monotônicas
impedem duplicar pedidos ou regredir estados terminais. ACK de polling continua
exclusivamente no monitor. O webhook não envia ACK de polling.

## Build reproduzível e publicação

Dockerfile canônico: `packages/ifood/Dockerfile`, imagem oficial Node 22.22.0-alpine
e lockfile do repositório. Nenhum segredo, banco ou código montado entra na imagem.

```sh
docker build -f packages/ifood/Dockerfile -t barbacue-ifood:webhook-20261023 .
```

Contexto publicado: `/root/barbacue-ifood/build-webhook-20261023`, no host
`otherpagesandig`, SSH `root@91.108.125.60:2212`. O contexto usa a base Git
`785da8dae52281c3c4577daf5dc286f258a95ad2` com os arquivos desta alteração.
`source-revision.json` registra os hashes. Imagem nova:
`sha256:ea6dc78df502dc12b60159a051860a58b6f7f1f578c2dc69274bd6f3fcdd6c78`.

Aplicar `inbox.sql` explicitamente no banco nativo já usado pelo monitor. É uma
migração aditiva; não modifica tabelas ou dados de pedidos, contas e impressão.
O worker apenas verifica o schema ao iniciar, sem executar migrações automáticas.
Instalar `nginx-location.conf` em `/etc/nginx/snippets/barbacue-ifood-webhook.conf`,
incluí-lo no server HTTPS de `barbacue.cog.ia.br`, validar `nginx -t` e recarregar.
O listener 3467 fica restrito a 127.0.0.1; o acesso externo é pelo Nginx/TLS.

Em `/root/barbacue-ifood`, com o ambiente existente preservado:

```sh
docker compose -f compose.prod.yml up -d --no-deps --no-build --pull never webhook
```

Serviço `barbacue-ifood-webhook-1`, separado do monitor anterior, cuja imagem
`sha256:327efc0990597cb72e7f6ca4a1032f86f7ce98b01a97047e465f804839ea0646`
não foi substituída. O processo web/PM2 também não foi substituído.

No gateway central (`hirable`, `/srv/cog-webhooks`), **mesclar** os três destinos
de `merchant-routes.json` com o `IFOOD_MERCHANT_ROUTES` existente no `.env` privado.
Não sobrescrever outras rotas, variáveis, segredos ou configurações Meta.
Recriar somente `router`, com a mesma imagem já ativa. A URL e os toggles do
iFood Developer não precisaram mudar: webhook já habilitado, presença por
aplicativo, URL central preservada. O teste oficial foi executado com sucesso.

## Verificação

- TypeScript e 22 testes aprovados: assinatura, bytes alterados, rejeição de lojas
  desconhecidas, lote atômico, falha do banco, simulação, KEEPALIVE, três marcas e
  processamento/idempotência já existentes no monitor.
- Teste assinado ponta a ponta central → Nginx → fila, três lojas em um lote:
  HTTP 202 em 344 ms; repetição do lote HTTP 202 em 91 ms.
- Três eventos `COG_WEBHOOK_TEST`, um por loja, gravados e processados uma vez,
  payload descartado após sucesso, fila pendente zero. Código de diagnóstico sem
  ação comercial e sem criação de pedidos: zero pedidos sintéticos no banco.
- Assinatura ausente: central HTTP 403, receptor HTTP 401.
- Portal iFood: `Connection test successful.`
- Containers receptor, monitor e gateway saudáveis. Food COG e seu banco saudáveis.
- 128 pedidos iFood existentes no Barbacue durante a verificação: Barbacue 94,
  Chelas 27, Hotdog 7. Esses pedidos precedem a ativação do novo receptor.
  O primeiro evento comercial real via webhook ainda depende da próxima entrega
  do iFood; os testes de diagnóstico não comprovam essa entrega real.

Health interno: `http://127.0.0.1:3467/health`; worker:
`/tmp/ifood-webhook-health.json`, com `pending`, `oldest`, `lastSuccess` e
`lastReceipt`. Uma fila envelhecida exige investigação mesmo com HTTP saudável.

## Incidente Food COG recuperado

`cogfood-app-1` estava unhealthy por não alcançar `db:5432`. O container
`cogfood-db-1` havia encerrado em 22/10 por disco cheio; restavam 28 GiB livres na
verificação de 23/10. Foi iniciado **o mesmo container**, com o mesmo volume
`cogfood_cogfood-pg`. Health do app voltou de 503 a 200, banco saudável. Não houve
recriação de banco, mudança de imagem, migração ou sobrescrita do ambiente.

## Recuperação/rollback

Backups privados: `/root/barbacue-ifood/backups/webhook-20261023` (Compose/Nginx e
inspect do monitor) e `/srv/cog-webhooks/backups/ifood-20261023/env.before`.
Não exibir o conteúdo dos backups privados; podem conter credenciais.

Para interromper apenas o webhook, remover somente os três novos destinos do
mapa da central e recriar `router`, preservando rotas concorrentes e demais
variáveis; o polling anterior continua importando pedidos. Manter o receptor
rodando até drenar a fila; depois parar apenas `webhook`. Não remover a tabela,
volumes nem pedidos. Remover o include Nginx apenas se necessário, após comparar
com a configuração atual e validar `nginx -t`. Não restaurar banco.
