// Stub of the whatsapp-bot HTTP surface, for the pairing visual test.
// Serves a deterministic three-account fixture so the panel can be driven
// without touching real WhatsApp servers.
//
//   PORT=3999 BOT_API_TOKEN=test-token node tests/fake-bot-server.mjs
//
import http from "node:http";
import QRCode from "../../../node_modules/qrcode/lib/index.js";

const PORT = Number(process.env.PORT || 3999);
const TOKEN = process.env.BOT_API_TOKEN || "test-token";

const qrDataUrl = await QRCode.toDataURL("2@fixture-pairing-ref,for-visual-test,==", { width: 320, margin: 1 });

// One account per pairing state the panel has to render.
const accounts = [
  { id: "barbacue", status: "qr_ready", qrDataUrl, phoneNumber: null, pairingCode: null, lastError: null },
  { id: "chelas", status: "disconnected", qrDataUrl: null, phoneNumber: null, pairingCode: null,
    lastError: "Tempo de pareamento esgotado. Clique em parear novamente." },
  { id: "barbadogs", status: "connected", qrDataUrl: null, phoneNumber: "5547997056624", pairingCode: null, lastError: null },
];

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  const header = req.headers["x-bot-token"];
  const token = (Array.isArray(header) ? header[0] : header) || url.searchParams.get("token");
  const send = (value, status = 200) => {
    res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(value));
  };

  if (url.pathname === "/health") return send({ ok: true });
  if (token !== TOKEN) return send({ error: "unauthorized" }, 401);
  if (url.pathname === "/status" || url.pathname === "/accounts") return send({ accounts });
  if (url.pathname === "/chats") return send({ chats: [] });
  if (url.pathname === "/messages" && req.method === "GET") return send({ messages: [] });
  if (req.method === "POST" && url.pathname === "/pair") return send(accounts[0], 202);
  if (req.method === "POST" && url.pathname === "/pair-cancel") return send({ ok: true });
  return send({ error: "not found" }, 404);
});

server.listen(PORT, () => console.log(`[fake-bot] :${PORT}`));
