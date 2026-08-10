import http from "node:http";
import { config } from "./config.js";
import { getStatus } from "./wa/socket.js";

// Minimal HTTP surface for the admin panel to read pairing status + QR.
// Protected by the shared bot token (header x-bot-token or ?token=).

function authorized(req: http.IncomingMessage, url: URL): boolean {
  if (!config.botApiToken) return false;
  const header = req.headers["x-bot-token"];
  const token = (Array.isArray(header) ? header[0] : header) || url.searchParams.get("token");
  return token === config.botApiToken;
}

export function startServer(): void {
  const server = http.createServer((req, res) => {
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

    if (url.pathname === "/status" || url.pathname === "/qr") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(getStatus()));
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
  });

  server.listen(config.port, () => {
    console.log(`[server] status/QR endpoint on :${config.port}`);
  });
}
