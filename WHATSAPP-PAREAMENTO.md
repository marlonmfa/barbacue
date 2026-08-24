# Pareamento WhatsApp — diagnóstico e correções (2026-08-23)

Registro do incidente em que **nenhuma das 3 contas** (barbacue, chelas, barbadogs)
conseguiu parear pelo painel online, e das decisões tomadas na correção.

## Estado encontrado em produção

VPS `72.60.31.220`, PM2 `barbacue-whatsapp` (`/root/barbacue-whatsapp`, porta 3021),
**9 dias no ar sem restart**, build de 13/08.

| Conta | Status no `/status` | Pasta de sessão |
|---|---|---|
| barbacue | `disconnected`, QR nulo — travado | `creds.json` com `registered:false` + `me:47997056624` + `pairingCode` órfão (23/08 22:33) |
| chelas | oscilando `qr_ready` ⇄ `disconnected` a cada ~20s | vazia |
| barbadogs | oscilando `qr_ready` ⇄ `disconnected` a cada ~20s | vazia |

Medição ao vivo (3 leituras, 25s de intervalo) — o hash do QR mudava a cada leitura
e o status caía para `disconnected` no meio do caminho:

```
01:13:15  chelas qr_ready 1aac51f4 | barbadogs disconnected
01:13:40  chelas qr_ready ec35b3b9 | barbadogs qr_ready ac851f5f
01:14:05  chelas disconnected      | barbadogs qr_ready ac851f5f
```

Infra estava **correta** e não era a causa: `BOT_STATUS_URL=http://127.0.0.1:3021`
batia com `BOT_PORT=3021`, mesmo `BOT_API_TOKEN` nos dois processos, porta ouvindo,
nginx ok. O `EADDRINUSE :::3001` no log de erro é histórico (anterior ao `BOT_PORT`).

## Causa raiz

Os handlers do Baileys eram registrados sobre o objeto **da sessão** (`s`), não sobre
**o socket**. Como o Baileys continua emitindo eventos depois de `end()`, o `close` do
socket antigo chegava quando o substituto já estava no ar e executava
`s.socket = null; s.status = "disconnected"` — matando o socket novo, apagando o QR
recém-gerado e agendando uma reconexão duplicada.

Cadeia completa:

1. `startHub()` abria os 3 sockets no boot mesmo sem ninguém para parear. Ninguém
   escaneia → Baileys esgota os refs do QR → fecha com 408 → o loop de reconexão
   reabre. Rodou por 9 dias: da ordem de 78 mil tentativas de conexão do mesmo IP.
2. Ao clicar em "parear", `pair()` matava o socket ativo e chamava `connect()`, que
   zerava `manualDisconnect` **antes** do `close` do socket antigo chegar. O handler
   órfão então anulava o socket novo → flapping.
3. O painel faz poll a cada 5s e exibia `qrDataUrl`. O QR mostrado pertencia a um
   socket já descartado → escanear não fazia nada.
4. No fluxo por número, `requestPairingCode` era chamado após um `setTimeout(1500)`
   fixo. O código chegou a ser emitido (está no `creds.json` do barbacue) mas o socket
   morreu antes do `pair-success` → `registered` ficou `false`. **Esse `creds.json`
   meio-escrito passou a envenenar toda tentativa seguinte** do barbacue.
5. `pino({level:"silent"})` + nenhum `console.log` no `close` → os logs do PM2 não
   registram nada desde 14/08. Não havia como diagnosticar pelo painel nem pelo log.

Reprodução lado a lado (mesmo teste, hub de produção vs. corrigido):

```
########## HUB DE PRODUÇÃO (com bug) ##########
3) socket VELHO fecha   : disconnected | sockets: 2
4) 2,6s depois          : qr_ready     | sockets: 3 <- sockets duplicados = 1

########## HUB CORRIGIDO ##########
3) socket VELHO fecha   : qr_ready     | sockets: 2
4) 2,6s depois          : qr_ready     | sockets: 2 <- sockets duplicados = 0
```

## Correções aplicadas

`apps/whatsapp-bot/src/wa/hub.ts`

1. **Guarda de geração.** Cada `connect()` incrementa `session.generation` e captura o
   valor; todo handler começa com `if (!current()) return`. Eventos de sockets
   superados — inclusive `creds.update` — são ignorados. Isso mata o clobbering e os
   `setTimeout` de reconexão órfãos de uma vez.
2. **`pair()` sempre limpa a pasta de auth** antes de conectar. Um pareamento parcial
   nunca mais contamina a tentativa seguinte.
3. **`requestPairingCode` espera `waitForSocketOpen()`** em vez do sleep fixo de 1,5s.
4. **Janela de pareamento de 3 minutos** (`PAIRING_WINDOW_MS`). Fora dela, uma conta
   não pareada **não** reconecta: registra `lastError` e aguarda ação do admin. Contas
   já registradas continuam reconectando com backoff (2s→60s).
5. **`startHub()` só reabre contas com `creds.registered === true`.** Conta não pareada
   não gera QR que ninguém vai escanear.
6. **515 (`restartRequired`) tratado à parte** — é o restart obrigatório logo após o
   `pair-success`, reconecta em 250ms e não conta como falha.
7. **401 (`loggedOut`) limpa as credenciais** e pede novo pareamento.
8. **`Browsers.ubuntu("Chrome")`** no lugar de `Browsers.ubuntu("Barbacue Central")` —
   o WhatsApp valida essa string no handshake de pairing code. Era o que o
   `wa/socket.ts` (que funcionava) usava.
9. **Observabilidade**: linhas `[wa:<conta>]` em todo evento de ciclo de vida, campo
   `lastError` exposto no `/status`, `BOT_LOG_LEVEL` para subir o log do Baileys, e
   `unhandledRejection` logado em `index.ts`.
10. **Teto de memória**: `MAX_CHATS = 200` por conta. O processo estava em 441 MB RSS
    com heap a 89,6% numa VPS de 3,9 GB sem swap.

### Regressões adjacentes corrigidas no mesmo arquivo

- **O bot havia parado de responder clientes.** `handleMessage` era importado em
  `index.ts` mas nunca chamado — o `messages.upsert` do `hub.ts` só arquivava. A ponte
  com o agente de pedidos, que existia em `wa/socket.ts`, sumiu na migração para
  multi-conta. Restaurada via `onInboundMessage(handleMessage)`.
- `apps/whatsapp-bot/src/wa/socket.ts` era código morto (nenhum import) — removido.

`apps/web`

- `api/admin/whatsapp/[...path]/route.ts`: timeout de 10s → 30s para `/pair`. O
  handshake pode passar de 10s e o abort virava um falso "Serviço WhatsApp offline".
- `whatsapp/WhatsAppPortal.tsx`: erro de pareamento agora aparece **dentro do modal**
  (`role="alert"`). A única barra de erro existente ficava atrás do backdrop — uma
  falha de pareamento parecia "não ter acontecido nada". Também: estado ocupado nos
  botões, e `POST /pair-cancel` ao fechar o modal para o hub parar de renovar o QR.
- `next.config.ts`: `distDir` configurável por `NEXT_DIST_DIR`. Dois dev servers
  dividindo o mesmo `.next` corrompem os chunks do cliente e a página serve mas
  **nunca hidrata** — foi o que travou o teste visual até isolar o diretório.

## Testes

```
cd apps/whatsapp-bot && npm test          # 8 testes, mocka o Baileys
```

O teste `THE regression: a superseded socket's close event cannot touch the live
session` foi executado contra o `hub.js` baixado da VPS e **falha** lá — é guarda de
regressão real, não teste tautológico.

Visual (precisa de Postgres e do stub do bot):

```
cd apps/web
BOT_API_TOKEN=test-token PORT=3999 node tests/fake-bot-server.mjs &
NEXT_DIST_DIR=.next-test npx next build && \
  NEXT_DIST_DIR=.next-test BOT_STATUS_URL=http://127.0.0.1:3999 \
  BOT_API_TOKEN=test-token npx next start -p 3055 &
ADMIN_PASSWORD=... BASE=http://127.0.0.1:3055 node tests/whatsapp-pairing.visual.mjs
```

Use o build de produção: o `next dev` desta máquina não hidratava a página de login,
e o clique no submit virava submit nativo (o formulário é client component).

Screenshots: `test-screenshots/whatsapp-pairing-qr-2026-08-23.png` e
`test-screenshots/whatsapp-pairing-error-2026-08-23.png`.

## Deploy

O bot em produção roda de `/root/barbacue-whatsapp` (**não** de `/root/barbacue`), com
o env vindo do PM2, não de `.env` — `config.ts` resolve `../../../.env` a partir de
`dist/`, que na VPS cai em `/.env` e não existe.

```
rsync -a --delete apps/whatsapp-bot/dist/ root@72.60.31.220:/root/barbacue-whatsapp/dist/
ssh root@72.60.31.220 'rm -rf /root/barbacue-whatsapp-sessions/*'   # creds envenenadas
ssh root@72.60.31.220 'pm2 restart barbacue-whatsapp && pm2 logs barbacue-whatsapp --lines 40'
```

O `rm -rf` das sessões é necessário nesta primeira vez: a pasta do barbacue tem o
`creds.json` meio-escrito. Depois disso o `pair()` já limpa sozinho.

Após o restart, parear **uma conta por vez** pelo painel — a janela é de 3 minutos e o
log passa a dizer exatamente o que aconteceu em cada passo.
