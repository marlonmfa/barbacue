# @barbacue/ifood

Integração com a **Merchant API do iFood** (pedidos + cardápio).

## Variáveis de ambiente (`.env` da raiz)

```
IFOOD_CLIENT_ID=
IFOOD_CLIENT_SECRET=
IFOOD_MERCHANT_ID=
IFOOD_POLL_INTERVAL_MS=30000
IFOOD_DRY_RUN=false
```

## Comandos

```bash
npm install
npm run doctor      --workspace=packages/ifood   # valida credenciais e lista lojas
npm run poll        --workspace=packages/ifood   # loop de eventos de pedido
npm run sync-menu   --workspace=packages/ifood   # Postgres -> catálogo iFood
npm run typecheck   --workspace=packages/ifood
```

Comece sempre com `IFOOD_DRY_RUN=true` — nenhum endpoint que muda estado é chamado.

## Arquitetura

| Arquivo | Papel |
|---|---|
| `config.ts` | bases das APIs + leitura do `.env` |
| `auth.ts` | OAuth `client_credentials`, cache do token (expira em 6h) |
| `http.ts` | fetch com Bearer, retry exponencial, respeito a `Retry-After`, refresh em 401 |
| `client.ts` | métodos por endpoint (merchant, events, order, catalog) |
| `poller.ts` | loop `GET /events:polling` → handler → `POST /events/acknowledgment` |
| `sync-menu.ts` | sincroniza categorias/produtos do Postgres para o iFood |
| `doctor.ts` | diagnóstico da integração |

## Endpoints usados

Base: `https://merchant-api.ifood.com.br`

| Módulo | Path |
|---|---|
| Auth | `POST /authentication/v1.0/oauth/token` (form-urlencoded: `grantType`, `clientId`, `clientSecret`) |
| Merchant | `GET /merchant/v1.0/merchants`, `/merchants/{id}`, `/merchants/{id}/status` |
| Events | `GET /events/v1.0/events:polling`, `POST /events/v1.0/events/acknowledgment` |
| Order | `GET /order/v1.0/orders/{id}` + `POST .../confirm`, `/startPreparation`, `/readyToPickup`, `/dispatch`, `/requestCancellation` |
| Catalog | `GET /catalog/v2.0/merchants/{id}/catalogs`, `.../categories`, `PUT /catalog/v2.0/merchants/{id}/items`, `PATCH .../products/status`, `PATCH .../products/price` |

Sandbox e produção usam as **mesmas URLs** — só mudam as credenciais do app.

## Cuidados

- **Rate limit do polling**: ~1 chamada a cada 30s por loja. Não reduza o intervalo.
- **ACK obrigatório**: evento sem `acknowledgment` volta no ciclo seguinte para sempre.
  O poller só dá ACK depois que o handler roda sem erro — falhas são reprocessadas.
- **SLA de confirmação**: a homologação verifica se pedidos `PLC` são confirmados a tempo.
- **Imagens no catálogo**: `imagePath` exige upload prévio pelo endpoint de imagem
  do Catalog; o `sync-menu` não envia imagens.
- **Catálogo é assíncrono**: o `PUT /items` retorna antes de o iFood processar.

## Painel e impressão no Windows

O handler padrão agora grava os pedidos no banco do painel antes de confirmar o evento. Reenvios usam um ID estável e não duplicam a fila. As transições recebidas atualizam o status local sem regredir pedidos concluídos/cancelados. Configure `DATABASE_URL` e `IFOOD_BRAND` (padrão `barbacue`) e aplique a migration web `0013_all_channel_printing`. O modo dry-run não grava no banco. Pedidos agendados imprimem a partir do horário de preparo.

Alterações locais de status não enviam comandos ao iFood: para ações externas, use o gestor iFood. Consulte `apps/desktop/INSTALAR.md`.
