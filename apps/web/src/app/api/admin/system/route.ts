import { NextResponse } from "next/server";
import { db } from "@/db";
import { storeSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { withRole } from "@/lib/admin-auth";

// Read-only integration health for the SYSTEM ADMIN. Secrets live in the server
// env (.env / ecosystem.config.js) and are NEVER returned or editable here —
// exposing or web-editing production secrets would be the bigger risk. We only
// report whether each integration is configured, so an admin can diagnose.
export const GET = withRole("admin", async () => {
  const [settings] = await db.select().from(storeSettings).where(eq(storeSettings.id, 1));
  const cookieSecret = process.env.ADMIN_COOKIE_SECRET ?? "";

  return NextResponse.json({
    openai: {
      configured: Boolean(process.env.OPENAI_API_KEY || process.env.OPENAI_KEY),
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    },
    whatsappBot: { configured: Boolean(process.env.BOT_API_TOKEN) },
    gmail: {
      configured: Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD),
      address: process.env.GMAIL_USER || null,
    },
    sessionSecret: { configured: cookieSecret.length >= 16 },
    masterPassword: {
      configured: Boolean(process.env.ADMIN_MASTER_PASSWORD || process.env.ADMIN_PASSWORD),
    },
    pix: { configured: Boolean(settings?.pixKey) },
    publicSiteUrl: process.env.PUBLIC_SITE_URL || null,
    nodeEnv: process.env.NODE_ENV,
  });
});
