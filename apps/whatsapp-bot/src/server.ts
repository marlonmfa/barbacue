import http from "node:http";
import type { AnyMessageContent } from "@whiskeysockets/baileys";
import { config } from "./config.js";
import { accountList, chatList, closePairingWindow, disconnect, media, messageList, pair, readChat, sendMessage } from "./wa/hub.js";

// Minimal HTTP surface for the admin panel to read pairing status + QR.
// Protected by the shared bot token (header x-bot-token or ?token=).

function authorized(req: http.IncomingMessage, url: URL): boolean {
  if (!config.botApiToken) return false;
  const header = req.headers["x-bot-token"];
  const token = (Array.isArray(header) ? header[0] : header) || url.searchParams.get("token");
  return token === config.botApiToken;
}

function json(res: http.ServerResponse, value: unknown, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(value));
}

async function body(req: http.IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
}

export function startServer(): void {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${config.port}`);

    // Unauthenticated liveness probe for Docker/health checks.
    if (url.pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (!authorized(req, url)) {
      res.writeHead(401, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "unauthorized" }));
      return;
    }

    try {
      if (url.pathname === "/status" || url.pathname === "/accounts") return json(res, { accounts: accountList() });
      if (url.pathname === "/chats") return json(res, { chats: await chatList(url.searchParams.get("account") ?? "all") });
      if (url.pathname === "/messages") return json(res, { messages: messageList(url.searchParams.get("account") ?? "", url.searchParams.get("jid") ?? "") });
      if (url.pathname === "/media") {
        const result = await media(url.searchParams.get("account") ?? "", url.searchParams.get("jid") ?? "", url.searchParams.get("id") ?? "");
        res.writeHead(200, { "Content-Type": result.mime, "Cache-Control": "private, max-age=86400" });
        return res.end(result.buffer);
      }
      if (req.method === "POST" && url.pathname === "/pair") {
        const input = await body(req);
        return json(res, await pair(input.account, input.method, input.phone), 202);
      }
      if (req.method === "POST" && url.pathname === "/pair-cancel") {
        const input = await body(req); closePairingWindow(input.account); return json(res, { ok: true });
      }
      if (req.method === "POST" && url.pathname === "/disconnect") {
        const input = await body(req); await disconnect(input.account); return json(res, { ok: true });
      }
      if (req.method === "POST" && url.pathname === "/messages") {
        const input = await body(req);
        const content = (input.media
          ? { [input.media.type]: input.media.data ? Buffer.from(input.media.data, "base64") : { url: input.media.url }, caption: input.text, mimetype: input.media.mime, fileName: input.media.name }
          : { text: input.text }) as AnyMessageContent;
        return json(res, { id: await sendMessage(input.account, input.jid, content) }, 201);
      }
      if (req.method === "POST" && url.pathname === "/read") {
        const input = await body(req); await readChat(input.account, input.jid); return json(res, { ok: true });
      }
    } catch (error) {
      return json(res, { error: error instanceof Error ? error.message : "Falha no WhatsApp" }, 400);
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
  });

  server.listen(config.port, () => {
    console.log(`[server] status/QR endpoint on :${config.port}`);
  });
}
