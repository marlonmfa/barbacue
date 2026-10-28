// Login social dos clientes: Google, Apple, Instagram e Facebook (OAuth 2.0).
//
// Instagram: "Instagram API with Instagram Login". Desde dez/2024 a Meta só
// autentica contas Profissionais (Comercial/Criador) por aqui — contas pessoais
// recebem erro na tela da Meta. Por isso o Facebook fica ao lado como opção que
// funciona para qualquer pessoa. Detalhes de configuração: docs/LOGIN-SOCIAL.md.
//
// Este módulo é puro (sem banco nem next/headers) para poder ser testado.
import { createHmac, createSign, randomBytes, timingSafeEqual } from "node:crypto";

export type SocialProvider = "google" | "apple" | "instagram" | "facebook";
export const SOCIAL_PROVIDERS: SocialProvider[] = ["google", "apple", "instagram", "facebook"];

export type SocialProfile = { provider: SocialProvider; id: string; name: string; username?: string; email?: string };

export const STATE_COOKIE = "barbacue_oauth_state";
export const STATE_MAX_AGE = 60 * 10; // 10 minutos para concluir o login

const graphVersion = () => process.env.META_GRAPH_VERSION || "v23.0";

const ENV_PREFIX: Record<SocialProvider, string> = { google: "GOOGLE", apple: "APPLE", instagram: "INSTAGRAM", facebook: "FACEBOOK" };

function credentials(provider: SocialProvider) {
  if (provider === "apple") {
    const env = process.env;
    if (!env.APPLE_CLIENT_ID || !env.APPLE_TEAM_ID || !env.APPLE_KEY_ID || !env.APPLE_PRIVATE_KEY) return null;
    return { id: env.APPLE_CLIENT_ID, secret: appleClientSecret() };
  }
  const prefix = ENV_PREFIX[provider];
  const id = process.env[provider === "google" ? `${prefix}_CLIENT_ID` : `${prefix}_APP_ID`];
  const secret = process.env[provider === "google" ? `${prefix}_CLIENT_SECRET` : `${prefix}_APP_SECRET`];
  return id && secret ? { id, secret } : null;
}

// A Apple não usa segredo fixo: o client_secret é um JWT ES256 assinado com a
// chave .p8 do Sign in with Apple (válido por até 6 meses; geramos a cada uso).
export function appleClientSecret(now = Date.now()) {
  const env = process.env;
  const key = (env.APPLE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n");
  const b64 = (v: object) => Buffer.from(JSON.stringify(v)).toString("base64url");
  const iat = Math.floor(now / 1000);
  const unsigned = `${b64({ alg: "ES256", kid: env.APPLE_KEY_ID })}.${b64({ iss: env.APPLE_TEAM_ID, iat, exp: iat + 300, aud: "https://appleid.apple.com", sub: env.APPLE_CLIENT_ID })}`;
  const signature = createSign("SHA256").update(unsigned).sign({ key, dsaEncoding: "ieee-p1363" }).toString("base64url");
  return `${unsigned}.${signature}`;
}

/** Lê o payload de um id_token recebido direto do provedor por TLS (OIDC 3.1.3.7). */
function idTokenClaims(token: unknown): Record<string, unknown> {
  if (typeof token !== "string" || token.split(".").length !== 3) throw new Error("id_token ausente");
  return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
}

export function isProviderConfigured(provider: SocialProvider) {
  let configured = false;
  try { configured = credentials(provider) !== null; } catch { configured = false; }
  return configured && (process.env.ADMIN_COOKIE_SECRET ?? "").length >= 16;
}

export function configuredProviders(): SocialProvider[] {
  return SOCIAL_PROVIDERS.filter(isProviderConfigured);
}

export function parseProvider(value: string): SocialProvider | null {
  return (SOCIAL_PROVIDERS as string[]).includes(value) ? (value as SocialProvider) : null;
}

// ─── Origem pública ───────────────────────────────────────────────────────────
// O callback precisa voltar ao mesmo domínio que iniciou o login (o cookie de
// estado e o de sessão são por domínio). Só aceitamos os domínios das marcas,
// nunca um Host arbitrário — senão um Host forjado viraria redirect_uri.

function normalizeHost(value: string | null | undefined) {
  return (value ?? "").split(",")[0].trim().toLowerCase();
}

function hostOf(url: string | undefined) {
  if (!url) return null;
  try { return new URL(url).host.toLowerCase(); } catch { return null; }
}

export function allowedHosts(): string[] {
  return [
    hostOf(process.env.APP_URL),
    hostOf(process.env.PUBLIC_SITE_URL),
    normalizeHost(process.env.DOMAIN_BARBA),
    normalizeHost(process.env.DOMAIN_CHELAS),
    normalizeHost(process.env.DOMAIN_HOTDOG),
  ].filter((h): h is string => Boolean(h));
}

/** Origem (https://host) do pedido, se o host for um dos domínios conhecidos. */
export function publicOrigin(forwardedHost: string | null, host: string | null, forwardedProto: string | null): string | null {
  const candidate = normalizeHost(forwardedHost) || normalizeHost(host);
  if (!candidate || !allowedHosts().includes(candidate)) return null;
  const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(candidate);
  const proto = local ? (normalizeHost(forwardedProto) || "http") : "https";
  return `${proto}://${candidate}`;
}

export function callbackUrl(origin: string, provider: SocialProvider) {
  return `${origin}/api/auth/${provider}/callback`;
}

/** Só caminhos internos ("/", "/cart"…), para não virar open redirect. */
export function safeReturnTo(value: string | null | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/";
  return value.slice(0, 200);
}

// ─── Estado (anti-CSRF) ───────────────────────────────────────────────────────

function sign(payload: string) {
  const secret = process.env.ADMIN_COOKIE_SECRET;
  if (!secret || secret.length < 16) throw new Error("Sessão de cliente não configurada.");
  return createHmac("sha256", secret).update(`oauth:${payload}`).digest("base64url");
}

export function createState(provider: SocialProvider, returnTo: string, now = Date.now()) {
  const nonce = randomBytes(16).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ p: provider, n: nonce, r: safeReturnTo(returnTo), e: now + STATE_MAX_AGE * 1000 })).toString("base64url");
  const cookie = `${payload}.${sign(payload)}`;
  return { nonce, cookie };
}

/** Confere cookie assinado + nonce devolvido pela Meta. Retorna o destino final. */
export function verifyState(cookie: string | undefined, returnedState: string | null, provider: SocialProvider, now = Date.now()) {
  if (!cookie || !returnedState) return null;
  const [payload, mac] = cookie.split(".");
  if (!payload || !mac) return null;
  const expected = Buffer.from(sign(payload)); const actual = Buffer.from(mac);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as { p: string; n: string; r: string; e: number };
    const nonceOk = typeof data.n === "string" && data.n.length === returnedState.length && timingSafeEqual(Buffer.from(data.n), Buffer.from(returnedState));
    if (data.p !== provider || !nonceOk || !(data.e > now)) return null;
    return { returnTo: safeReturnTo(data.r) };
  } catch { return null; }
}

// ─── Fluxo OAuth ──────────────────────────────────────────────────────────────

export function authorizeUrl(provider: SocialProvider, redirectUri: string, state: string) {
  const creds = credentials(provider);
  if (!creds) throw new Error(`${provider} não configurado`);
  if (provider === "google") {
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.search = new URLSearchParams({ client_id: creds.id, redirect_uri: redirectUri, response_type: "code", scope: "openid email profile", state, prompt: "select_account" }).toString();
    return url.toString();
  }
  if (provider === "apple") {
    // Com escopos, a Apple exige response_mode=form_post: o retorno é um POST.
    const url = new URL("https://appleid.apple.com/auth/authorize");
    url.search = new URLSearchParams({ client_id: creds.id, redirect_uri: redirectUri, response_type: "code", scope: "name email", response_mode: "form_post", state }).toString();
    return url.toString();
  }
  if (provider === "instagram") {
    const url = new URL("https://www.instagram.com/oauth/authorize");
    url.search = new URLSearchParams({ client_id: creds.id, redirect_uri: redirectUri, response_type: "code", scope: "instagram_business_basic", state, enable_fb_login: "0", force_reauth: "true" }).toString();
    return url.toString();
  }
  const url = new URL(`https://www.facebook.com/${graphVersion()}/dialog/oauth`);
  url.search = new URLSearchParams({ client_id: creds.id, redirect_uri: redirectUri, response_type: "code", scope: "public_profile,email", state }).toString();
  return url.toString();
}

async function json(res: Response) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Provedor respondeu ${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
  return body as Record<string, unknown>;
}

/** Nome enviado pela Apple só no primeiro login, no campo "user" do form_post. */
export function appleUserName(raw: string | null | undefined) {
  try {
    const name = (JSON.parse(raw ?? "") as { name?: { firstName?: string; lastName?: string } }).name;
    return [name?.firstName, name?.lastName].filter(Boolean).join(" ").trim().slice(0, 100) || undefined;
  } catch { return undefined; }
}

/** Troca o code por token e busca o perfil. Lança erro em qualquer falha. */
export async function fetchProfile(provider: SocialProvider, code: string, redirectUri: string, fetchImpl: typeof fetch = fetch, extra: { appleName?: string } = {}): Promise<SocialProfile> {
  const creds = credentials(provider);
  if (!creds) throw new Error(`${provider} não configurado`);

  if (provider === "google" || provider === "apple") {
    const tokenBody = await json(await fetchImpl(provider === "google" ? "https://oauth2.googleapis.com/token" : "https://appleid.apple.com/auth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: creds.id, client_secret: creds.secret, grant_type: "authorization_code", redirect_uri: redirectUri, code }),
    }));
    const claims = idTokenClaims(tokenBody.id_token);
    const issuers = provider === "google" ? ["https://accounts.google.com", "accounts.google.com"] : ["https://appleid.apple.com"];
    const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!issuers.includes(String(claims.iss)) || !audience.includes(creds.id)) throw new Error(`${provider}: id_token de outro emissor`);
    if (typeof claims.exp === "number" && claims.exp * 1000 < Date.now()) throw new Error(`${provider}: id_token expirado`);
    const id = typeof claims.sub === "string" ? claims.sub : "";
    if (!id) throw new Error(`${provider} não devolveu o id do usuário`);
    // Só usamos o e-mail para vincular contas quando o provedor o confirmou.
    const verified = claims.email_verified === true || claims.email_verified === "true";
    const email = verified && typeof claims.email === "string" ? claims.email.trim().toLowerCase() : undefined;
    const name = (provider === "google" ? (typeof claims.name === "string" ? claims.name.trim() : "") : extra.appleName)
      || email?.split("@")[0] || (provider === "google" ? "Cliente Google" : "Cliente Apple");
    return { provider, id, name: name.slice(0, 100), email };
  }
  // A Meta às vezes anexa "#_" ao code do Instagram.
  const cleanCode = code.replace(/#_$/, "");

  if (provider === "instagram") {
    const tokenBody = await json(await fetchImpl("https://api.instagram.com/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: creds.id, client_secret: creds.secret, grant_type: "authorization_code", redirect_uri: redirectUri, code: cleanCode }),
    }));
    // Formato antigo: { access_token, user_id }; novo: { data: [{ access_token, user_id }] }.
    const token = (Array.isArray(tokenBody.data) ? tokenBody.data[0] : tokenBody) as { access_token?: string };
    if (!token?.access_token) throw new Error("Instagram não devolveu access_token");
    const me = await json(await fetchImpl(`https://graph.instagram.com/${graphVersion()}/me?fields=user_id,username,name&access_token=${encodeURIComponent(token.access_token)}`));
    const id = String(me.user_id ?? me.id ?? "");
    if (!id) throw new Error("Instagram não devolveu o id do usuário");
    const username = typeof me.username === "string" ? me.username : undefined;
    const name = (typeof me.name === "string" && me.name.trim()) || (username ? `@${username}` : "Cliente Instagram");
    return { provider, id, name: name.slice(0, 100), username };
  }

  const tokenUrl = new URL(`https://graph.facebook.com/${graphVersion()}/oauth/access_token`);
  tokenUrl.search = new URLSearchParams({ client_id: creds.id, client_secret: creds.secret, redirect_uri: redirectUri, code: cleanCode }).toString();
  const token = await json(await fetchImpl(tokenUrl.toString()));
  if (typeof token.access_token !== "string") throw new Error("Facebook não devolveu access_token");
  const proof = createHmac("sha256", creds.secret).update(token.access_token).digest("hex");
  const me = await json(await fetchImpl(`https://graph.facebook.com/${graphVersion()}/me?fields=id,name,email&access_token=${encodeURIComponent(token.access_token)}&appsecret_proof=${proof}`));
  const id = String(me.id ?? "");
  if (!id) throw new Error("Facebook não devolveu o id do usuário");
  const email = typeof me.email === "string" ? me.email.trim().toLowerCase() : undefined;
  return { provider, id, name: String(me.name || "Cliente Facebook").slice(0, 100), email };
}
