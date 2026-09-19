import { eq } from "drizzle-orm";
import { db } from "@/db";
import { deliveryQuotes, deliverySettings } from "@/db/schema";
import { buildDeliveryRouteLinks, calculateDeliveryFee, DELIVERY_QUOTE_TTL_MS, DeliveryError, deliveryAddressKey, deliverySettingsSchema, type DeliveryProviderName, type DeliveryQuoteResponse, type DeliverySettingsInput } from "@/lib/delivery";
import { deliveryProviderConfigured, getDeliveryProvider } from "@/lib/delivery-provider";

const defaults = { id: 1, enabled: false, provider: "osm" as const, originAddress: null, originLatitude: null, originLongitude: null, baseFeeCents: 0, feePerKmCents: 0, minFeeCents: 0, maxDistanceMeters: 10_000, updatedAt: null };

export async function readDeliverySettings() {
  const [settings] = await db.select().from(deliverySettings).where(eq(deliverySettings.id, 1));
  return settings ?? defaults;
}

export async function deliverySettingsOverview() {
  return { settings: await readDeliverySettings(), providers: { osm: { configured: deliveryProviderConfigured("osm") } } };
}

export async function saveDeliverySettings(input: DeliverySettingsInput) {
  if (input.enabled && !deliveryProviderConfigured(input.provider)) throw new DeliveryError("Configure o provedor de mapas no servidor antes de ativar o frete.", "delivery_provider_not_configured", 422);
  const [settings] = await db.insert(deliverySettings).values({ id: 1, ...input, originAddress: input.originAddress?.trim() || null, updatedAt: new Date() })
    .onConflictDoUpdate({ target: deliverySettings.id, set: { ...input, originAddress: input.originAddress?.trim() || null, updatedAt: new Date() } }).returning();
  return { settings, providers: { osm: { configured: deliveryProviderConfigured("osm") } } };
}

function configSnapshot(settings: DeliverySettingsInput) {
  return JSON.stringify({ enabled: settings.enabled, provider: settings.provider, originAddress: settings.originAddress, originLatitude: settings.originLatitude, originLongitude: settings.originLongitude, baseFeeCents: settings.baseFeeCents, feePerKmCents: settings.feePerKmCents, minFeeCents: settings.minFeeCents, maxDistanceMeters: settings.maxDistanceMeters });
}

export async function createDeliveryQuote(input: { address: string; brand: "barbacue" | "chelas" | "barbadog" }): Promise<DeliveryQuoteResponse> {
  const settings = await readDeliverySettings();
  if (!settings.enabled) throw new DeliveryError("O cálculo automático de frete está desativado. Atualize o pedido para continuar com as condições atuais da loja.", "delivery_disabled", 409);
  const parsed = deliverySettingsSchema.safeParse({ enabled: settings.enabled, provider: settings.provider, originAddress: settings.originAddress, originLatitude: settings.originLatitude, originLongitude: settings.originLongitude, baseFeeCents: settings.baseFeeCents, feePerKmCents: settings.feePerKmCents, minFeeCents: settings.minFeeCents, maxDistanceMeters: settings.maxDistanceMeters });
  if (!parsed.success) throw new DeliveryError("A origem ou tarifa de entrega precisa ser configurada pela loja.", "delivery_not_configured", 503);
  const config = parsed.data;
  const provider = getDeliveryProvider(config.provider);
  const origin = { latitude: config.originLatitude!, longitude: config.originLongitude! };
  const destination = await provider.geocode(input.address);
  const route = await provider.route(origin, destination);
  const feeCents = calculateDeliveryFee(route.distanceMeters, config);
  const routeLinks = buildDeliveryRouteLinks(origin, destination);
  const expiresAt = new Date(Date.now() + DELIVERY_QUOTE_TTL_MS);
  // No database transaction is held across a remote maps request. Recheck the
  // configuration under a read lock before persisting its immutable quote.
  return db.transaction(async tx => {
    const [current] = await tx.select().from(deliverySettings).where(eq(deliverySettings.id, 1)).for("share");
    if (!current?.enabled) throw new DeliveryError("O cálculo automático de frete foi desativado. Atualize o pedido.", "delivery_disabled", 409);
    if (configSnapshot(current as DeliverySettingsInput) !== configSnapshot(config)) throw new DeliveryError("A tarifa de entrega mudou. Calcule o frete novamente.", "delivery_settings_changed", 409);
    const [quote] = await tx.insert(deliveryQuotes).values({
      brand: input.brand, address: input.address, addressKey: deliveryAddressKey(input.address), provider: config.provider,
      ...route, feeCents, originLatitude: origin.latitude, originLongitude: origin.longitude,
      destinationLatitude: destination.latitude, destinationLongitude: destination.longitude, routeLinks, expiresAt,
    }).returning();
    return { quoteId: quote.id, address: quote.address, distanceMeters: quote.distanceMeters, durationSeconds: quote.durationSeconds, feeCents: quote.feeCents, expiresAt: quote.expiresAt.toISOString(), routeLinks: quote.routeLinks, provider: quote.provider as DeliveryProviderName };
  });
}
