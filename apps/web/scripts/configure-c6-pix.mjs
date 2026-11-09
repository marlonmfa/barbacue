#!/usr/bin/env node
// Confere as credenciais do C6 e cadastra o webhook Pix desta integração.
// Uso (no servidor, com o mesmo ambiente do PM2):
//   node apps/web/scripts/configure-c6-pix.mjs            -> testa OAuth/mTLS e mostra o webhook atual
//   node apps/web/scripts/configure-c6-pix.mjs --apply    -> cadastra/atualiza o webhook da chave Pix
// Não cria cobrança nem movimenta dinheiro.
import { readFileSync } from "node:fs";
import https from "node:https";

const env = process.env;
const need = ["C6_CLIENT_ID", "C6_CLIENT_SECRET", "C6_PIX_KEY", "C6_WEBHOOK_TOKEN"];
const missing = need.filter(k => !env[k]?.trim());
if (!(env.C6_CERT_PEM || env.C6_CERT_PATH)) missing.push("C6_CERT_PATH");
if (!(env.C6_KEY_PEM || env.C6_KEY_PATH)) missing.push("C6_KEY_PATH");
if (missing.length) { console.error(`Faltando no ambiente: ${missing.join(", ")}`); process.exit(2); }
if (env.C6_WEBHOOK_TOKEN.length < 32) { console.error("C6_WEBHOOK_TOKEN precisa de pelo menos 32 caracteres"); process.exit(2); }
const pem = (inline, path) => inline ? (inline.includes("-----BEGIN") ? inline.replace(/\\n/g, "\n") : Buffer.from(inline, "base64").toString("utf8")) : readFileSync(path, "utf8");
const cert = pem(env.C6_CERT_PEM, env.C6_CERT_PATH), key = pem(env.C6_KEY_PEM, env.C6_KEY_PATH);
const environment = env.C6_ENVIRONMENT === "production" ? "production" : "sandbox";
const base = env.C6_BASE_URL || (environment === "production" ? "https://baas-api.c6bank.info" : "https://baas-api-sandbox.c6bank.info");
const publicUrl = (env.C6_WEBHOOK_BASE_URL || "https://barbacue.cog.ia.br").replace(/\/$/, "");
const webhookUrl = `${publicUrl}/api/webhooks/c6/${env.C6_WEBHOOK_TOKEN}`;

function call(method, path, headers, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(base + path);
    const req = https.request({ hostname: u.hostname, path: u.pathname + u.search, method, cert, key, timeout: 20000,
      headers: { Accept: "application/json", ...headers, ...(body ? { "Content-Length": Buffer.byteLength(body) } : {}) } }, res => {
      let text = ""; res.on("data", c => text += c); res.on("end", () => resolve({ status: res.statusCode, text }));
    });
    req.on("timeout", () => req.destroy(new Error("timeout"))); req.on("error", reject);
    if (body) req.write(body); req.end();
  });
}
const short = t => t.length > 400 ? t.slice(0, 400) + "…" : t;
const mask = s => s.replace(env.C6_WEBHOOK_TOKEN, "<C6_WEBHOOK_TOKEN>");

console.log(`Ambiente C6: ${environment} (${base})`);
const auth = await call("POST", "/v1/auth/", { "Content-Type": "application/x-www-form-urlencoded" },
  new URLSearchParams({ grant_type: "client_credentials", client_id: env.C6_CLIENT_ID.trim(), client_secret: env.C6_CLIENT_SECRET.trim() }).toString());
let token;
try { token = JSON.parse(auth.text).access_token; } catch {}
if (auth.status !== 200 || !token) { console.error(`Falha na autenticação: HTTP ${auth.status} ${short(auth.text)}`); process.exit(1); }
console.log("OAuth + certificado: OK");
const bearer = { Authorization: `Bearer ${token}` };
const chave = encodeURIComponent(env.C6_PIX_KEY.trim());
const current = await call("GET", `/v2/pix/webhook/${chave}`, bearer);
console.log(`Webhook atual da chave: HTTP ${current.status} ${mask(short(current.text))}`);
if (!process.argv.includes("--apply")) { console.log("Rode com --apply para cadastrar o webhook."); process.exit(0); }
const put = await call("PUT", `/v2/pix/webhook/${chave}`, { ...bearer, "Content-Type": "application/json" }, JSON.stringify({ webhookUrl }));
console.log(`Cadastro do webhook (${mask(webhookUrl)}): HTTP ${put.status} ${mask(short(put.text))}`);
process.exit(put.status >= 200 && put.status < 300 ? 0 : 1);
