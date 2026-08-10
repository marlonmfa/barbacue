import * as dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Single source of truth lives at the monorepo root, like apps/web.
const here = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(here, "../../../.env") });

export const config = {
  // Where the Next.js web API lives (the bot bridges to it). In Docker this is
  // the internal host (http://web:3000), NOT reachable by customers.
  webBaseUrl: process.env.WEB_BASE_URL || "http://localhost:3000",
  // Public, customer-facing site URL used in links sent over WhatsApp. Falls
  // back to webBaseUrl for local dev where they're the same.
  publicSiteUrl: process.env.PUBLIC_SITE_URL || process.env.WEB_BASE_URL || "http://localhost:3000",
  // Shared secret for the protected bot endpoints (order history, status server).
  botApiToken: process.env.BOT_API_TOKEN || "",
  // Tiny HTTP server exposing pairing QR + status to the admin panel.
  port: Number(process.env.BOT_PORT || 3001),
  // Deep link the customer can tap to finish in the mobile app. The order id is appended.
  appDeeplinkBase: process.env.APP_DEEPLINK_BASE || "",
  // Baileys multi-file auth state directory (mount as a Docker volume).
  sessionsDir: process.env.SESSIONS_DIR || resolve(here, "../sessions"),
  // Drop a conversation's in-memory state after this much inactivity.
  sessionTtlMs: Number(process.env.BOT_SESSION_TTL_MS || 1000 * 60 * 30),
};

if (!config.botApiToken) {
  console.warn("[config] BOT_API_TOKEN is empty — protected endpoints will reject requests.");
}
