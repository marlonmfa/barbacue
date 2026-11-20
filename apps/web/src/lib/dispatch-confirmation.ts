import { createHash, createHmac, timingSafeEqual } from "node:crypto";

function sign(value: string) {
  const key = process.env.ADMIN_COOKIE_SECRET;
  if (!key) throw new Error("ADMIN_COOKIE_SECRET is not configured");
  return createHmac("sha256", key).update(value).digest("hex");
}

export function routeConfirmationToken(routeId: string) {
  return sign(`dispatch-route:${routeId}`);
}

export function routeConfirmationHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function deliveryCodeHash(orderId: string, code: string) {
  return sign(`dispatch-code:${orderId}:${code}`);
}

export function matchesDeliveryCode(orderId: string, expected: string, code?: string) {
  return !!code && /^[a-f0-9]{64}$/.test(expected) &&
    timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(deliveryCodeHash(orderId, code), "hex"));
}
