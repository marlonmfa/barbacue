# Integração iFood — guia e checklist (barbacue)

Fonte: [developer.ifood.com.br](https://developer.ifood.com.br/pt-BR/docs/getting-started/first-steps/integration-flow) — consultado em 15/08/2026.

O iFood divide a jornada em **3 fases**: setup → sandbox → produção.

---

## Fase 1 — Setup

### 1. Criar a conta de desenvolvedor

- Cadastre-se em <https://developer.ifood.com.br>.
- ⚠️ O e-mail **não pode** já estar associado a uma conta do Portal do Parceiro.
  Se `marlonmfa@gmail.com` já é usado na loja, crie a conta de dev com outro e-mail
  (ex.: `dev@…`) e depois vincule a loja por "Solicitar acesso".
- Ao criar a conta você recebe automaticamente **uma loja de teste** e **um app de teste**.
- Boas práticas no cadastro da integradora: nome único e curto, descrição do propósito
  da empresa, logo legível em tamanho pequeno e sem texto embutido.

### 2. Copiar as credenciais

Portal → **Meus Apps** → app de teste → copie `client_id` e `client_secret`.
Cole no `.env` da raiz do monorepo:

```
IFOOD_CLIENT_ID=...
IFOOD_CLIENT_SECRET=...
IFOOD_MERCHANT_ID=          # preencha no passo seguinte
```

Descubra o `merchantId` rodando:

```bash
npm run doctor --workspace=packages/ifood
```

Ele autentica, lista as lojas autorizadas e imprime os UUIDs.

---

## Fase 2 — Validar em sandbox

### 3. Gerar um pedido de teste

Pelo portal (automático) ou pelo app/site do iFood na loja de teste (manual).

### 4. Receber eventos

Duas opções — **escolha uma**:

| | Polling | Webhook |
|---|---|---|
| Como | `GET /events/v1.0/events:polling` a cada ~30s | iFood chama um endpoint HTTPS seu |
| Infra | nenhuma | domínio público + TLS |
| Latência | até 30s | tempo real |
| Recomendado para | o barbacue hoje | SaaS multi-loja |

O `packages/ifood` implementa **polling** (`npm run poll`). Depois de processar cada
evento é obrigatório confirmar com `POST /events/v1.0/events/acknowledgment` — sem ACK
o evento retorna indefinidamente.

Códigos de evento principais: `PLC` (pedido feito), `CFM` (confirmado), `RTP` (pronto),
`DSP` (despachado), `CON` (concluído), `CAN` (cancelado).

### 5. Consultar o pedido

`GET /order/v1.0/orders/{id}` devolve itens, valores, endereço, pagamento e status.

### 6. Explorar os módulos

| Módulo | Função | Usar no barbacue? |
|---|---|---|
| Order | ciclo de vida dos pedidos | **sim** |
| Catalog | cardápio e disponibilidade | **sim** |
| Merchant | horários, status da loja, interrupções | sim |
| Financial | conciliação | depois |
| Shipping | entrega com entregadores iFood | se usar entrega iFood |
| Review | avaliações | opcional |

---

## Fase 3 — Produção

### 7. Criar o app de produção

Só depois de os testes em sandbox passarem. No portal, novo app com:

- **Categoria:** `Food`
- **Módulos:** marque apenas os que a integração realmente usa (Order, Catalog, Merchant).
  Módulos a mais atrasam a homologação.

### 8. Homologação

O iFood valida principalmente:

- confirmação de pedidos dentro do SLA;
- tratamento correto de cancelamentos;
- respostas em tempo hábil (sem travar o fluxo).

### 9. Solicitar acesso às lojas

Com o app aprovado, peça autorização **para cada loja de produção** — Barbacue,
Barbadog e Chelas precisam de aprovação individual. Cada loja vira um `merchantId`.

### 10. Operar

Mesmas URLs do sandbox; só mudam as credenciais. Monitore a página de status do iFood
e mantenha retry automático (já implementado em `http.ts`).

---

## Checklist

**Fase 1**

- [ ] Conta criada em developer.ifood.com.br com e-mail livre
- [ ] `client_id` / `client_secret` do app de teste no `.env`
- [ ] `npm run doctor` autentica e lista a loja de teste
- [ ] `IFOOD_MERCHANT_ID` preenchido

**Fase 2**

- [ ] Pedido de teste gerado no portal
- [ ] `npm run poll` recebe o evento `PLC`
- [ ] Pedido confirmado automaticamente (`POST /confirm`)
- [ ] ACK enviado — o mesmo evento não reaparece no ciclo seguinte
- [ ] `GET /orders/{id}` traz itens e endereço corretos
- [ ] Fluxo completo: PLC → CFM → RTP → DSP → CON
- [ ] Cancelamento testado (`cancellationReasons` + `requestCancellation`)
- [ ] `npm run sync-menu` com `IFOOD_DRY_RUN=true` mostra o cardápio esperado
- [ ] `sync-menu` real reflete categorias e produtos no catálogo de teste

**Fase 3**

- [ ] App de produção criado (categoria Food, só os módulos necessários)
- [ ] Homologação submetida e aprovada
- [ ] Acesso solicitado e aprovado para Barbacue / Barbadog / Chelas
- [ ] `merchantId` de cada loja em produção configurado
- [ ] Poller rodando como serviço no `docker-compose` com restart automático
- [ ] Alerta se o polling ficar > 5 min sem sucesso

---

## Onde isso encaixa no monorepo

```
packages/ifood/          novo — cliente + poller + sync de cardápio
  src/config.ts          bases das APIs e .env
  src/auth.ts            OAuth client_credentials (token 6h)
  src/http.ts            fetch com retry / refresh de token
  src/client.ts          endpoints por módulo
  src/poller.ts          loop de eventos  → npm run poll
  src/sync-menu.ts       Postgres → catálogo  → npm run sync-menu
  src/doctor.ts          diagnóstico          → npm run doctor
```

Próximo passo natural: ligar o `poller` ao Postgres e ao bot de WhatsApp, para que um
pedido do iFood apareça no mesmo painel `/admin` dos pedidos do site.
