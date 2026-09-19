import makeWASocket, {
  Browsers,
  DisconnectReason,
  downloadMediaMessage,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
  type AnyMessageContent,
  type WASocket,
  type WAMessage,
} from "@whiskeysockets/baileys";
import { mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import QRCode from "qrcode";
import pino from "pino";
import { config } from "../config.js";

export const RESTAURANTS = ["barbacue", "barbadog", "chelas"] as const;
export type RestaurantId = (typeof RESTAURANTS)[number];
const ACCOUNTS = ["central"] as const;
type AccountId = (typeof ACCOUNTS)[number];
export type ConnectionStatus = "disconnected" | "connecting" | "qr_ready" | "connected";

type InboundHandler = (phone: string, text: string) => Promise<{
  messages: string[];
  brand: RestaurantId | null;
}>;

type Session = {
  id: AccountId;
  socket: WASocket | null;
  status: ConnectionStatus;
  qrDataUrl: string | null;
  phoneNumber: string | null;
  pairingCode: string | null;
  lastError: string | null;
  messages: Map<string, WAMessage[]>;
  names: Map<string, string>;
  unread: Map<string, number>;
  assignments: Map<string, RestaurantId>;
  reconnects: number;
  retryTimer: NodeJS.Timeout | null;
  /** Bumped on every connect attempt. Handlers from superseded sockets self-ignore. */
  generation: number;
  /** Epoch ms until which QR-refresh reconnects are allowed (0 = closed). */
  pairingUntil: number;
};

// Baileys internals stay quiet by default; our own lifecycle lines below are the
// operational log. Raise with BOT_LOG_LEVEL=debug when diagnosing a handshake.
const logger = pino({ level: process.env.BOT_LOG_LEVEL || "error" });

// --- Reconnect policy -------------------------------------------------------
// An unpaired account has nobody watching the QR, so retrying it forever just
// hammers WhatsApp from a single IP (that is what got the 9-day flapping loop).
// We only refresh the QR while an admin is actively inside the pairing modal.
const PAIRING_WINDOW_MS = 3 * 60_000;
const RECONNECT_STEP_MS = 2_000;
const RECONNECT_CAP_MS = 60_000;
// Chats are held in memory; without a ceiling a busy account grows unbounded.
const MAX_CHATS = 200;
const MAX_MESSAGES_PER_CHAT = 300;

const sessions = new Map<AccountId, Session>(ACCOUNTS.map((id) => [id, {
  id, socket: null, status: "disconnected", qrDataUrl: null, phoneNumber: null,
  pairingCode: null, lastError: null, messages: new Map(), names: new Map(), unread: new Map(),
  assignments: new Map(),
  reconnects: 0, retryTimer: null, generation: 0, pairingUntil: 0,
}]));

let onInbound: InboundHandler | null = null;

/** Baileys' version lookup is a network call; caching it keeps reconnects fast. */
let cachedVersion: [number, number, number] | null = null;
async function waVersion() {
  if (cachedVersion) return cachedVersion;
  const { version } = await fetchLatestBaileysVersion();
  cachedVersion = version;
  return version;
}

const phoneFromJid = (jid: string) => jid.split("@")[0].split(":")[0];
const isChatJid = (jid: string) => Boolean(jid) && jid !== "status@broadcast" && !jid.endsWith("@newsletter");
const digits = (value: string) => value.replace(/\D/g, "");
const sessionDir = (id: AccountId) => resolve(config.sessionsDir, id);
const log = (id: string, message: string) => console.log(`[wa:${id}] ${message}`);

function session(id: string): Session {
  // Brand-specific chat routes all point to the one physical WhatsApp account.
  const found = sessions.get("central");
  if (!found) throw new Error("Restaurante inválido");
  return found;
}

function bodyOf(message: WAMessage) {
  const m = message.message;
  const content = m?.ephemeralMessage?.message ?? m?.viewOnceMessage?.message ?? m;
  if (!content) return { type: "unknown", text: "" };
  if (content.conversation) return { type: "text", text: content.conversation };
  if (content.extendedTextMessage) return { type: "text", text: content.extendedTextMessage.text ?? "" };
  if (content.imageMessage) return { type: "image", text: content.imageMessage.caption ?? "Foto" };
  if (content.videoMessage) return { type: "video", text: content.videoMessage.caption ?? "Vídeo" };
  if (content.audioMessage) return { type: "audio", text: content.audioMessage.ptt ? "Mensagem de voz" : "Áudio" };
  if (content.documentMessage) return { type: "document", text: content.documentMessage.fileName ?? "Documento" };
  if (content.stickerMessage) return { type: "sticker", text: "Figurinha" };
  if (content.locationMessage) return { type: "location", text: "Localização" };
  if (content.contactMessage || content.contactsArrayMessage) return { type: "contact", text: "Contato" };
  return { type: "unknown", text: "Mensagem" };
}

function remember(s: Session, message: WAMessage) {
  const jid = message.key.remoteJid;
  if (!jid || !isChatJid(jid)) return;
  const rows = s.messages.get(jid) ?? [];
  const id = message.key.id;
  const index = id ? rows.findIndex((item) => item.key.id === id) : -1;
  if (index >= 0) rows[index] = message;
  else rows.push(message);
  rows.sort((a, b) => Number(a.messageTimestamp ?? 0) - Number(b.messageTimestamp ?? 0));
  s.messages.set(jid, rows.slice(-MAX_MESSAGES_PER_CHAT));
  if (message.pushName) s.names.set(jid, message.pushName);
  // Map iteration is insertion-ordered, so the oldest chat key is the first one.
  while (s.messages.size > MAX_CHATS) {
    const oldest = s.messages.keys().next().value;
    if (oldest === undefined) break;
    s.messages.delete(oldest);
    s.unread.delete(oldest);
  }
}

/**
 * Tear a session's socket down and orphan every handler bound to it.
 *
 * Bumping `generation` is the crux of the fix: Baileys keeps emitting events
 * (notably `connection.update` with `close`) well after `end()` returns. Those
 * late events used to clobber the *replacement* socket's state and schedule
 * duplicate reconnects, which is what made pairing impossible.
 */
function stop(s: Session) {
  s.generation += 1;
  if (s.retryTimer) { clearTimeout(s.retryTimer); s.retryTimer = null; }
  const sock = s.socket;
  s.socket = null;
  if (!sock) return;
  try { sock.ev.removeAllListeners("connection.update"); } catch { /* already torn down */ }
  try { sock.ev.removeAllListeners("creds.update"); } catch { /* already torn down */ }
  try { sock.end(undefined); } catch { /* already closed */ }
}

/** Wipe the Baileys auth folder so a re-pair never inherits half-written creds. */
async function clearCreds(id: AccountId) {
  await rm(sessionDir(id), { recursive: true, force: true });
}

async function replyTo(s: Session, sock: WASocket, message: WAMessage) {
  if (!onInbound || message.key.fromMe) return;
  const jid = message.key.remoteJid ?? "";
  if (!isChatJid(jid) || jid.endsWith("@g.us")) return;
  const body = bodyOf(message);
  if (body.type !== "text" || !body.text.trim()) return;
  try {
    await sock.sendPresenceUpdate("composing", jid);
    const routed = await onInbound(phoneFromJid(jid), body.text.trim());
    if (routed.brand) s.assignments.set(jid, routed.brand);
    for (const reply of routed.messages) {
      const sent = await sock.sendMessage(jid, { text: reply });
      if (sent) remember(s, sent);
    }
    await sock.sendPresenceUpdate("paused", jid);
  } catch (error) {
    console.error(`[wa:${s.id}] agente falhou`, error);
  }
}

async function connect(id: AccountId, phone?: string) {
  const s = session(id);
  const gen = ++s.generation;
  /** True while this socket is still the session's current one. */
  const current = () => s.generation === gen;

  s.status = "connecting";
  s.qrDataUrl = null;
  s.pairingCode = null;

  const dir = sessionDir(id);
  await mkdir(dir, { recursive: true });
  const { state, saveCreds } = await useMultiFileAuthState(dir);
  const version = await waVersion();

  const sock = makeWASocket({
    auth: state,
    version,
    // WhatsApp validates this string during the pairing-code handshake; a custom
    // product name here is what broke `requestPairingCode`. Keep a real browser.
    browser: Browsers.ubuntu("Chrome"),
    logger,
    connectTimeoutMs: 60_000,
    syncFullHistory: true,
    markOnlineOnConnect: false,
  });
  s.socket = sock;

  // Guarded: a superseded socket must never write this account's creds.json.
  sock.ev.on("creds.update", async () => { if (current()) await saveCreds(); });

  sock.ev.on("messaging-history.set", ({ messages, contacts }) => {
    if (!current()) return;
    for (const contact of contacts) if (contact.id) s.names.set(contact.id, contact.name ?? contact.notify ?? contact.verifiedName ?? phoneFromJid(contact.id));
    for (const message of messages) remember(s, message);
  });
  sock.ev.on("contacts.upsert", (contacts) => {
    if (!current()) return;
    for (const contact of contacts) if (contact.id) s.names.set(contact.id, contact.name ?? contact.notify ?? contact.verifiedName ?? phoneFromJid(contact.id));
  });
  sock.ev.on("messages.upsert", ({ messages, type }) => {
    if (!current()) return;
    for (const message of messages) {
      remember(s, message);
      const jid = message.key.remoteJid;
      if (type !== "notify" || !jid || message.key.fromMe) continue;
      s.unread.set(jid, (s.unread.get(jid) ?? 0) + 1);
      void replyTo(s, sock, message);
    }
  });
  sock.ev.on("messages.update", (updates) => {
    if (!current()) return;
    for (const update of updates) {
      const jid = update.key.remoteJid;
      if (!jid) continue;
      const message = (s.messages.get(jid) ?? []).find((item) => item.key.id === update.key.id);
      if (message) Object.assign(message, update.update);
    }
  });

  sock.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
    if (!current()) return;

    if (qr && !phone) {
      s.status = "qr_ready";
      s.lastError = null;
      s.qrDataUrl = await QRCode.toDataURL(qr, { width: 320, margin: 1 });
    }

    if (connection === "open") {
      s.status = "connected";
      s.qrDataUrl = null;
      s.pairingCode = null;
      s.lastError = null;
      s.reconnects = 0;
      s.pairingUntil = 0;
      s.phoneNumber = sock.user?.id ? phoneFromJid(sock.user.id) : null;
      log(id, `conectado como +${s.phoneNumber ?? "?"}`);
    }

    if (connection === "close") {
      const code = (lastDisconnect?.error as { output?: { statusCode?: number } })?.output?.statusCode;
      s.status = "disconnected";
      s.socket = null;
      s.generation += 1; // this socket is done; ignore anything else it emits

      // 515 is not a failure: WhatsApp always forces a restart right after
      // pair-success. Reconnect immediately and do not count it as a retry.
      if (code === DisconnectReason.restartRequired) {
        log(id, "pareado — reiniciando socket (515)");
        s.retryTimer = setTimeout(() => void connect(id).catch((e) => console.error(`[wa:${id}]`, e)), 250);
        return;
      }

      if (code === DisconnectReason.loggedOut) {
        log(id, "sessão encerrada no celular (401) — credenciais apagadas");
        s.lastError = "Sessão encerrada no celular. Pareie novamente.";
        s.phoneNumber = null;
        s.pairingUntil = 0;
        await clearCreds(id);
        return;
      }

      const registered = Boolean(state.creds.registered);
      const pairingOpen = Date.now() < s.pairingUntil;
      if (!registered && !pairingOpen) {
        // Nobody is watching a QR for this account — stop, don't loop for days.
        log(id, `desconectado (${code ?? "?"}) sem pareamento ativo — aguardando ação do admin`);
        s.lastError = "Tempo de pareamento esgotado. Clique em parear novamente.";
        return;
      }

      s.reconnects += 1;
      const delay = Math.min(s.reconnects * RECONNECT_STEP_MS, RECONNECT_CAP_MS);
      s.lastError = `Desconectado (código ${code ?? "?"}).`;
      log(id, `desconectado (${code ?? "?"}) — reconectando em ${delay}ms`);
      s.retryTimer = setTimeout(() => void connect(id).catch((e) => console.error(`[wa:${id}]`, e)), delay);
    }
  });

  if (phone && !state.creds.registered) {
    // Wait for the real handshake instead of a fixed sleep — the old 1500ms
    // guess is what left `creds.json` half-written (me set, registered false).
    await sock.waitForSocketOpen();
    s.pairingCode = await sock.requestPairingCode(digits(phone));
    log(id, `código de pareamento emitido para +${digits(phone)}`);
  }
}

export function onInboundMessage(handler: InboundHandler) {
  onInbound = handler;
}

export async function startHub() {
  await mkdir(config.sessionsDir, { recursive: true });
  await Promise.all(ACCOUNTS.map(async (id) => {
    // Only resume accounts that are actually paired. Opening a socket for an
    // unpaired account produces a QR nobody scans and an endless retry loop.
    const { state } = await useMultiFileAuthState(sessionDir(id));
    if (!state.creds.registered) {
      log(id, "não pareado — aguardando pareamento pelo painel");
      return;
    }
    await connect(id).catch((error) => console.error(`[wa:${id}]`, error));
  }));
}

export function accountList() {
  return ACCOUNTS.map((id) => {
    const s = session(id);
    return { id, status: s.status, qrDataUrl: s.qrDataUrl, phoneNumber: s.phoneNumber, pairingCode: s.pairingCode, lastError: s.lastError };
  });
}

export async function pair(id: string, method: "qr" | "phone", phone?: string) {
  const s = session(id);
  if (method === "phone" && digits(phone ?? "").length < 10) throw new Error("Informe o número com DDI e DDD.");

  stop(s);
  // A re-pair always starts from zero. Reusing a folder that holds a partial
  // pairing (registered:false + me + pairingCode) makes WhatsApp reject the
  // handshake outright — the exact state that bricked the barbacue account.
  await clearCreds(s.id);
  s.qrDataUrl = null;
  s.pairingCode = null;
  s.lastError = null;
  s.phoneNumber = null;
  s.reconnects = 0;
  s.pairingUntil = Date.now() + PAIRING_WINDOW_MS;
  log(id, `pareamento iniciado (${method})`);

  await connect(s.id, method === "phone" ? phone : undefined);
  // Give the handshake a moment so the panel gets the QR/code in this response
  // instead of waiting for the next 5s poll; the poll is still the fallback.
  const deadline = Date.now() + 12_000;
  while (Date.now() < deadline && !s.qrDataUrl && !s.pairingCode && s.status !== "connected") {
    await new Promise((done) => setTimeout(done, 250));
  }
  return accountList().find((item) => item.id === id);
}

/**
 * Stop refreshing the QR for an account. Called when the admin leaves the
 * pairing modal — without it the hub would keep reopening sockets for a code
 * nobody is looking at, which is how the old build hammered WhatsApp for days.
 */
export function closePairingWindow(id: string) {
  const s = session(id);
  s.pairingUntil = 0;
  if (s.status !== "connected") {
    if (s.retryTimer) { clearTimeout(s.retryTimer); s.retryTimer = null; }
  }
}

export async function disconnect(id: string) {
  const s = session(id);
  const sock = s.socket;
  s.pairingUntil = 0;
  stop(s);
  if (sock) await sock.logout().catch(() => { /* socket already gone */ });
  await clearCreds(s.id);
  s.status = "disconnected"; s.phoneNumber = null; s.qrDataUrl = null; s.pairingCode = null; s.lastError = null;
  log(s.id, "desconectado pelo painel");
}

export async function chatList(account = "all") {
  const ids = ACCOUNTS;
  const rows = [];
  for (const id of ids) {
    const s = session(id);
    for (const [jid, messages] of s.messages) {
      const assigned = s.assignments.get(jid) ?? "barbacue";
      if (account !== "all" && account !== assigned) continue;
      const last = messages.at(-1);
      if (!last) continue;
      const body = bodyOf(last);
      let avatar: string | null = null;
      try { avatar = await s.socket?.profilePictureUrl(jid, "preview") ?? null; } catch { /* private avatar */ }
      rows.push({
        account: assigned, jid, name: s.names.get(jid) ?? (jid.endsWith("@g.us") ? "Grupo" : `+${phoneFromJid(jid)}`),
        avatar, lastMessage: body.text, lastType: body.type, timestamp: Number(last.messageTimestamp ?? 0) * 1000,
        unread: s.unread.get(jid) ?? 0,
        isGroup: jid.endsWith("@g.us"),
      });
    }
  }
  return rows.sort((a, b) => b.timestamp - a.timestamp);
}

export function messageList(account: string, jid: string) {
  const s = session(account);
  return (s.messages.get(jid) ?? []).map((message) => {
    const body = bodyOf(message);
    return {
      id: message.key.id, account, jid, fromMe: Boolean(message.key.fromMe), type: body.type,
      text: body.text, timestamp: Number(message.messageTimestamp ?? 0) * 1000,
      mediaUrl: ["image", "video", "audio", "document", "sticker"].includes(body.type)
        ? `/api/admin/whatsapp/media?account=${account}&jid=${encodeURIComponent(jid)}&id=${message.key.id}` : null,
    };
  });
}

export async function sendMessage(account: string, jid: string, content: AnyMessageContent) {
  const s = session(account);
  if (!s.socket || s.status !== "connected") throw new Error("WhatsApp desconectado");
  const result = await s.socket.sendMessage(jid, content);
  if (result) remember(s, result);
  return result?.key.id;
}

export async function readChat(account: string, jid: string) {
  const s = session(account);
  const keys = (s.messages.get(jid) ?? []).filter((m) => !m.key.fromMe).map((m) => m.key);
  if (keys.length) await s.socket?.readMessages(keys);
  s.unread.set(jid, 0);
}

export async function media(account: string, jid: string, id: string) {
  const s = session(account);
  const message = (s.messages.get(jid) ?? []).find((item) => item.key.id === id);
  if (!message) throw new Error("Mídia não encontrada");
  if (!s.socket) throw new Error("WhatsApp desconectado");
  const buffer = await downloadMediaMessage(message, "buffer", {}, { logger, reuploadRequest: s.socket.updateMediaMessage });
  const content = message.message?.ephemeralMessage?.message ?? message.message;
  const node = content?.imageMessage ?? content?.videoMessage ?? content?.audioMessage ?? content?.documentMessage ?? content?.stickerMessage;
  return { buffer, mime: node?.mimetype ?? "application/octet-stream" };
}
