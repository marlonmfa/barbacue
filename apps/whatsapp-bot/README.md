# WhatsApp Ordering Bot

Long-running Node service that lets customers order over WhatsApp. It is a **thin
bridge**: it maintains per-connection, per-contact conversation state and
delegates every business decision to the web API (`apps/web`).

```
WhatsApp ──zap.cog.ia.br──> this service ──HTTP──> apps/web
  POST /api/chat         → AI agent (menu, cart, customer, repeat last order)
  GET  /api/store-status → open now? within hours?
  POST /api/orders       → create order + Pix (re-sources prices, validates hours)
```

Because the bot reuses `/api/chat` and `/api/orders`, all pricing, promotions,
coupons and business-hours rules live in **one** place and behave identically on
web, mobile and WhatsApp.

## Conversation flow

1. Inbound message → appended to the contact's history → `POST /api/chat` with
   `customerPhone` (the verified WhatsApp number = "logged-in" identity).
2. The AI agent updates the cart/customer and may call `repeat_last_order` for
   returning customers (re-validated to current availability + price).
3. When the agent signals `navigate`, the bot checks `/api/store-status`, then
   `POST /api/orders` (`channel: "chat"`), and replies with:
   - order confirmation + total,
   - a web link (`/confirmation/<id>`) and optional app deep link,
   - the **Pix copia-e-cola** payload as its own message (easy to copy).

If the store is closed or an item is unavailable, `/api/orders` returns 422 with
a friendly reason that the bot relays.

## Environment (root `.env`)

| Var | Purpose |
| --- | --- |
| `WEB_BASE_URL` | Where the web API lives (`http://localhost:3000` dev, `http://web:3000` compose). |
| `BOT_API_TOKEN` | Shared secret. Required for `/api/orders/history` and the status server. |
| `BOT_PORT` | Status/QR HTTP port (default 3001). |
| `APP_DEEPLINK_BASE` | Optional deep link to finish in the app; order id is appended. |
| `SESSIONS_DIR` | Legacy local auth-state dir; retained for compatibility, not used by the Zap provider. |

## Run

```bash
# local dev (web must be running on WEB_BASE_URL)
npm install
npm run dev
```

Pair at `/whatsapp` (administrator only) using a code entered on the phone.
The brand domains select their own connection; the “Todos” tab or
`/whatsapp?brand=all` selects the integrated connection. The configured targets are:

| Connection | Phone |
| --- | --- |
| Chelas | +55 47 98824-9667 |
| Barbadog | +55 47 93389-2175 |
| Barbacue | +55 47 99705-6624 |
| Integrated | +55 47 99971-8315 |

Click the pairing option, generate the code, and enter it in WhatsApp →
Linked devices → Link a device → Link with phone number. No QR scan is required.
Connections are created only on explicit pairing; existing remote sessions
and credentials are preserved.

## Pairing status server

- `GET /health` — unauthenticated liveness probe.
- `GET /status` and `GET /qr` — require `x-bot-token` (or `?token=`); return
  `{ status, qrDataUrl, phoneNumber }`. The admin page reads these via the
  server-side proxy `apps/web/.../api/admin/whatsapp` which injects the token.

## Deploy

`docker-compose.yml` defines a `whatsapp-bot` service with a `whatsapp_sessions`
volume. It talks to `web` over the compose network and reads `BOT_API_TOKEN`.

## Provider zap.cog.ia.br

The WhatsApp connection is delegated exclusively to the Zap API. Set
`ZAP_API_TOKEN` and use `ZAP_API_BASE_URL=https://zap.cog.ia.br/api/v1`.
Optionally pin the integrated remote session with `ZAP_SESSION_ID`. Other
connections are discovered by their configured phone or stable name
`barbacue:central`, `barbacue:barbacue`, `barbacue:barbadog`, `barbacue:chelas`.
Unrelated sessions are never adopted. A missing connection is created only
when its pairing button is used.

Set a random `ZAP_WEBHOOK_SECRET` and expose
`https://barbacue.cog.ia.br/api/webhooks/zap` as `ZAP_WEBHOOK_URL`. The bot
registers the `message.incoming` and `message.outgoing` webhooks on startup,
validates the HMAC signature, and sends incoming text to the ordering agent.

The portal requests phone pairing for the selected connection and displays its
code. Webhooks include the remote session ID; replies use that same connection,
and equal customer phone numbers in different connections have separate carts
and histories. If `ZAP_API_TOKEN` is empty, the service reports a configuration
error; it never starts a second local Baileys connection.
