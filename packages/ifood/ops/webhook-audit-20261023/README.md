# Auditoria dos eventos iFood — 23/10/2026

## Estado anterior e alteração publicada

O receptor apagava o payload depois de processar e preservava somente o ID do
evento, merchant, recebimento, processamento e tentativas. Não era possível
relacionar retrospectivamente cada notificação ao pedido.

Agora `ifood_webhook_inbox` preserva também:

- `order_id`: ID oficial do pedido no iFood;
- `event_code` e `event_full_code`: tipo do evento recebido;
- `event_created_at`: horário informado pelo iFood, normalizado em UTC, quando
  válido; ausente/inválido permanece NULL, sem inventar horário;
- `received_at` e `processed_at`: horários de recebimento e processamento;
- `local_order_id` e `local_status_at_processing`: vínculo e estado do pedido
  efetivamente encontrado no banco usado pelo painel, na marca correta.

O payload completo continua sendo removido depois do sucesso. A auditoria não
retém nomes, telefones, endereços ou itens. Reentrega não recria o pedido nem
reinicia processamento; apenas preenche metadados antigos que ainda estiverem
ausentes. Recebimento e processamento originais permanecem intactos.

Registros antigos com payload já removido são preservados com metadados NULL.
A migração recupera ID/tipos apenas de payloads ainda pendentes; o novo worker
também completa a auditoria ao processá-los. Não há recuperação fictícia dos
eventos antigos. Um reenvio legítimo pode enriquecer esses registros.

## Consulta de conferência

No host Barbacue, somente leitura:

```sh
docker exec barbacue-ifood-webhook-1 node packages/ifood/dist/webhook-audit.js
```

Mostra os últimos 50 eventos, seus horários, vínculo com o pedido, marca, valor e
status atual no banco do painel (`panel_present`, `panel_brand`, `panel_status`,
`panel_total_cents`). `local_status_at_processing` é o retrato no processamento;
`panel_status` pode mudar com eventos posteriores. Eventos `COG_WEBHOOK_*TEST`
são diagnóstico, não comprovam entrega comercial do iFood.

O vínculo prova a presença no banco que alimenta o painel. Para afirmar que o
pedido foi renderizado corretamente, conferir também o cartão correspondente em
`https://barbacue.cog.ia.br/admin/ifood`. Não confundir `processed_at` com
confirmação comercial do pedido nem com visualização humana.

## Schema, build e publicação

Aplicar explicitamente `audit.sql` no mesmo Postgres do Barbacue, antes de iniciar
o novo receptor. A migração adiciona colunas nullable e um índice; não altera
pedidos, contas, impressão, ambientes ou eventos existentes. Em instalações novas,
aplicar primeiro `../webhook-20261023/inbox.sql`, depois esta migração.

Dockerfile canônico preservado (`packages/ifood/Dockerfile`, Node oficial e
package-lock). Build:

```sh
docker build -f packages/ifood/Dockerfile -t barbacue-ifood:webhook-audit-20261023 .
```

Host `otherpagesandig`, SSH `root@91.108.125.60:2212`, contexto:
`/root/barbacue-ifood/build-webhook-audit-20261023`. Base Git
`0e15863ce599e30d19735f0b14b8b93ac930c238` com os arquivos desta alteração,
hashes em `source-revision.json`.

Imagem anterior do webhook:
`sha256:ea6dc78df502dc12b60159a051860a58b6f7f1f578c2dc69274bd6f3fcdd6c78`.
Imagem publicada:
`sha256:d8dbcea3a6d74d75b3b7c7d27cdf1a27c33c73439d995b009524681e004dc5e7`.

Somente `webhook` foi atualizado por Compose com `--no-deps --no-build --pull never`.
Monitor de polling, processo web/PM2, Food COG, gateway central, URLs, rotas,
credenciais e permissões iFood permaneceram iguais. O schema novo é compatível
com a imagem anterior. Backup privado do Compose e inspect em
`/root/barbacue-ifood/backups/webhook-audit-20261023`; não exibir o inspect, pois
pode conter segredos.

## Validação

- TypeScript e 26 testes passaram, incluindo metadados, horário com fuso, horário
  inválido, preservação após limpeza, reentrega sem reprocessar e vínculo por marca.
- `verify-audit.cjs` executado na imagem candidata com uma tabela temporária que
  oculta a fila real apenas naquela sessão. Confirmou metadados, deduplicação,
  limpeza e vínculo a um pedido existente sem alterar a fila ou pedidos reais.
- Após a publicação, três eventos de diagnóstico assinados passaram pela central,
  um por loja. HTTP 202 em 310 ms; reenvio 202 em 110 ms. Os três registros
  preservaram IDs, códigos, horários e vínculos corretos após `payload=NULL`.
- Não foram criados, confirmados ou cancelados pedidos comerciais no teste.
- O próximo evento comercial recebido passa a ter essa trilha de auditoria;
  os testes de diagnóstico não substituem a observação de entrega real.

## Rollback

Comparar o Compose atual com o backup e restaurar **somente** a imagem do serviço
`webhook` para `barbacue-ifood:webhook-20261023`, preservando mudanças concorrentes.
Recriar apenas `webhook`. Não remover colunas, índice, registros ou volumes.
Polling continua como contingência. Dados de auditoria já gravados permanecem
consultáveis mesmo com rollback, mas a imagem antiga não preencherá novos campos.
