import makeWASocket, {
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
  Browsers,
  type WASocket,
  type WAMessage,
} from "@whiskeysockets/baileys";
import QRCode from "qrcode";
import pino from "pino";
import { config } from "../config.js";

export type WAStatus = "disconnected" | "connecting" | "qr_ready" | "connected";

type MessageHandler = (phone: string, text: string) => Promise<string[]>;

const logger = pino({ level: "silent" });

let sock: WASocket | null = null;
let status: WAStatus = "disconnected";
let qrDataUrl: string | null = null;
let phoneNumber: string | null = null;
let reconnectAttempts = 0;
let onMessage: MessageHandler = async () => [];

export function getStatus() {
  return { status, qrDataUrl, phoneNumber };
}

/** Extract a plain-text body from the supported message types. */
function extractText(msg: WAMessage): string | null {
  const m = msg.message;
  if (!m) return null;
  return (
    m.conversation ??
    m.extendedTextMessage?.text ??
    m.imageMessage?.caption ??
    m.videoMessage?.caption ??
    null
  );
}

function jidToPhone(jid: string): string {
  return jid.split("@")[0].split(":")[0];
}

export async function startSocket(handler: MessageHandler): Promise<void> {
  onMessage = handler;
  await connect();
}

async function connect(): Promise<void> {
  status = "connecting";
  const { state, saveCreds } = await useMultiFileAuthState(config.sessionsDir);
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    auth: state,
    version,
    browser: Browsers.ubuntu("Chrome"),
    logger,
    connectTimeoutMs: 60_000,
    // QR is surfaced via the admin panel + terminal below, not the deprecated flag.
    printQRInTerminal: false,
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      status = "qr_ready";
      qrDataUrl = await QRCode.toDataURL(qr, { width: 300, margin: 2 });
      // Render an ASCII QR so it can also be scanned straight from the terminal.
      try {
        const ascii = await QRCode.toString(qr, { type: "terminal", small: true });
        console.log("\n[wa] Escaneie o QR para parear:\n" + ascii);
      } catch {
        console.log("[wa] QR pronto — abra /qr no painel admin para escanear.");
      }
    }

    if (connection === "open") {
      status = "connected";
      qrDataUrl = null;
      reconnectAttempts = 0;
      phoneNumber = sock?.user?.id ? jidToPhone(sock.user.id) : null;
      console.log(`[wa] conectado como ${phoneNumber ?? "?"}`);
    }

    if (connection === "close") {
      status = "disconnected";
      const code = (lastDisconnect?.error as { output?: { statusCode?: number } })?.output?.statusCode;
      const loggedOut = code === DisconnectReason.loggedOut;
      if (loggedOut) {
        // Session invalidated (logged out from the phone). Stop and require re-pair.
        console.warn("[wa] sessão encerrada (logout). Apague a pasta de sessões e pareie novamente.");
        return;
      }
      // Reconnect with capped backoff for every other disconnect (incl. 515 restart).
      reconnectAttempts += 1;
      const delay = Math.min(reconnectAttempts * 2_000, 30_000);
      console.log(`[wa] desconectado (code ${code ?? "?"}); reconectando em ${delay}ms`);
      setTimeout(() => { connect().catch((e) => console.error("[wa] reconnect failed", e)); }, delay);
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;
    for (const msg of messages) {
      const jid = msg.key.remoteJid ?? "";
      // Ignore our own echoes, groups, and status broadcasts.
      if (msg.key.fromMe) continue;
      if (jid.endsWith("@g.us") || jid === "status@broadcast" || jid.endsWith("@newsletter")) continue;
      const text = extractText(msg);
      if (!text || !text.trim()) continue;

      const phone = jidToPhone(jid);
      try {
        await sock!.readMessages([msg.key]);
        await sock!.sendPresenceUpdate("composing", jid);
        const replies = await onMessage(phone, text.trim());
        for (const reply of replies) {
          await sock!.sendMessage(jid, { text: reply });
        }
        await sock!.sendPresenceUpdate("paused", jid);
      } catch (err) {
        console.error("[wa] handler error", err);
      }
    }
  });
}
