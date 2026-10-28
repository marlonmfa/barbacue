import { createHmac, timingSafeEqual } from "node:crypto";
import type { AnyMessageContent } from "@whiskeysockets/baileys";
import { config } from "../config.js";

export const RESTAURANTS = ["barbacue", "barbadog", "chelas"] as const;
export type RestaurantId = (typeof RESTAURANTS)[number];
export const PAIRING_TARGETS = {
  central: { name: "Barbacue & Co. — Integrada", phone: "5547999718315" },
  barbacue: { name: "Barbacue", phone: "5547997056624" },
  barbadog: { name: "Barbadog", phone: "5547933892175" },
  chelas: { name: "Chelas", phone: "5547988249667" },
} as const;
export type AccountId = keyof typeof PAIRING_TARGETS;
type ConnectionStatus = "disconnected" | "connecting" | "qr_ready" | "connected";
type InboundHandler = (phone: string, text: string, connection?: AccountId) => Promise<{ messages: string[]; brand: RestaurantId | null }>;

type Account = {
  id: AccountId;
  status: ConnectionStatus;
  qrDataUrl: string | null;
  phoneNumber: string | null;
  pairingCode: string | null;
  lastError: string | null;
  remoteId: string | null;
};

type StoredMessage = {
  id: string;
  jid: string;
  fromMe: boolean;
  type: string;
  text: string;
  timestamp: number;
  mediaUrl: string | null;
};

const accounts = Object.fromEntries(Object.keys(PAIRING_TARGETS).map((id) => [id, {
  id, status: "disconnected", qrDataUrl: null, phoneNumber: null,
  pairingCode: null, lastError: null, remoteId: id === "central" ? config.zapSessionId || null : null,
}])) as Record<AccountId, Account>;
const chats = new Map<string, { connection: AccountId; jid: string; name: string; avatar: string | null; assigned: RestaurantId; unread: number; isGroup: boolean; last: StoredMessage }>();
const messages = new Map<string, StoredMessage[]>();
const pollTimers = new Map<AccountId, NodeJS.Timeout>();
const creating = new Map<AccountId, Promise<string | null>>();
function accountFor(id: string) {
  if (!Object.hasOwn(accounts, id)) throw new Error("Conexão WhatsApp inválida.");
  return accounts[id as AccountId];
}
const chatKey = (id: AccountId, jid: string) => `${id}:${jid}`;
let onInbound: InboundHandler | null = null;

function ensureConfigured() {
  if (!config.zapApiToken) throw new Error("ZAP_API_TOKEN não configurado.");
}

function authHeaders() {
  return { authorization: `Bearer ${config.zapApiToken}`, "content-type": "application/json" };
}

async function zapFetch(path: string, init: RequestInit = {}) {
  ensureConfigured();
  const response = await fetch(`${config.zapApiBaseUrl}${path}`, {
    ...init,
    headers: { ...authHeaders(), ...(init.headers || {}) },
    signal: init.signal ?? AbortSignal.timeout(30_000),
  });
  const text = await response.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) {
    const detail = typeof data?.error === "string" ? data.error : data?.error?.message;
    throw new Error(detail || `Zap API respondeu HTTP ${response.status}`);
  }
  return data;
}

function asRows(value: any): any[] {
  return Array.isArray(value) ? value : Array.isArray(value?.sessions) ? value.sessions : [];
}

function normalizeStatus(value: any): ConnectionStatus {
  if (value === "connected") return "connected";
  if (value === "qr_ready" || value === "qr" || value === "pairing") return "qr_ready";
  if (value === "connecting" || value === "reconnecting" || value === "pairing_ready") return "connecting";
  return "disconnected";
}

function applyRemote(account: Account, remote: any) {
  if (!remote) return;
  account.remoteId = remote.sessionId ?? remote.id ?? account.remoteId;
  account.status = normalizeStatus(remote.status);
  account.qrDataUrl = remote.qrDataUrl ?? remote.qr ?? remote.qrCode ?? null;
  account.phoneNumber = remote.phoneNumber ?? remote.phone ?? null;
  account.pairingCode = remote.pairingCode ?? remote.pairing_code ?? null;
  account.lastError = remote.lastError ?? remote.error ?? null;
}

async function remoteSession(account: Account) {
  const rows = asRows(await zapFetch(`/whatsapp/sessions`));
  const claimed = new Set(Object.values(accounts).filter(a => a.id !== account.id).map(a => a.remoteId).filter(Boolean));
  const found = account.remoteId
    ? rows.find(row => String(row.sessionId ?? row.id) === account.remoteId)
    : rows.find(row => !claimed.has(String(row.sessionId ?? row.id)) &&
      (String(row.phoneNumber ?? row.phone ?? "").replace(/\D/g, "") === PAIRING_TARGETS[account.id].phone || row.name === `barbacue:${account.id}`));
  if (found) {
    applyRemote(account, found);
    try { applyRemote(account, await zapFetch(sessionPath(account, "/status"))); } catch { /* list status is still useful */ }
  }
  return found;
}

async function ensureRemoteSession(account: Account) {
  const existing = creating.get(account.id);
  if (existing) return existing;
  const pending = (async () => {
    const found = await remoteSession(account);
    if (found) return account.remoteId;
    if (account.remoteId) throw new Error("A sessão configurada não foi encontrada no Zap. Confira a configuração antes de parear.");
    const created = await zapFetch(`/whatsapp/sessions`, { method: "POST", body: JSON.stringify({ name: `barbacue:${account.id}` }) });
    applyRemote(account, created?.session ?? created);
    if (!account.remoteId) throw new Error("O Zap não retornou a sessão criada.");
    return account.remoteId;
  })();
  creating.set(account.id, pending);
  try { return await pending; } finally { creating.delete(account.id); }
}

function sessionPath(account: Account, suffix: string) {
  if (!account.remoteId) throw new Error("Sessão do Zap não encontrada.");
  return `/whatsapp/sessions/${encodeURIComponent(account.remoteId)}${suffix}`;
}

async function refreshRemote(account: Account) {
  try { await remoteSession(account); } catch (error) {
    account.lastError = error instanceof Error ? error.message : "Não foi possível consultar o Zap.";
  }
}

async function registerWebhook() {
  if (!config.zapWebhookUrl) return;
  try {
    const current = await zapFetch(`/webhooks`);
    const rows = Array.isArray(current?.webhooks) ? current.webhooks : [];
    if (rows.some((row: any) => row.url === config.zapWebhookUrl && row.is_active !== false)) return;
    await zapFetch(`/webhooks`, {
      method: "POST",
      body: JSON.stringify({
        url: config.zapWebhookUrl,
        events: ["message.incoming", "message.outgoing"],
        ...(config.zapWebhookSecret ? { secret: config.zapWebhookSecret } : {}),
      }),
    });
  } catch (error) {
    console.error("[zap] não foi possível registrar o webhook", error);
  }
}

function stopPolling(id: AccountId) {
  const timer = pollTimers.get(id);
  if (timer) clearInterval(timer);
  pollTimers.delete(id);
}
function startPolling(account: Account) {
  stopPolling(account.id);
  const timer = setInterval(() => void refreshRemote(account), 3_000);
  timer.unref();
  pollTimers.set(account.id, timer);
}
function remember(account: Account, message: StoredMessage, name = "") {
  const key = chatKey(account.id, message.jid);
  const rows = messages.get(key) ?? [];
  const index = rows.findIndex(item => item.id === message.id);
  if (index >= 0) rows[index] = message; else rows.push(message);
  messages.set(key, rows.slice(-300));
  const previous = chats.get(key);
  chats.set(key, {
    connection: account.id, jid: message.jid, name: name || previous?.name || `+${message.jid.replace(/\D/g, "")}`,
    avatar: previous?.avatar ?? null, assigned: account.id === "central" ? previous?.assigned ?? "barbacue" : account.id,
    unread: message.fromMe || index >= 0 ? previous?.unread ?? 0 : (previous?.unread ?? 0) + 1,
    isGroup: message.jid.includes("@g.us"), last: message,
  });
  return index < 0;
}

function textFrom(payload: any): string {
  return payload?.text ?? payload?.body ?? payload?.message?.text ?? payload?.message?.body ?? payload?.content ?? "";
}

function jidFrom(payload: any): string {
  return payload?.jid ?? payload?.whatsappJid ?? payload?.from ?? payload?.message?.jid ?? payload?.message?.from ?? payload?.contact?.whatsapp_jid ?? "";
}

export function verifyWebhookSignature(rawBody: string, signature: string | null) {
  // A configured remote provider must never accept unsigned public events.
  if (!config.zapWebhookSecret) return !config.zapApiToken;
  if (!signature) return false;
  const expected = createHmac("sha256", config.zapWebhookSecret).update(rawBody).digest("hex");
  const supplied = signature.replace(/^sha256=/, "");
  if (expected.length !== supplied.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(supplied));
}

export async function handleWebhook(payload: any) {
  const event = payload?.event ?? payload?.type ?? payload?.name;
  const data = payload?.data ?? payload;
  if (event && event !== "message.incoming" && event !== "incoming" && event !== "message") return;
  const remoteId = data?.sessionId ?? payload?.sessionId;
  // Webhooks are account-wide: never route an unrelated session into this bot.
  const account = Object.values(accounts).find(a => a.remoteId === remoteId);
  if (!account) return;
  const jid = jidFrom(data);
  const text = textFrom(data).trim();
  if (!jid || !text || data?.direction === "out" || jid.endsWith("@g.us")) return;
  const message: StoredMessage = {
    id: String(data?.messageId ?? data?.message?.id ?? `${jid}:${Date.now()}`), jid,
    fromMe: false, type: "text", text, timestamp: Date.now(), mediaUrl: null,
  };
  if (!remember(account, message, data?.contact?.name ?? data?.pushName ?? data?.name ?? "")) return;
  if (!onInbound) return;
  const result = await onInbound(jid.split("@")[0].replace(/\D/g, ""), text, account.id);
  const conversation = chats.get(chatKey(account.id, jid));
  if (conversation && result.brand && account.id === "central") conversation.assigned = result.brand;
  for (const reply of result.messages) await sendMessage(account.id, jid, { text: reply });
}

export function onInboundMessage(handler: InboundHandler) { onInbound = handler; }

export async function startHub() {
  for (const account of Object.values(accounts)) {
    await refreshRemote(account);
    if (account.status === "connected") startPolling(account);
  }
  await registerWebhook();
}

export function accountList() {
  return Object.values(accounts).map(({ remoteId: _remoteId, ...account }) => ({ ...account, targetPhone: PAIRING_TARGETS[account.id].phone }));
}

export async function pair(id: string, method: "qr" | "phone", phone?: string) {
  const account = accountFor(id);
  if (method !== "qr" && method !== "phone") throw new Error("Método de pareamento inválido.");
  const target = PAIRING_TARGETS[account.id].phone;
  if (method === "phone" && phone && phone.replace(/\D/g, "") !== target) throw new Error("Use o número configurado para esta conexão.");
  await ensureRemoteSession(account);
  if (account.status === "connected") throw new Error("Esta conexão já está pareada. Desconecte explicitamente antes de trocar o aparelho.");
  account.status = "connecting"; account.qrDataUrl = null; account.pairingCode = null; account.lastError = null;
  if (method === "phone") {
    await zapFetch(sessionPath(account, "/pair"), { method: "POST", body: JSON.stringify({ phoneNumber: target }) });
  } else {
    await zapFetch(sessionPath(account, "/sync"), { method: "POST" });
  }
  startPolling(account);
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    await refreshRemote(account);
    const current = accountList().find(a => a.id === account.id)!;
    if (current.status === "connected" || (method === "phone" ? current.pairingCode : current.qrDataUrl) || current.lastError) break;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  return accountList().find(a => a.id === account.id);
}

export function closePairingWindow(id: string) { stopPolling(accountFor(id).id); }

export async function disconnect(id: string) {
  const account = accountFor(id);
  stopPolling(account.id);
  if (account.remoteId) await zapFetch(sessionPath(account, "/disconnect"), { method: "POST" });
  account.status = "disconnected"; account.qrDataUrl = null; account.pairingCode = null; account.phoneNumber = null; account.lastError = null;
}

export async function chatList(accountFilter = "all") {
  return [...chats.values()].filter(chat => accountFilter === "all" || chat.assigned === accountFilter).map(chat => ({
    account: chat.assigned, connection: chat.connection, jid: chat.jid, name: chat.name, avatar: chat.avatar, lastMessage: chat.last.text,
    lastType: chat.last.type, timestamp: chat.last.timestamp, unread: chat.unread, isGroup: chat.isGroup,
  })).sort((a, b) => b.timestamp - a.timestamp);
}

export function messageList(id: string, jid: string) {
  const account = accountFor(id);
  return messages.get(chatKey(account.id, jid)) ?? [];
}

export async function sendMessage(id: string, jid: string, content: AnyMessageContent) {
  const account = accountFor(id);
  if (account.status !== "connected") throw new Error("WhatsApp desconectado no Zap");
  if (!("text" in content)) throw new Error("O envio de mídia pelo painel do Barbacue ainda não está disponível via Zap.");
  const text = String(content.text ?? "");
  const result = await zapFetch(`/messages`, { method: "POST", body: JSON.stringify({ sessionId: account.remoteId, to: jid, text }) });
  remember(account, { id: String(result?.messageId ?? result?.id ?? `out:${Date.now()}`), jid, fromMe: true, type: "text", text, timestamp: Date.now(), mediaUrl: null });
  return result?.messageId ?? result?.id ?? null;
}

export async function readChat(id: string, jid: string) {
  const account = accountFor(id);
  const row = chats.get(chatKey(account.id, jid)); if (row) row.unread = 0;
}

export async function media(_account: string, _jid: string, _id: string): Promise<{ buffer: Buffer; mime: string }> {
  throw new Error("Mídia é servida pelo Zap; use a conversa no painel do Zap.");
}
