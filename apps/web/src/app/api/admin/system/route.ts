import { NextResponse } from "next/server";
import { db } from "@/db";
import { storeSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { withRole } from "@/lib/admin-auth";
import { readAISettings, publicAISettings, saveAISettings } from "@/lib/ai-settings";

// Only administrators can view provider status or change encrypted AI credentials.
export const GET = withRole("admin", async () => {
  const [settings] = await db.select().from(storeSettings).where(eq(storeSettings.id, 1));
  const cookieSecret = process.env.ADMIN_COOKIE_SECRET ?? "";
  const ai = publicAISettings(await readAISettings());

  return NextResponse.json({
    ai,
    openai: { configured: ai.openaiConfigured, model: ai.openaiModel },
    whatsappBot: { configured: Boolean(process.env.BOT_API_TOKEN) },
    gmail: {
      configured: Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD),
      address: process.env.GMAIL_USER || null,
    },
    sessionSecret: { configured: cookieSecret.length >= 16 },
    pix: { configured: Boolean(settings?.pixKey) },
    publicSiteUrl: process.env.PUBLIC_SITE_URL || null,
    nodeEnv: process.env.NODE_ENV,
  });
});

export const PUT = withRole("admin", async (request) => {
  const origin = request.headers.get("origin");
  let validOrigin = false;
  try { validOrigin = !!origin && new URL(origin).host === (request.headers.get("x-forwarded-host") || request.headers.get("host") || request.nextUrl.host); } catch {}
  if (!validOrigin) return NextResponse.json({ error: "Origem inválida" }, { status: 403 });
  let patch: Record<string, unknown>;
  try { patch = await request.json(); } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }
  try { return NextResponse.json(await saveAISettings(patch)); } catch { return NextResponse.json({ error: "Não foi possível salvar. Confira provedor, modelo e configuração de cifragem." }, { status: 400 }); }
});
