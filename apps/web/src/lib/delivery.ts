import { z } from "zod";

export type DeliveryProviderName = "osm";
export type DeliveryCoordinates = { latitude: number; longitude: number };
export type DeliveryRouteLinks = { google: string; apple: string; osm: string };
export type DeliveryPricing = { baseFeeCents: number; feePerKmCents: number; minFeeCents: number; maxDistanceMeters: number };
export type DeliveryQuoteResponse = {
  quoteId: string; address: string; distanceMeters: number; durationSeconds: number;
  feeCents: number; expiresAt: string; routeLinks: DeliveryRouteLinks; provider: DeliveryProviderName;
};

export const DELIVERY_QUOTE_TTL_MS = 15 * 60_000;
export const deliveryProviderSchema = z.literal("osm");
export const deliveryAddressSchema = z.string().trim().min(12, "Informe rua, número, bairro e cidade.").max(400, "Endereço muito longo.")
  .refine(value => !/[\u0000-\u001f\u007f]/.test(value), "Endereço contém caracteres inválidos.")
  .transform(value => value.normalize("NFKC").replace(/\s+/g, " "));
export const deliveryCoordinatesSchema = z.object({ latitude: z.number().finite().min(-90).max(90), longitude: z.number().finite().min(-180).max(180) });
export const deliveryQuoteRequestSchema = z.object({ address: deliveryAddressSchema, brand: z.enum(["barbacue", "barbadog", "chelas"]) }).strict();
export const deliverySettingsSchema = z.object({
  enabled: z.boolean(), provider: deliveryProviderSchema,
  originAddress: z.string().trim().max(400).nullable(),
  originLatitude: z.number().finite().min(-90).max(90).nullable(),
  originLongitude: z.number().finite().min(-180).max(180).nullable(),
  baseFeeCents: z.number().int().min(0).max(100_000),
  feePerKmCents: z.number().int().min(0).max(100_000),
  minFeeCents: z.number().int().min(0).max(100_000),
  maxDistanceMeters: z.number().int().min(100).max(200_000),
}).strict().superRefine((value, ctx) => {
  if ((value.originLatitude === null) !== (value.originLongitude === null)) ctx.addIssue({ code: "custom", path: ["originLatitude"], message: "Informe latitude e longitude juntas." });
  if (value.enabled && (!deliveryAddressSchema.safeParse(value.originAddress).success || value.originLatitude === null || value.originLongitude === null)) ctx.addIssue({ code: "custom", path: ["originAddress"], message: "Localize o endereço de saída antes de ativar o frete." });
  if (value.enabled && value.baseFeeCents + value.feePerKmCents + value.minFeeCents === 0) ctx.addIssue({ code: "custom", path: ["baseFeeCents"], message: "Defina a tarifa de entrega antes de ativar o cálculo." });
});
export type DeliverySettingsInput = z.infer<typeof deliverySettingsSchema>;

/** Conservative comparison: apartment numbers and punctuation remain significant. */
export function deliveryAddressKey(address: string): string {
  return address.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");
}

/** Charge the outbound road route, rounded once to the nearest cent. */
export function calculateDeliveryFee(distanceMeters: number, pricing: DeliveryPricing): number {
  if (!Number.isSafeInteger(distanceMeters) || distanceMeters < 0 || !Number.isSafeInteger(pricing.maxDistanceMeters) || pricing.maxDistanceMeters <= 0 ||
      [pricing.baseFeeCents, pricing.feePerKmCents, pricing.minFeeCents].some(value => !Number.isSafeInteger(value) || value < 0)) {
    throw new DeliveryError("Não foi possível calcular uma tarifa válida.", "invalid_delivery_calculation", 502);
  }
  if (distanceMeters > pricing.maxDistanceMeters) throw new DeliveryError("Este endereço está fora da área de entrega. Escolha retirada ou fale com a loja.", "outside_delivery_area", 422);
  const fee = Math.max(pricing.minFeeCents, pricing.baseFeeCents + Math.round(distanceMeters * pricing.feePerKmCents / 1000));
  if (!Number.isSafeInteger(fee) || fee > 10_000_000) throw new DeliveryError("Não foi possível calcular uma tarifa válida.", "invalid_delivery_calculation", 502);
  return fee;
}

export function buildDeliveryRouteLinks(origin: DeliveryCoordinates, destination: DeliveryCoordinates): DeliveryRouteLinks {
  deliveryCoordinatesSchema.parse(origin); deliveryCoordinatesSchema.parse(destination);
  const start = `${origin.latitude},${origin.longitude}`;
  const end = `${destination.latitude},${destination.longitude}`;
  const google = new URL("https://www.google.com/maps/dir/");
  google.search = new URLSearchParams({ api: "1", origin: start, destination: end, travelmode: "driving" }).toString();
  const apple = new URL("https://maps.apple.com/");
  apple.search = new URLSearchParams({ saddr: start, daddr: end, dirflg: "d" }).toString();
  const osm = new URL("https://www.openstreetmap.org/directions");
  osm.search = new URLSearchParams({ engine: "fossgis_osrm_car", route: `${start};${end}` }).toString();
  return { google: google.href, apple: apple.href, osm: osm.href };
}

export class DeliveryError extends Error {
  code: string; status: number;
  constructor(message: string, code: string, status: number) { super(message); this.code = code; this.status = status; }
}

export function deliveryErrorResponse(error: unknown): Response {
  if (error instanceof DeliveryError) return Response.json({ error: error.code, message: error.message }, { status: error.status, headers: { "Cache-Control": "no-store", ...(error.status === 429 ? { "Retry-After": "60" } : {}) } });
  // Provider URLs can carry credentials. Never serialize underlying errors.
  return Response.json({ error: "delivery_unavailable", message: "Não foi possível calcular o frete agora. Tente novamente ou escolha retirada." }, { status: 503 });
}

export async function readDeliveryJson(request: Request): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    size += chunk.value.byteLength;
    if (size > 4096) { await reader.cancel(); throw new DeliveryError("Dados de entrega muito grandes.", "delivery_request_too_large", 413); }
    chunks.push(chunk.value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { return null; }
}
