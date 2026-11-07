import { createHash, timingSafeEqual } from "node:crypto";

export const ANOTA_EVENTS = ["accepted", "updated", "cancelled"] as const;
export type AnotaEvent = (typeof ANOTA_EVENTS)[number];
export const ANOTA_BRANDS = ["barbacue", "barbadog", "chelas"] as const;
export type AnotaBrand = (typeof ANOTA_BRANDS)[number];

export function isAnotaEvent(value: string): value is AnotaEvent {
  return (ANOTA_EVENTS as readonly string[]).includes(value);
}

export function anotaBrand(request: Request): AnotaBrand | null {
  const forwarded = request.headers.get("x-forwarded-host")?.split(",", 1)[0]?.trim();
  const hostname = (forwarded ?? request.headers.get("host") ?? new URL(request.url).hostname)
    .split(":", 1)[0]
    .toLowerCase();
  if (hostname === "barbacue.cog.ia.br") return "barbacue";
  if (hostname === "barbadog.cog.ia.br") return "barbadog";
  if (hostname === "chelas.cog.ia.br") return "chelas";
  return null;
}

export function anotaWebhookSecret(brand: AnotaBrand) {
  if (brand === "barbacue") return process.env.ANOTA_WEBHOOK_TOKEN_BARBACUE;
  if (brand === "barbadog") return process.env.ANOTA_WEBHOOK_TOKEN_BARBADOG;
  return process.env.ANOTA_WEBHOOK_TOKEN_CHELAS;
}

export function secureTokenEquals(received: string, expected: string) {
  const left = createHash("sha256").update(received).digest();
  const right = createHash("sha256").update(expected).digest();
  return timingSafeEqual(left, right);
}

export function webhookToken(request: Request, body: Record<string, unknown>) {
  const url = new URL(request.url);
  const authorization = request.headers.get("authorization") ?? "";
  return (
    url.searchParams.get("token") ??
    request.headers.get("x-external-token") ??
    request.headers.get("x-anota-token") ??
    (authorization.toLowerCase().startsWith("bearer ") ? authorization.slice(7).trim() : "") ??
    (typeof body.externalToken === "string" ? body.externalToken : "")
  );
}

export function providerOrderId(body: Record<string, unknown>) {
  const nested = body.order && typeof body.order === "object" ? body.order as Record<string, unknown> : null;
  const value = body.orderId ?? body.order_id ?? body.id ?? body._id ?? nested?.id ?? nested?._id;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
