import type { Product } from "@/db/schema";

// A product's promo fields are the minimal shape the helpers below need, so
// callers can pass a full Product row or a lighter projection.
export interface PromoPricable {
  priceCents: number;
  promoPriceCents?: number | null;
  promoStartsAt?: Date | string | null;
  promoEndsAt?: Date | string | null;
}

function toTime(v: Date | string | null | undefined): number | null {
  if (!v) return null;
  const t = v instanceof Date ? v.getTime() : Date.parse(v);
  return Number.isNaN(t) ? null : t;
}

/** True when a product has an active promotion at `now`. A null window edge
 * means "open-ended" (started already / never ends). */
export function isPromoActive(p: PromoPricable, now: Date = new Date()): boolean {
  if (p.promoPriceCents == null) return false;
  // A promo price >= base price is not a discount; ignore it.
  if (p.promoPriceCents >= p.priceCents) return false;
  const t = now.getTime();
  const starts = toTime(p.promoStartsAt);
  const ends = toTime(p.promoEndsAt);
  if (starts !== null && t < starts) return false;
  if (ends !== null && t > ends) return false;
  return true;
}

/** The price the customer actually pays right now (promo if active, else base). */
export function effectivePrice(p: PromoPricable, now: Date = new Date()): number {
  return isPromoActive(p, now) ? (p.promoPriceCents as number) : p.priceCents;
}

/**
 * Parse a human-typed price into integer cents. Handles both pt-BR ("1.234,56",
 * "12,90") and en/plain ("1,234.56", "12.90", "12") forms, plus stray "R$" and
 * spaces. Returns NaN when there is no parseable number.
 *
 * The rule: the LAST separator in the string is the decimal point, and every
 * other separator is a grouping mark — EXCEPT a single dot followed by exactly
 * three digits with no comma present ("1.500"), which pt-BR users mean as
 * thousands (R$1.500), not R$1,50. This is what a naive `.replace(/\./g,"")`
 * got catastrophically wrong: it turned the seeded "12.90" into 1290 → R$1.290.
 */
export function parseReais(input: string): number {
  const cleaned = input.replace(/[^\d.,]/g, "");
  if (!cleaned) return NaN;

  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  const lastSep = Math.max(lastComma, lastDot);

  let normalized: string;
  if (lastSep === -1) {
    normalized = cleaned; // whole reais, no decimals
  } else {
    const decimals = cleaned.length - lastSep - 1;
    const dotThousands = cleaned[lastSep] === "." && lastComma === -1 && decimals === 3;
    normalized = dotThousands
      ? cleaned.replace(/[.,]/g, "")
      : cleaned.slice(0, lastSep).replace(/[.,]/g, "") + "." + cleaned.slice(lastSep + 1);
  }

  const cents = Math.round(parseFloat(normalized) * 100);
  return Number.isFinite(cents) ? cents : NaN;
}

/** Convenience: base + effective + active flag for UI rendering. */
export function priceView(p: Product, now: Date = new Date()) {
  const active = isPromoActive(p, now);
  return {
    base: p.priceCents,
    effective: active ? (p.promoPriceCents as number) : p.priceCents,
    onSale: active,
  };
}
