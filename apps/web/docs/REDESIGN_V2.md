# Barbacue — Redesign & Hardening v2 (2026-06-23)

Driven by a 6-surface read-only audit (see session). The app had a solid security
*core* (HMAC cookies, scrypt, server-side price re-sourcing, atomic coupon
reservation) but was ~half-built against the owner's brief. This document records
the decisions made while closing the gaps. **Decisions are authoritative** — change
them here first.

## Brief → status

| Brief goal | Before | After |
|---|---|---|
| Modern dark **red/black** layout, fluid | Dark theme present but static, off-brand banner | Animations, skeletons, branded fallbacks, sticky banner |
| **Missing images** fixed | Emoji fallback only when `imageUrl` null (broke on dead CDN URLs) | `onError` → branded `ProductImage` fallback |
| 4 user types: admin / manager / **table** / customer | table/mesa type did **not exist** | Full QR dine-in flow |
| Dedicated **Instagram + WhatsApp** place | 2 header chips only; IG feed built but unrendered | Branded `<Footer>` + `<InstagramFeed>` |
| **AI agent** order end-to-end + Q&A | delivery happy-path only; no coupons; wrong closure check; **PII IDOR** | coupons, schedule-aware, descriptions, dine-in, IDOR fixed |
| add/remove/**coupons** work | `minOrderCents` bypassable on direct POST; coupon burns on insert failure | enforced at order time, wrapped in a transaction |

## Key decisions

1. **Images** — keep `unoptimized` on `next/image` (the anota.ai CDN is flaky from
   non-browser contexts; routing it through Next's server optimizer adds a failure
   point). Fix is an `onError` state → shared branded `ProductImage`/`ImageFallback`
   (logo mark on `--surface-2` with an ember gradient). No `remotePatterns`.

2. **Table / Mesa data model**
   - `restaurant_tables(id, number unique, label, token uuid unique defaultRandom, active, createdAt)`
   - `orders.table_id` (FK, nullable) + `orders.order_type` enum `delivery|dine_in` (default `delivery`).
   - `channel` (how: click/chat) and `orderType` (where: delivery/dine_in) stay orthogonal.
   - QR encodes `/mesa/<token>`. The route handler resolves an **active** table, sets a
     `barbacue_table` cookie (number+token, base64url, ~3h, not httpOnly so the UI can show "Mesa N"),
     and redirects to `/`. Unknown/inactive token → `/?mesa=notfound`.
   - Dine-in orders: `deliveryAddress` forced null, address never requested, phone optional, name required.
   - Migration: drizzle **0004** (journal idx 4). Local dev DB has known drift → applied via `db:push`.

3. **Role model** (least privilege; brief honored where safe)
   - `requireStaff` (admin **or** manager): products, categories, coupons, orders, customers,
     closed-days, **tables/mesas**, and **general settings** (name, tagline, social, hours, delivery text).
   - `requireRole('admin')`: staff accounts, WhatsApp bot, impersonate, system/API keys, and the
     **Pix secret** fields inside settings (managers' updates to `pix*` are stripped).
   - **Deviation documented:** staff-account management stays admin-only. Creating accounts and
     assigning roles is a privilege-escalation surface; "manager manages funcionários" from the brief
     is interpreted as day-to-day operations, not account/role administration.
   - Enforcement is now **in every handler** (`withStaff`/`withRole`), not only the proxy — the proxy
     authenticated *any* session but checked no role, so 13/14 admin routes were manager-writable.

4. **Order correctness** — coupon reservation + customer upsert + order insert run inside a single
   `db.transaction`; `minOrderCents` is enforced at order time (throws → rolls back the `usedCount`
   increment); `changeForCents` must be ≥ total; delivery orders require a non-empty address; the API
   returns a human pt-BR `message` field and the client stops rendering raw Zod JSON.

5. **AI agent** — `apply_coupon` tool; closure via `computeStoreStatus` (matches `/api/orders`);
   product `description`s injected with an anti-hallucination rule; **IDOR fixed** — saved customer
   record + order history load **only** for a valid `x-bot-token` request (the bot has verified the
   WhatsApp number), never from a phone a public web user types.

## Implementation notes discovered during verification

- **Dine-in still requires name + phone** (only the *address* is dropped). A phone is
  useful for "pedido pronto" contact even at a table, and it keeps `orders.customerPhone`
  (NOT NULL/unique) and the agent's `go_to_payment` gate intact. Documented as the pragmatic choice.
- **`table-session` was split**: `table-session-shared.ts` holds the client-safe
  `TABLE_COOKIE` + `TableSession` type (no `next/headers`); `table-session.ts` keeps the
  server-only `cookies()`/`NextResponse` helpers. A client component importing the cookie
  name otherwise pulled `next/headers` into the browser bundle and broke `next build`.
- **`assertSecretsConfigured` softened**: hard-fails only on a missing/short cookie secret
  or no password at all (genuinely broken); a placeholder `ADMIN_PASSWORD` in production is
  WARNED, not blocked — so a not-yet-rotated live deploy isn't bricked.
- **Role guards** applied to every `/api/admin/*` handler via `withStaff`/`withRole`
  (the proxy authenticates but never checked role). The Mesas API is `withStaff` (managers
  manage tables); staff/whatsapp/impersonate/system/Pix-fields are `withRole("admin")`.

## Verification (run `bash scripts/e2e_smoke.sh` against `next dev`)

29/30 automated checks pass (the 1 "fail" was a test bug — a 1-char name tripped Zod before
the closed-store check; re-verified passing with a valid name). Plus manual agent checks:
order end-to-end ✅, menu Q&A ✅, dine-in via QR (no address asked, navigates as dine_in) ✅,
PII IDOR fixed (web chat won't reveal a saved address; a valid `x-bot-token` still can) ✅.
`tsc --noEmit` clean, `next build` green.

## Test matrix — see session test plan (admin, manager, table, customer-delivery, customer-dine-in, agent).
