import { config } from "./config.js";
import { onInboundMessage, startHub } from "./wa/hub.js";
import { startServer } from "./server.js";
import { handleMessage, sweepIdleSessions } from "./conversation.js";

async function main(): Promise<void> {
  console.log(`[bot] iniciando — web API em ${config.webBaseUrl}`);

  // 1) Status/QR HTTP server for the admin pairing page.
  startServer();

  // 2) Bridge inbound WhatsApp text to the AI ordering agent. Registered before
  //    startHub so a session that resumes instantly already has a handler.
  onInboundMessage(handleMessage);

  // 3) WhatsApp sockets for every paired restaurant.
  await startHub();

  // 4) Periodically drop idle in-memory conversations.
  setInterval(sweepIdleSessions, 60_000);
}

// Baileys rejects from event handlers used to vanish silently, which is why the
// pairing failures left no trace in the PM2 logs.
process.on("unhandledRejection", (reason) => console.error("[bot] unhandledRejection", reason));

main().catch((err) => {
  console.error("[bot] fatal", err);
  process.exit(1);
});

process.on("SIGINT", () => { console.log("[bot] encerrando..."); process.exit(0); });
process.on("SIGTERM", () => { process.exit(0); });
