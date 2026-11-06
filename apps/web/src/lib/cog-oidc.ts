import type { CogIdentity } from "./cog-identity";
/** Confidential, host/tenant-bound RP. Tokens never enter client JavaScript. */
import { EncryptJWT, jwtDecrypt, jwtVerify, createRemoteJWKSet } from "jose";

export const FLOW_COOKIE = "barbacue_cog_flow";
export const GRANT_COOKIE = "barbacue_cog_grant";
export const CHECK_COOKIE = "barbacue_cog_checked";
const callbackPath = "/api/auth/cog/callback";
type Config = { origin: string; tenant: string; issuer: string; client: string; secret: string };
type Flow = { state: string; nonce: string; verifier: string; next: string };
type Grant = { token: string; email: string; sub: string };
const encoder = new TextEncoder();
const jwks = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

export function oidcConfig(origin: string): Config | null {
  const client = process.env.COG_OIDC_CLIENT_ID, secret = process.env.COG_OIDC_CLIENT_SECRET;
  if (!client || !secret) return null;
  try {
    const origins = JSON.parse(process.env.COG_OIDC_ORIGINS || "{}");
    const tenant = origins[origin];
    if (typeof tenant !== "string" || !["chelas", "barbadog"].includes(tenant)) return null;
    const rp = new URL(origin), issuer = new URL(process.env.COG_OIDC_ISSUER || "https://id.cog.ia.br");
    const qa = process.env.COGIA_SSO_DISPOSABLE_QA === "1";
    if (rp.origin !== origin || issuer.origin !== issuer.href.replace(/\/$/, "")) return null;
    if (!qa && (rp.protocol !== "https:" || issuer.origin !== "https://id.cog.ia.br")) return null;
    return { origin, tenant, issuer: issuer.origin, client, secret };
  } catch { return null; }
}
export function requestOrigin(h: Pick<Headers,"get">) {
  const host=(h.get("x-forwarded-host") || h.get("host") || "").split(",")[0].trim().toLowerCase();
  const protocol=(h.get("x-forwarded-proto") || "https").split(",")[0].trim();
  return `${protocol}://${host}`;
}

function random() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function key(purpose: string) {
  const secret = process.env.ADMIN_COOKIE_SECRET;
  if (!secret || secret.length < 16) throw new Error("ADMIN_COOKIE_SECRET indisponível.");
  return new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(`barbacue/cog-oidc/v1/${purpose}\0${secret}`)));
}
export async function seal(config: Config, purpose: "flow" | "grant", value: Flow | Grant, ttl: number) {
  return new EncryptJWT({ ...value, purpose, origin: config.origin, tenant: config.tenant })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" }).setIssuer(config.issuer).setAudience(config.client)
    .setIssuedAt().setExpirationTime(`${ttl}s`).encrypt(await key(purpose));
}
export async function unseal(config: Config, purpose: "flow" | "grant", token: string | undefined) {
  if (!token || token.length > 3500) return null;
  try {
    const { payload } = await jwtDecrypt(token, await key(purpose), {
      issuer: config.issuer, audience: config.client, keyManagementAlgorithms: ["dir"], contentEncryptionAlgorithms: ["A256GCM"],
    });
    return payload.purpose === purpose && payload.origin === config.origin && payload.tenant === config.tenant ? payload : null;
  } catch { return null; }
}
export function safeNext(value: string | null) {
  return value && /^\/(?!\/|api(?:\/|$)|_next(?:\/|$))/.test(value) && !/[\\\r\n]/.test(value) && value.length < 1500 ? value : "/admin";
}
export async function startFlow(config: Config, next: string | null, interactive = false) {
  const flow: Flow = { state: random(), nonce: random(), verifier: random(), next: safeNext(next) };
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(flow.verifier)));
  const challenge = btoa(String.fromCharCode(...digest)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const url = new URL("/authorize", config.issuer);
  url.search = new URLSearchParams({ client_id: config.client, redirect_uri: config.origin + callbackPath,
    response_type: "code", scope: "openid email profile", prompt: "none", state: flow.state, nonce: flow.nonce,
    code_challenge: challenge, code_challenge_method: "S256" }).toString();
  if(interactive)url.searchParams.delete("prompt");
  return { url: url.href, cookie: await seal(config, "flow", flow, 300) };
}
async function backend(config: Config, path: string, options: RequestInit) {
  return fetch(config.issuer + path, { ...options, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(5000) });
}
function verifiedEmail(data: Record<string, unknown>) {
  return data.email_verified === true && typeof data.email === "string" && /^[^\s@]+@[^\s@]+$/.test(data.email)
    ? data.email.trim().toLowerCase() : null;
}
export async function completeFlow(config: Config, cookie: string | undefined, params: URLSearchParams) {
  const flow = await unseal(config, "flow", cookie);
  if (!flow || params.getAll("state").length !== 1 || params.get("state") !== flow.state) throw new Error("Fluxo inválido.");
  const next = safeNext(typeof flow.next === "string" ? flow.next : null);
  if (params.has("error")) return { next, grant: null };
  const code = params.get("code");
  if (!code || params.getAll("code").length !== 1 || code.length > 2048 || typeof flow.verifier !== "string") throw new Error("Código inválido.");
  const response = await backend(config, "/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code, client_id: config.client, client_secret: config.secret,
      redirect_uri: config.origin + callbackPath, code_verifier: flow.verifier }).toString() });
  if (!response.ok) throw new Error("Provedor indisponível.");
  const data = await response.json();
  if (data.token_type?.toLowerCase() !== "bearer" || typeof data.access_token !== "string" || data.access_token.length > 1024 ||
      typeof data.id_token !== "string" || !Number.isFinite(data.expires_in) || data.expires_in <= 0) throw new Error("Resposta inválida.");
  let keys = jwks.get(config.issuer);
  if (!keys) { keys = createRemoteJWKSet(new URL("/jwks.json", config.issuer), { timeoutDuration: 5000 }); jwks.set(config.issuer, keys); }
  const { payload } = await jwtVerify(data.id_token, keys, { issuer: config.issuer, audience: config.client, algorithms: ["RS256"], requiredClaims: ["exp", "iat", "sub", "nonce"] });
  const email = verifiedEmail(payload);
  if (!email || payload.nonce !== flow.nonce || typeof payload.sub !== "string" || (payload.azp && payload.azp !== config.client)) throw new Error("Identidade inválida.");
  const identity = await backend(config, "/userinfo", { headers: { Authorization: `Bearer ${data.access_token}` } });
  if (!identity.ok) throw new Error("Sessão indisponível.");
  const user = await identity.json();
  if (user.sub !== payload.sub || verifiedEmail(user) !== email) throw new Error("Identidade divergente.");
  const ttl = Math.min(3600, Math.floor(data.expires_in), Number(payload.exp) - Math.floor(Date.now() / 1000));
  if (ttl <= 0) throw new Error("Sessão expirada.");
  return { next, grant: { cookie: await seal(config, "grant", { token: data.access_token, email, sub: payload.sub }, ttl), email, admin: user.cog_admin === true, ttl } };
}
export async function resolveOidcIdentity(config: Config | null, cookie: string | undefined): Promise<CogIdentity | null> {
  if (!config) return null;
  const grant = await unseal(config, "grant", cookie);
  if (!grant || typeof grant.token !== "string") return null;
  try {
    const response = await backend(config, "/userinfo", { headers: { Authorization: `Bearer ${grant.token}` } });
    if (!response.ok) return null;
    const user = await response.json(), email = verifiedEmail(user);
    return email && email === grant.email && user.sub === grant.sub ? { email, admin: user.cog_admin === true, source: "oidc" } : null;
  } catch { return null; }
}
export async function resolveOidcEmail(config: Config | null, cookie: string | undefined) { return (await resolveOidcIdentity(config,cookie))?.email ?? null; }
export async function revokeOidc(config: Config | null, cookie: string | undefined) {
  if (!config) return;
  const grant = await unseal(config, "grant", cookie);
  if (!grant || typeof grant.token !== "string") return;
  const response = await backend(config, "/revoke", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token: grant.token, client_id: config.client, client_secret: config.secret }).toString() });
  if (!response.ok) throw new Error("Não foi possível encerrar a sessão Cog. Tente novamente.");
}
