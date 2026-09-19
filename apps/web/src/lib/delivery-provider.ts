import { DeliveryError, deliveryAddressKey, deliveryCoordinatesSchema, type DeliveryCoordinates, type DeliveryProviderName } from "./delivery.ts";

type ProviderEnvironment = Record<string, string | undefined>;
export type DeliveryGeocode = DeliveryCoordinates & { address: string };
export type DeliveryRoadRoute = { distanceMeters: number; durationSeconds: number };
type ProviderOptions = { env?: ProviderEnvironment; fetch?: typeof fetch };
const CACHE_TTL_MS = 15 * 60_000;
const MAX_CACHE_ENTRIES = 500;

function configuredUrl(value: string | undefined, env: ProviderEnvironment): URL {
  try {
    if (!value) throw new Error();
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error();
    const host = url.hostname.toLowerCase().replace(/\.$/, "");
    if (env.NODE_ENV === "production" && ["nominatim.openstreetmap.org", "router.project-osrm.org", "routing.openstreetmap.de"].includes(host)) throw new Error();
    return url;
  } catch { throw new DeliveryError("O serviço de mapas ainda não está configurado. Fale com a loja.", "delivery_provider_not_configured", 503); }
}

function osmUserAgent(env: ProviderEnvironment): string {
  const value = env.DELIVERY_OSM_USER_AGENT ?? "";
  if (value.length < 12 || value.length > 250 || /[\r\n]/.test(value)) throw new DeliveryError("Identificação do serviço de mapas não configurada.", "delivery_provider_not_configured", 503);
  return value;
}

export function deliveryProviderConfigured(provider: DeliveryProviderName, env: ProviderEnvironment = process.env): boolean {
  if (provider !== "osm") return false;
  try { configuredUrl(env.DELIVERY_NOMINATIM_URL, env); configuredUrl(env.DELIVERY_OSRM_URL, env); osmUserAgent(env); return true; } catch { return false; }
}

function endpoint(base: URL, path: string): URL { return new URL(`${base.href.replace(/\/$/, "")}/${path}`); }
function unavailable(): DeliveryError { return new DeliveryError("O serviço de mapas está indisponível. Tente novamente ou escolha retirada.", "delivery_provider_unavailable", 503); }
function notFound(): DeliveryError { return new DeliveryError("Não localizamos esse endereço com precisão. Informe rua, número, bairro e cidade.", "delivery_address_not_found", 422); }
function noRoute(): DeliveryError { return new DeliveryError("Não encontramos uma rota de entrega até esse endereço. Confira o endereço ou escolha retirada.", "delivery_route_not_found", 422); }

export class DeliveryProvider {
  private env: ProviderEnvironment;
  private transport: typeof fetch;
  private cache = new Map<string, { value: DeliveryGeocode; expiresAt: number }>();
  private pending = new Map<string, Promise<DeliveryGeocode>>();
  private nextOsmRequestAt = 0;
  private activeRequests = 0;
  readonly name: DeliveryProviderName;

  constructor(name: DeliveryProviderName, options: ProviderOptions = {}) {
    this.name = name; this.env = options.env ?? process.env; this.transport = options.fetch ?? fetch;
  }

  private assertConfigured() {
    if (!deliveryProviderConfigured(this.name, this.env)) throw new DeliveryError("O serviço de mapas ainda não está configurado. Fale com a loja.", "delivery_provider_not_configured", 503);
  }

  private async json(url: URL | string, init: RequestInit = {}): Promise<unknown> {
    if (this.activeRequests >= 4) throw unavailable();
    this.activeRequests++;
    const timeout = Math.max(100, Math.min(15_000, Number(this.env.DELIVERY_PROVIDER_TIMEOUT_MS) || 8000));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await this.transport(url, { ...init, redirect: "error", signal: controller.signal, cache: "no-store" });
      if (!response.ok) throw unavailable();
      const reader = response.body?.getReader();
      if (!reader) throw unavailable();
      const chunks: Uint8Array[] = []; let size = 0;
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > 256_000) { await reader.cancel(); throw unavailable(); }
        chunks.push(chunk.value);
      }
      return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch { throw unavailable(); }
    finally { clearTimeout(timer); this.activeRequests--; }
  }

  async geocode(address: string): Promise<DeliveryGeocode> {
    this.assertConfigured();
    const key = deliveryAddressKey(address);
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) return { ...cached.value };
    const pending = this.pending.get(key);
    if (pending) return pending;
    if (this.pending.size >= 4) throw unavailable();
    const promise = this.geocodeUncached(address).then(value => {
      if (this.cache.size >= MAX_CACHE_ENTRIES) this.cache.delete(this.cache.keys().next().value!);
      this.cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
      return { ...value };
    }).finally(() => this.pending.delete(key));
    this.pending.set(key, promise);
    return promise;
  }

  private async geocodeUncached(address: string): Promise<DeliveryGeocode> {
    // One geocoding request per second per process, including different IPs.
    // Production requires self-hosted/contracted endpoints, never demo defaults.
    const startsAt = Math.max(Date.now(), this.nextOsmRequestAt);
    this.nextOsmRequestAt = startsAt + 1000;
    if (startsAt > Date.now()) await new Promise(resolve => setTimeout(resolve, startsAt - Date.now()));
    const url = endpoint(configuredUrl(this.env.DELIVERY_NOMINATIM_URL, this.env), "search");
    url.search = new URLSearchParams({ q: address, format: "jsonv2", addressdetails: "1", limit: "1", countrycodes: "br", "accept-language": "pt-BR" }).toString();
    const body = await this.json(url, { headers: { "User-Agent": osmUserAgent(this.env), Accept: "application/json" } });
    if (!Array.isArray(body) || !body[0]) throw notFound();
    const result = body[0] as { lat?: string; lon?: string; display_name?: string; addresstype?: string; address?: { house_number?: string } };
    const coordinates = deliveryCoordinatesSchema.safeParse({ latitude: typeof result.lat === "string" && result.lat.trim() ? Number(result.lat) : NaN, longitude: typeof result.lon === "string" && result.lon.trim() ? Number(result.lon) : NaN });
    const precise = (typeof result.address?.house_number === "string" && result.address.house_number.trim().length > 0) || ["house", "building", "amenity", "shop", "office", "tourism"].includes(result.addresstype ?? "");
    if (!coordinates.success || !precise) throw notFound();
    const label = typeof result.display_name === "string" && result.display_name.trim().length > 0 && result.display_name.length <= 500 && !/[\u0000-\u001f\u007f]/.test(result.display_name)
      ? result.display_name.trim() : address;
    return { ...coordinates.data, address: label };
  }

  async route(origin: DeliveryCoordinates, destination: DeliveryCoordinates): Promise<DeliveryRoadRoute> {
    this.assertConfigured(); deliveryCoordinatesSchema.parse(origin); deliveryCoordinatesSchema.parse(destination);
    const url = endpoint(configuredUrl(this.env.DELIVERY_OSRM_URL, this.env), `route/v1/driving/${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}`);
    url.search = new URLSearchParams({ overview: "false", alternatives: "false", steps: "false" }).toString();
    const body = await this.json(url, { headers: { "User-Agent": osmUserAgent(this.env), Accept: "application/json" } }) as { code?: string; routes?: { distance?: number; duration?: number }[] };
    if (body.code === "NoRoute" || body.code === "NoSegment") throw noRoute();
    if (body.code !== "Ok") throw unavailable();
    const route = body.routes?.[0];
    if (!route) throw noRoute();
    const distance = route.distance; const duration = route.duration;
    if (typeof distance !== "number" || !Number.isFinite(distance) || distance < 0 || distance > 20_000_000 || typeof duration !== "number" || !Number.isFinite(duration) || duration < 0 || duration > 10_000_000) throw unavailable();
    return { distanceMeters: Math.ceil(distance), durationSeconds: Math.ceil(duration) };
  }
}

const shared = new Map<DeliveryProviderName, { fingerprint: string; instance: DeliveryProvider }>();
export function getDeliveryProvider(name: DeliveryProviderName): DeliveryProvider {
  const fingerprint = [process.env.DELIVERY_NOMINATIM_URL, process.env.DELIVERY_OSRM_URL, process.env.DELIVERY_OSM_USER_AGENT, process.env.DELIVERY_PROVIDER_TIMEOUT_MS, process.env.NODE_ENV].join("|");
  const current = shared.get(name);
  if (current?.fingerprint === fingerprint) return current.instance;
  const instance = new DeliveryProvider(name);
  shared.set(name, { fingerprint, instance }); return instance;
}
