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

/** Convenience: base + effective + active flag for UI rendering. */
export function priceView(p: Product, now: Date = new Date()) {
  const active = isPromoActive(p, now);
  return {
    base: p.priceCents,
    effective: active ? (p.promoPriceCents as number) : p.priceCents,
    onSale: active,
  };
}
