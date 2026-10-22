import { loadIfoodStores, storeLocalIso, type IfoodAction, type IfoodStore } from "@/lib/ifood";

// Cliente iFood do servidor web. O segredo fica só no ambiente do servidor (PM2);
// o navegador e o aplicativo desktop recebem apenas o resultado das chamadas.
// A leitura de eventos continua exclusiva do monitor (packages/ifood): aqui só
// há consultas e ações sobre pedidos e lojas, nunca polling ou ACK.

const BASE = "https://merchant-api.ifood.com.br";

export class IfoodApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export function ifoodSettings() {
  const clientId = process.env.IFOOD_CLIENT_ID?.trim() ?? "";
  const clientSecret = process.env.IFOOD_CLIENT_SECRET?.trim() ?? "";
  return {
    configured: Boolean(clientId && clientSecret),
    // Mesma chave do monitor: ações só chegam ao iFood com IFOOD_DRY_RUN=false.
    dryRun: process.env.IFOOD_DRY_RUN !== "false",
    clientId, clientSecret,
    stores: loadIfoodStores(),
  };
}

let cached: { token: string; expiresAt: number; clientId: string } | null = null;
let inflight: Promise<string> | null = null;

async function token(refresh = false): Promise<string> {
  const { configured, clientId, clientSecret } = ifoodSettings();
  if (!configured) throw new IfoodApiError("Credenciais do iFood não configuradas no servidor.", 503);
  if (!refresh && cached && cached.clientId === clientId && Date.now() < cached.expiresAt) return cached.token;
  inflight ??= (async () => {
    const res = await fetch(`${BASE}/authentication/v1.0/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grantType: "client_credentials", clientId, clientSecret }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new IfoodApiError(`O iFood recusou as credenciais (${res.status}).`, 502);
    const data = await res.json() as { accessToken?: string; expiresIn?: number };
    if (!data.accessToken) throw new IfoodApiError("Resposta de autenticação do iFood sem token.", 502);
    cached = { token: data.accessToken, clientId, expiresAt: Date.now() + Math.max(60, (data.expiresIn ?? 3600) - 300) * 1000 };
    return data.accessToken;
  })().finally(() => { inflight = null; });
  return inflight;
}

async function call<T>(path: string, init: { method?: string; body?: unknown } = {}, retry = true): Promise<T | null> {
  const res = await fetch(`${BASE}${path}`, {
    method: init.method ?? "GET",
    headers: { Authorization: `Bearer ${await token()}`, ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}) },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  if (res.status === 401 && retry) { await token(true); return call<T>(path, init, false); }
  if (res.status === 404) return null;
  if (!res.ok) {
    const detail = await res.json().then((d: { message?: string; error?: { message?: string } }) => d?.error?.message ?? d?.message).catch(() => null);
    throw new IfoodApiError(detail ? `iFood: ${detail}` : `O iFood respondeu ${res.status}.`, res.status >= 500 ? 502 : res.status === 429 ? 429 : 409);
  }
  const text = await res.text();
  return text ? JSON.parse(text) as T : null;
}

export interface StoreStatus { operation?: string; salesChannel?: string; available?: boolean; state?: string; message?: { title?: string; subtitle?: string; description?: string } | null; reopenable?: { identifier?: string; type?: string; reopenable?: boolean } | null }
export interface Interruption { id: string; description?: string; start?: string; end?: string }

export async function storeOverview(store: IfoodStore) {
  const [status, interruptions] = await Promise.allSettled([
    call<StoreStatus[]>(`/merchant/v1.0/merchants/${store.id}/status`),
    call<Interruption[]>(`/merchant/v1.0/merchants/${store.id}/interruptions`),
  ]);
  return {
    ...store,
    status: status.status === "fulfilled" ? status.value ?? [] : null,
    interruptions: interruptions.status === "fulfilled" ? interruptions.value ?? [] : null,
    error: status.status === "rejected" ? (status.reason instanceof Error ? status.reason.message : "Falha ao consultar a loja.") : null,
  };
}

export function getIfoodOrder(externalId: string) {
  return call<Record<string, unknown>>(`/order/v1.0/orders/${encodeURIComponent(externalId)}`);
}

export async function cancellationReasons(externalId: string) {
  return (await call<{ cancelCodeId: string; description: string }[]>(`/order/v1.0/orders/${encodeURIComponent(externalId)}/cancellationReasons`)) ?? [];
}

function assertLive() {
  if (ifoodSettings().dryRun) throw new IfoodApiError("Modo simulação ativo (IFOOD_DRY_RUN). Nenhuma ação foi enviada ao iFood.", 409);
}

export async function runIfoodAction(externalId: string, action: IfoodAction, cancel?: { cancellationCode: string; reason: string }) {
  assertLive();
  const id = encodeURIComponent(externalId);
  if (action === "cancel") {
    if (!cancel) throw new IfoodApiError("Escolha o motivo do cancelamento.", 422);
    await call(`/order/v1.0/orders/${id}/requestCancellation`, { method: "POST", body: cancel });
    return;
  }
  await call(`/order/v1.0/orders/${id}/${action}`, { method: "POST" });
}

export async function pauseStore(store: IfoodStore, minutes: number, description: string) {
  assertLive();
  const start = new Date();
  return call<Interruption>(`/merchant/v1.0/merchants/${store.id}/interruptions`, {
    method: "POST",
    body: { description, start: storeLocalIso(start), end: storeLocalIso(new Date(start.getTime() + minutes * 60_000)) },
  });
}

export async function resumeStore(store: IfoodStore, interruptionId: string) {
  assertLive();
  await call(`/merchant/v1.0/merchants/${store.id}/interruptions/${encodeURIComponent(interruptionId)}`, { method: "DELETE" });
}
