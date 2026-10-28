// Login social (Google/Apple/Instagram/Facebook): estado anti-CSRF, domínios aceitos e troca de token.
//
//   ../../node_modules/.bin/tsx --test tests/social-auth.test.ts
//
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, createVerify } from "node:crypto";
import { appleClientSecret, appleUserName, authorizeUrl, configuredProviders, createState, fetchProfile, publicOrigin, safeReturnTo, verifyState } from "../src/lib/social-auth";

const appleKey = generateKeyPairSync("ec", { namedCurve: "P-256" });

beforeEach(() => {
  Object.assign(process.env, {
    GOOGLE_CLIENT_ID: "g-id.apps.googleusercontent.com", GOOGLE_CLIENT_SECRET: "g-secret",
    APPLE_CLIENT_ID: "br.ia.cog.barbacue.web", APPLE_TEAM_ID: "TEAM123456", APPLE_KEY_ID: "KEY1234567",
    APPLE_PRIVATE_KEY: appleKey.privateKey.export({ type: "pkcs8", format: "pem" }).toString().replace(/\n/g, "\\n"),
    ADMIN_COOKIE_SECRET: "x".repeat(32),
    APP_URL: "https://barbacue.cog.ia.br",
    DOMAIN_CHELAS: "chelas.hirableaiagents.com",
    DOMAIN_HOTDOG: "barbadog.hirableaiagents.com",
    INSTAGRAM_APP_ID: "ig-id", INSTAGRAM_APP_SECRET: "ig-secret",
    FACEBOOK_APP_ID: "fb-id", FACEBOOK_APP_SECRET: "fb-secret",
  });
});

test("estado válido devolve o destino; nonce, provedor ou validade errados são recusados", () => {
  const { nonce, cookie } = createState("instagram", "/cart");
  assert.deepEqual(verifyState(cookie, nonce, "instagram"), { returnTo: "/cart" });
  assert.equal(verifyState(cookie, "outro-nonce-qualquer-1", "instagram"), null);
  assert.equal(verifyState(cookie, nonce, "facebook"), null);
  assert.equal(verifyState(cookie, nonce, "instagram", Date.now() + 11 * 60_000), null);
  assert.equal(verifyState(cookie.replace(/.$/, "A") + "B", nonce, "instagram"), null);
  assert.equal(verifyState(undefined, nonce, "instagram"), null);
});

test("só aceita os domínios das três marcas", () => {
  assert.equal(publicOrigin(null, "chelas.hirableaiagents.com", null), "https://chelas.hirableaiagents.com");
  assert.equal(publicOrigin("barbadog.hirableaiagents.com", "web:3000", "http"), "https://barbadog.hirableaiagents.com");
  assert.equal(publicOrigin(null, "barbacue.cog.ia.br", null), "https://barbacue.cog.ia.br");
  assert.equal(publicOrigin("evil.example", "barbacue.cog.ia.br", null), null);
});

test("returnTo não vira open redirect", () => {
  assert.equal(safeReturnTo("/cart"), "/cart");
  assert.equal(safeReturnTo("//evil.example"), "/");
  assert.equal(safeReturnTo("https://evil.example"), "/");
  assert.equal(safeReturnTo("/\\evil"), "/");
});

test("provedores sem credenciais não aparecem", () => {
  delete process.env.FACEBOOK_APP_SECRET;
  delete process.env.APPLE_KEY_ID;
  assert.deepEqual(configuredProviders(), ["google", "instagram"]);
});

test("URL de autorização do Instagram pede só instagram_business_basic", () => {
  const url = new URL(authorizeUrl("instagram", "https://barbacue.cog.ia.br/api/auth/instagram/callback", "n1"));
  assert.equal(url.host, "www.instagram.com");
  assert.equal(url.searchParams.get("scope"), "instagram_business_basic");
  assert.equal(url.searchParams.get("state"), "n1");
});

test("Instagram: troca code (com #_) por token e lê o perfil nos dois formatos de resposta", async () => {
  for (const tokenBody of [{ access_token: "tok", user_id: 1 }, { data: [{ access_token: "tok", user_id: 1 }] }]) {
    const calls: string[] = [];
    const fake = (async (url: string, init?: RequestInit) => {
      calls.push(String(url));
      if (String(url).includes("access_token") && init?.method === "POST") {
        assert.equal(new URLSearchParams(String(init.body)).get("code"), "abc");
        return new Response(JSON.stringify(tokenBody));
      }
      return new Response(JSON.stringify({ user_id: "178", username: "barbacue_fan" }));
    }) as typeof fetch;
    const profile = await fetchProfile("instagram", "abc#_", "https://x/cb", fake);
    assert.deepEqual(profile, { provider: "instagram", id: "178", name: "@barbacue_fan", username: "barbacue_fan" });
    assert.equal(calls.length, 2);
  }
});

test("Facebook: usa appsecret_proof e normaliza o e-mail", async () => {
  const fake = (async (url: string) => {
    if (String(url).includes("/oauth/access_token")) return new Response(JSON.stringify({ access_token: "tok" }));
    assert.match(String(url), /appsecret_proof=[0-9a-f]{64}/);
    return new Response(JSON.stringify({ id: "99", name: "Ana", email: "Ana@Ex.com " }));
  }) as typeof fetch;
  assert.deepEqual(await fetchProfile("facebook", "c", "https://x/cb", fake), { provider: "facebook", id: "99", name: "Ana", email: "ana@ex.com" });
});

test("erro da Meta vira exceção", async () => {
  const fake = (async () => new Response(JSON.stringify({ error: { message: "Invalid platform app" } }), { status: 400 })) as typeof fetch;
  await assert.rejects(fetchProfile("instagram", "c", "https://x/cb", fake), /Provedor respondeu 400/);
});

const jwt = (claims: object) => `e30.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.sig`;

test("Google: pede openid/email/profile e só aceita e-mail confirmado", async () => {
  const url = new URL(authorizeUrl("google", "https://barbacue.cog.ia.br/api/auth/google/callback", "n1"));
  assert.equal(url.host, "accounts.google.com");
  assert.equal(url.searchParams.get("scope"), "openid email profile");
  const base = { iss: "https://accounts.google.com", aud: "g-id.apps.googleusercontent.com", sub: "g-1", name: "Ana Souza", email: "Ana@Gmail.com", exp: Date.now() / 1000 + 60 };
  for (const [verified, email] of [[true, "ana@gmail.com"], [false, undefined]] as const) {
    const fake = (async (u: string, init?: RequestInit) => {
      assert.equal(String(u), "https://oauth2.googleapis.com/token");
      assert.equal(new URLSearchParams(String(init?.body)).get("client_secret"), "g-secret");
      return new Response(JSON.stringify({ id_token: jwt({ ...base, email_verified: verified }) }));
    }) as typeof fetch;
    assert.deepEqual(await fetchProfile("google", "c", "https://x/cb", fake), { provider: "google", id: "g-1", name: "Ana Souza", email });
  }
  const wrongAud = (async () => new Response(JSON.stringify({ id_token: jwt({ ...base, aud: "outro" }) }))) as typeof fetch;
  await assert.rejects(fetchProfile("google", "c", "https://x/cb", wrongAud), /outro emissor/);
});

test("Apple: form_post, client_secret ES256 válido e nome do primeiro login", async () => {
  const url = new URL(authorizeUrl("apple", "https://barbacue.cog.ia.br/api/auth/apple/callback", "n1"));
  assert.equal(url.searchParams.get("response_mode"), "form_post");
  const secret = appleClientSecret();
  const [h, p, sig] = secret.split(".");
  assert.deepEqual(JSON.parse(Buffer.from(h, "base64url").toString()), { alg: "ES256", kid: "KEY1234567" });
  assert.equal(JSON.parse(Buffer.from(p, "base64url").toString()).sub, "br.ia.cog.barbacue.web");
  assert.ok(createVerify("SHA256").update(`${h}.${p}`).verify({ key: appleKey.publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(sig, "base64url")));
  assert.equal(appleUserName(JSON.stringify({ name: { firstName: "João", lastName: "Silva" } })), "João Silva");
  assert.equal(appleUserName("{"), undefined);
  const fake = (async () => new Response(JSON.stringify({ id_token: jwt({ iss: "https://appleid.apple.com", aud: "br.ia.cog.barbacue.web", sub: "a-1", email: "x@privaterelay.appleid.com", email_verified: "true" }) }))) as typeof fetch;
  assert.deepEqual(await fetchProfile("apple", "c", "https://x/cb", fake, { appleName: "João Silva" }), { provider: "apple", id: "a-1", name: "João Silva", email: "x@privaterelay.appleid.com" });
});
