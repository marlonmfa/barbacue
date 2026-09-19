/** Client-only presentation state. The server always revalidates the quote. */
export type DeliveryBrand = "barbacue" | "chelas" | "barbadog";
export type DeliveryAvailability = "loading" | "enabled" | "disabled" | "error";
export interface CheckoutDeliveryQuote {
  quoteId: string;
  address: string;
  requestedAddress: string;
  brand: DeliveryBrand;
  distanceMeters: number;
  durationSeconds: number;
  feeCents: number;
  expiresAt: string;
  provider: "osm";
}

export function quoteMatchesAddress(quote: CheckoutDeliveryQuote | null, address: string, brand: DeliveryBrand, now = Date.now()): quote is CheckoutDeliveryQuote {
  return Boolean(quote && quote.requestedAddress === address.trim() && quote.brand === brand &&
    Number.isFinite(Date.parse(quote.expiresAt)) && Date.parse(quote.expiresAt) > now &&
    Number.isSafeInteger(quote.feeCents) && quote.feeCents >= 0);
}

export function parseCheckoutQuote(data: unknown, requestedAddress: string, brand: DeliveryBrand): CheckoutDeliveryQuote {
  if (!data || typeof data !== "object") throw new Error("Não foi possível confirmar o valor do frete. Calcule novamente.");
  const value = data as Record<string, unknown>;
  if (typeof value.quoteId !== "string" || !value.quoteId || typeof value.address !== "string" ||
    typeof value.expiresAt !== "string" || !Number.isFinite(Date.parse(value.expiresAt)) || Date.parse(value.expiresAt) <= Date.now() ||
    !["feeCents", "distanceMeters", "durationSeconds"].every(key => typeof value[key] === "number" && Number.isSafeInteger(value[key]) && (value[key] as number) >= 0) ||
    !["osm"].includes(String(value.provider))) {
    throw new Error("Não foi possível confirmar o valor do frete. Calcule novamente.");
  }
  return {
    quoteId: value.quoteId, address: value.address, requestedAddress: requestedAddress.trim(), brand,
    feeCents: value.feeCents as number, distanceMeters: value.distanceMeters as number,
    durationSeconds: value.durationSeconds as number, expiresAt: value.expiresAt, provider: value.provider as "osm",
  };
}

export function checkoutAmounts(subtotalCents: number, discountCents: number, deliveryFeeCents = 0) {
  const discount = Math.max(0, Math.min(subtotalCents, discountCents));
  return { subtotal: subtotalCents, discount, deliveryFee: deliveryFeeCents, total: subtotalCents - discount + deliveryFeeCents };
}

export function deliveryEstimate(distanceMeters: number, durationSeconds: number) {
  const distance = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(distanceMeters / 1000);
  return `${distance} km · cerca de ${Math.max(1, Math.ceil(durationSeconds / 60))} min de trajeto`;
}
