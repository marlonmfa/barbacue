import { config } from "./config.js";
import { startSocket } from "./wa/socket.js";
import { startServer } from "./server.js";
import { handleMessage, sweepIdleSessions } from "./conversation.js";

async function main(): Promise<void> {
  console.log(`[bot] iniciando — web API em ${config.webBaseUrl}`);

  // 1) Status/QR HTTP server for the admin pairing page.
  startServer();

  // 2) WhatsApp socket; each inbound message is bridged to the AI ordering agent.
  await startSocket(handleMessage);

  // 3) Periodically drop idle in-memory conversations.
  setInterval(sweepIdleSessions, 60_000);
}

main().catch((err) => {
  console.error("[bot] fatal", err);
  process.exit(1);
});

process.on("SIGINT", () => { console.log("[bot] encerrando..."); process.exit(0); });
process.on("SIGTERM", () => { process.exit(0); });
