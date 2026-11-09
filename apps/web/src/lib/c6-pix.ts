/**
 * C6 Bank Empresas — Pix Cobrança (API Pix do BACEN, v2) com mTLS.
 *
 * - Autenticação: OAuth2 client_credentials em /v1/auth, sempre com o
 *   certificado (.crt + .key) emitido junto da chave de API no C6 Web Banking.
 * - Cobrança imediata: PUT /v2/pix/cob/{txid}. O txid é derivado do id do
 *   checkout, então uma resposta perdida é recuperada com GET pelo mesmo txid e
 *   nunca gera uma segunda cobrança.
 * - O corpo do webhook nunca é confiável: a confirmação sempre consulta a
 *   cobrança no C6 e confere txid, valor e devoluções.
 *
 * Nenhum segredo fica no código: tudo vem do ambiente do servidor.
 */
import { readFileSync } from "node:fs";
import https from "node:https";
import QRCode from "qrcode";
import { OnlinePaymentError } from "./online-payment";
import type { PixCode } from "./asaas";

export interface C6PixReceived {
  endToEndId: string;
  txid?: string;
  valor: string;
  horario?: string;
  devolucoes?: { id?: string; status?: string; valor?: string }[];
}
export interface C6Cob {
  txid: string;
  status: string;
  chave?: string;
  revisao?: number;
  valor?: { original?: string };
  pixCopiaECola?: string;
  location?: string;
  calendario?: { criacao?: string; expiracao?: number };
  pix?: C6PixReceived[];
}

export type C6Environment = "sandbox" | "production";
interface TransportRequest { url: string; method: string; headers: Record<string, string>; body?: string }
interface TransportResponse { status: number; text: string }
type Transport = (request: TransportRequest, tls: { cert: string; key: string }) => Promise<TransportResponse>;

const BASES: Record<C6Environment, string> = {
  production: "https://baas-api.c6bank.info",
  sandbox: "https://baas-api-sandbox.c6bank.info",
};

export function c6Environment(): C6Environment {
  return process.env.C6_ENVIRONMENT?.trim() === "production" ? "production" : "sandbox";
}

export function c6Configured() {
  return Boolean(process.env.C6_CLIENT_ID?.trim() && process.env.C6_CLIENT_SECRET?.trim() && process.env.C6_PIX_KEY?.trim()
    && (process.env.C6_CERT_PEM || process.env.C6_CERT_PATH) && (process.env.C6_KEY_PEM || process.env.C6_KEY_PATH));
}

let tlsCache: { signature: string; cert: string; key: string } | null = null;
function readPem(inline: string | undefined, path: string | undefined, label: string) {
  if (inline?.includes("-----BEGIN")) return inline.replace(/\\n/g, "\n");
  if (inline) return Buffer.from(inline, "base64").toString("utf8");
  try { return readFileSync(path!, "utf8"); }
  catch (error) {
    console.error(`[c6-pix] não foi possível ler ${label} em ${path}: ${(error as NodeJS.ErrnoException).code ?? "erro"}`);
    throw new OnlinePaymentError("O pagamento Pix está temporariamente indisponível. Fale com a loja.");
  }
}

export function c6Config() {
  if (!c6Configured()) {
    console.error("[c6-pix] configuração incompleta: confira C6_CLIENT_ID, C6_CLIENT_SECRET, C6_PIX_KEY, C6_CERT_PATH e C6_KEY_PATH");
    throw new OnlinePaymentError("O pagamento Pix está temporariamente indisponível. Tente mais tarde ou fale com a loja.");
  }
  const environment = c6Environment();
  const signature = [process.env.C6_CERT_PATH, process.env.C6_KEY_PATH, process.env.C6_CERT_PEM?.length, process.env.C6_KEY_PEM?.length].join("|");
  if (tlsCache?.signature !== signature) {
    tlsCache = { signature, cert: readPem(process.env.C6_CERT_PEM, process.env.C6_CERT_PATH, "o certificado"), key: readPem(process.env.C6_KEY_PEM, process.env.C6_KEY_PATH, "a chave privada") };
  }
  const expiration = Number(process.env.C6_PIX_EXPIRATION_SECONDS ?? 3600);
  return {
    environment,
    base: process.env.C6_BASE_URL?.trim() || BASES[environment],
    clientId: process.env.C6_CLIENT_ID!.trim(),
    clientSecret: process.env.C6_CLIENT_SECRET!.trim(),
    pixKey: process.env.C6_PIX_KEY!.trim(),
    expirationSeconds: Number.isInteger(expiration) && expiration >= 300 && expiration <= 86_400 ? expiration : 3600,
    tls: { cert: tlsCache.cert, key: tlsCache.key },
  };
}

const httpsTransport: Transport = (request, tls) => new Promise((resolve, reject) => {
  const url = new URL(request.url);
  const req = https.request({
    hostname: url.hostname, port: url.port || 443, path: `${url.pathname}${url.search}`, method: request.method,
    headers: { ...request.headers, ...(request.body ? { "Content-Length": Buffer.byteLength(request.body).toString() } : {}) },
    cert: tls.cert, key: tls.key, timeout: 20_000,
  }, res => {
    const chunks: Buffer[] = [];
    res.on("data", chunk => chunks.push(chunk));
    res.on("end", () => resolve({ status: res.statusCode ?? 0, text: Buffer.concat(chunks).toString("utf8") }));
    res.on("error", reject);
  });
  req.on("timeout", () => req.destroy(new Error("timeout")));
  req.on("error", reject);
  if (request.body) req.write(request.body);
  req.end();
});
let transport: Transport = httpsTransport;
/** Somente para testes: troca a camada HTTP por um simulador local. */
export function setC6TransportForTests(next: Transport | null) { transport = next ?? httpsTransport; tokenCache = null; }

let tokenCache: { key: string; token: string; expiresAt: number } | null = null;
let tokenRequest: Promise<string> | null = null;

/** Trecho curto e sem segredos da resposta do C6 para o log. */
function problem(text: string) {
  try {
    const body = JSON.parse(text);
    return [body.title, body.detail, body.error, body.error_description, body.message].filter(Boolean).join(" · ").slice(0, 300) || text.slice(0, 200);
  } catch { return text.slice(0, 200); }
}

async function accessToken(config: ReturnType<typeof c6Config>) {
  const key = `${config.base}|${config.clientId}`;
  if (tokenCache?.key === key && tokenCache.expiresAt > Date.now() + 30_000) return tokenCache.token;
  if (tokenRequest) return tokenRequest;
  tokenRequest = (async () => {
    let response: TransportResponse;
    try {
      response = await transport({
        url: `${config.base}/v1/auth/`, method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
        body: new URLSearchParams({ grant_type: "client_credentials", client_id: config.clientId, client_secret: config.clientSecret }).toString(),
      }, config.tls);
    } catch (error) {
      console.error(`[c6-pix] autenticação sem resposta (${(error as Error).message}). Verifique rede, certificado e C6_ENVIRONMENT=${config.environment}.`);
      throw new OnlinePaymentError("O banco não respondeu. Tente novamente em instantes; seu pedido está salvo.");
    }
    let body: { access_token?: string; expires_in?: number } = {};
    try { body = JSON.parse(response.text); } catch { /* tratado abaixo */ }
    if (response.status !== 200 || !body.access_token) {
      console.error(`[c6-pix] autenticação recusada HTTP ${response.status}: ${problem(response.text)}. Confira client id/secret e se o certificado é o da mesma chave.`);
      throw new OnlinePaymentError("O pagamento Pix está temporariamente indisponível. Tente mais tarde ou fale com a loja.");
    }
    tokenCache = { key, token: body.access_token, expiresAt: Date.now() + Math.max(60, Number(body.expires_in) || 300) * 1000 };
    return body.access_token;
  })();
  try { return await tokenRequest; } finally { tokenRequest = null; }
}

/** Chamada autenticada. 404 vira `null` quando `allowNotFound`. Erros de
 * transporte, 408 e 5xx numa mutação ficam marcados como incertos. */
export async function c6Request<T>(path: string, method = "GET", body?: unknown, options: { allowNotFound?: boolean } = {}): Promise<T | null> {
  const config = c6Config();
  const token = await accessToken(config);
  const mutation = method !== "GET";
  let response: TransportResponse;
  try {
    response = await transport({
      url: `${config.base}${path}`, method,
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json", ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    }, config.tls);
  } catch (error) {
    console.error(`[c6-pix] ${method} ${path} sem resposta: ${(error as Error).message}`);
    throw new OnlinePaymentError("O banco ainda não confirmou a operação. Consulte novamente; o pedido não será cobrado duas vezes.", 503, mutation);
  }
  if (response.status === 404 && options.allowNotFound) return null;
  if (response.status === 401) tokenCache = null;
  if (response.status < 200 || response.status >= 300) {
    console.error(`[c6-pix] ${method} ${path} HTTP ${response.status}: ${problem(response.text)}`);
    const uncertain = mutation && (response.status >= 500 || response.status === 408 || response.status === 409);
    throw new OnlinePaymentError(response.status === 400 ? "O banco recusou a cobrança Pix. Fale com a loja." : "O pagamento Pix está temporariamente indisponível. Consulte novamente em instantes.", 503, uncertain);
  }
  try { return JSON.parse(response.text) as T; }
  catch {
    console.error(`[c6-pix] ${method} ${path} resposta não-JSON (HTTP ${response.status})`);
    throw new OnlinePaymentError("O banco não confirmou a resposta. Consulte novamente em instantes.", 503, mutation);
  }
}

/** txid estável por checkout: o UUID sem hífens (32 caracteres, padrão BACEN 26–35). */
export const c6Txid = (checkoutId: string) => checkoutId.replace(/-/g, "").toLowerCase();
export const checkoutIdFromTxid = (txid: string) => /^[a-f0-9]{32}$/i.test(txid)
  ? txid.toLowerCase().replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, "$1-$2-$3-$4-$5") : null;

export const getC6Cob = (txid: string) => c6Request<C6Cob>(`/v2/pix/cob/${encodeURIComponent(txid)}`, "GET", undefined, { allowNotFound: true });

export async function createC6Cob(txid: string, input: { totalCents: number; description: string; orderId: string; payer?: { cpf: string; name: string } }) {
  const { pixKey, expirationSeconds } = c6Config();
  const cob = await c6Request<C6Cob>(`/v2/pix/cob/${encodeURIComponent(txid)}`, "PUT", {
    calendario: { expiracao: expirationSeconds },
    ...(input.payer ? { devedor: { cpf: input.payer.cpf, nome: input.payer.name.slice(0, 200) } } : {}),
    valor: { original: (input.totalCents / 100).toFixed(2) },
    chave: pixKey,
    solicitacaoPagador: input.description.slice(0, 140),
    infoAdicionais: [{ nome: "Pedido", valor: input.orderId }],
  });
  if (!cob?.txid) throw new OnlinePaymentError("A cobrança Pix ainda não foi confirmada pelo banco. Consulte novamente.", 503, true);
  return cob;
}

export const removeC6Cob = (txid: string) => c6Request<C6Cob>(`/v2/pix/cob/${encodeURIComponent(txid)}`, "PATCH", { status: "REMOVIDA_PELO_USUARIO_RECEBEDOR" });

const cents = (value: string | undefined) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
};

export function assertC6CobMatches(cob: C6Cob, expected: { txid: string; totalCents: number }) {
  if (cob.txid?.toLowerCase() !== expected.txid.toLowerCase() || cents(cob.valor?.original) !== expected.totalCents) {
    console.error(`[c6-pix] cobrança ${cob.txid} não confere com o pedido (esperado txid ${expected.txid}, ${expected.totalCents} centavos; recebido ${cob.valor?.original})`);
    throw new OnlinePaymentError("A cobrança precisa ser conferida pela equipe. Nenhum pedido foi liberado.", 409);
  }
}

/** Situação financeira a partir da cobrança consultada no C6. */
export function c6ChargeState(cob: C6Cob, totalCents: number): "paid" | "pending" | "failed" {
  const received = (cob.pix ?? []).filter(p => !p.txid || p.txid.toLowerCase() === cob.txid.toLowerCase());
  const paidCents = received.reduce((sum, p) => sum + (cents(p.valor) || 0), 0);
  const refunded = received.some(p => (p.devolucoes ?? []).some(d => d.status === "DEVOLVIDO" || d.status === "EM_PROCESSAMENTO"));
  if (refunded) return "failed";
  if (cob.status === "CONCLUIDA" && paidCents >= totalCents) return "paid";
  if (cob.status === "REMOVIDA_PELO_USUARIO_RECEBEDOR" || cob.status === "REMOVIDA_PELO_PSP") return "failed";
  return "pending";
}

export async function c6PixCode(cob: C6Cob): Promise<PixCode> {
  if (!cob.pixCopiaECola) throw new OnlinePaymentError("O código Pix ainda não está disponível. Consulte novamente em instantes.");
  const dataUrl = await QRCode.toDataURL(cob.pixCopiaECola, { errorCorrectionLevel: "M", margin: 1, width: 480 });
  const created = cob.calendario?.criacao ? Date.parse(cob.calendario.criacao) : Date.now();
  const expires = new Date((Number.isFinite(created) ? created : Date.now()) + (cob.calendario?.expiracao ?? 3600) * 1000);
  return { payload: cob.pixCopiaECola, encodedImage: dataUrl.replace(/^data:image\/png;base64,/, ""), expirationDate: expires.toISOString() };
}
