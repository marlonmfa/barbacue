# WhatsApp Ordering Bot (Baileys)

Long-running Node service that lets customers order over WhatsApp. It is a **thin
bridge**: it owns the WhatsApp socket + per-contact conversation state, and
delegates every business decision to the web API (`apps/web`).

```
WhatsApp ──Baileys──> this service ──HTTP──> apps/web
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
| `SESSIONS_DIR` | Baileys auth-state dir (mounted as a Docker volume). |

## Run

```bash
# local dev (web must be running on WEB_BASE_URL)
npm install
npm run dev
```

On first run a QR code is printed to the terminal **and** exposed to the admin
panel at `/admin/whatsapp` (Administrador only). Scan it once from
WhatsApp → Aparelhos conectados. The pairing persists in `SESSIONS_DIR`, so
restarts reconnect automatically; only a logout from the phone forces re-pairing
(delete the sessions dir and scan again).

## Pairing status server

- `GET /health` — unauthenticated liveness probe.
- `GET /status` and `GET /qr` — require `x-bot-token` (or `?token=`); return
  `{ status, qrDataUrl, phoneNumber }`. The admin page reads these via the
  server-side proxy `apps/web/.../api/admin/whatsapp` which injects the token.

## Deploy

`docker-compose.yml` defines a `whatsapp-bot` service with a `whatsapp_sessions`
volume. It talks to `web` over the compose network and reads `BOT_API_TOKEN`.
