# Pix do C6 Bank Empresas no checkout /pedir

O checkout online gera Pix dinâmico e só libera o pedido para a cozinha depois
que o banco confirma o pagamento. O provedor é escolhido por `PIX_PROVIDER`
(`asaas` ou `c6`). Cada checkout guarda o ambiente em que nasceu
(`sandbox`/`production` = Asaas, `c6:sandbox`/`c6:production` = C6), então trocar
o provedor não afeta pedidos já emitidos.

## Como funciona com o C6

- API Pix padrão BACEN v2 em `https://baas-api.c6bank.info` (sandbox:
  `https://baas-api-sandbox.c6bank.info`). OAuth2 `client_credentials` em
  `/v1/auth/`, sempre com mTLS usando o certificado da chave de API.
- Cobrança imediata `PUT /v2/pix/cob/{txid}`. O txid é o UUID do checkout sem
  hífens. Uma resposta perdida é recuperada por `GET` com o mesmo txid, e o banco
  recusa um segundo PUT com o mesmo txid. Não existe cobrança em dobro.
- QR Code gerado no servidor a partir do `pixCopiaECola` devolvido pelo banco.
- Confirmação por três vias, sempre consultando a cobrança no C6 (txid, valor e
  devoluções) antes de liberar: webhook, consulta da tela do cliente a cada 10 s
  e conciliação a cada 30 s no próprio servidor (`src/instrumentation.ts`; cobre
  aba fechada sem webhook; checkouts abertos das últimas 3 h).
- Cancelamento pelo cliente: `PATCH` para `REMOVIDA_PELO_USUARIO_RECEBEDOR`. Se o
  Pix já foi pago, o pedido é liberado e o cancelamento é recusado.
- Devolução registrada no C6 deixa o pagamento `failed`, sem nova comanda.

## Webhook

URL cadastrada: `https://barbacue.cog.ia.br/api/webhooks/c6/<C6_WEBHOOK_TOKEN>`.
O banco acrescenta `/pix`; a rota aceita os dois. O segredo vai no caminho e o
corpo é tratado só como aviso. Se o C6 exigir mTLS do lado do recebedor e o
webhook não chegar, a conciliação e a consulta do cliente continuam confirmando.

## Configuração (somente no ambiente do servidor/PM2)

| Variável | Valor |
|---|---|
| `PIX_PROVIDER` | `c6` |
| `C6_ENVIRONMENT` | `sandbox` ou `production` |
| `C6_CLIENT_ID` / `C6_CLIENT_SECRET` | da chave criada em C6 Web Banking → Meu perfil → Integrações via API |
| `C6_CERT_PATH` / `C6_KEY_PATH` | `.crt` e `.key` baixados na criação da chave (fora do git, `chmod 600`) |
| `C6_PIX_KEY` | chave Pix da conta que recebe |
| `C6_WEBHOOK_TOKEN` | segredo aleatório, 32+ caracteres |
| `C6_PIX_EXPIRATION_SECONDS` | validade do QR, padrão 3600 |

`node apps/web/scripts/configure-c6-pix.mjs` testa OAuth + certificado e mostra o
webhook atual. Com `--apply`, cadastra o webhook da chave. Não cria cobrança.

## Verificação

`DATABASE_URL=postgresql://.../barbacue_online_test_<id> node_modules/.bin/tsx
--tsconfig apps/web/tsconfig.json apps/web/tests/c6-checkout.integration.ts`
(banco descartável com o esquema atual e as migrações 0013 e 0018). Simula o
C6 localmente: concorrência, txid idempotente, resposta perdida, rejeição,
webhook forjado/repetido, pagamento parcial, devolução, cancelamento, corrida
pago × cancelado, conciliação com aba fechada e consulta do cliente.
