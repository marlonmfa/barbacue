import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Public ingress for zap.cog.ia.br. The bot validates x-zapauto-signature using
// ZAP_WEBHOOK_SECRET before handing the event to the ordering agent.
export async function POST(request: Request) {
  const base = process.env.BOT_STATUS_URL;
  const token = process.env.BOT_API_TOKEN;
  if (!base || !token) return NextResponse.json({ error: "Serviço WhatsApp não configurado." }, { status: 503 });

  try {
    const response = await fetch(`${base.replace(/\/$/, "")}/webhooks/zap`, {
      method: "POST",
      headers: {
        "content-type": request.headers.get("content-type") ?? "application/json",
        "x-bot-token": token,
        ...(request.headers.get("x-zapauto-signature") ? { "x-zapauto-signature": request.headers.get("x-zapauto-signature")! } : {}),
        ...(request.headers.get("x-zap-signature") ? { "x-zap-signature": request.headers.get("x-zap-signature")! } : {}),
        ...(request.headers.get("x-webhook-signature") ? { "x-webhook-signature": request.headers.get("x-webhook-signature")! } : {}),
      },
      body: await request.text(),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    return new NextResponse(response.body, { status: response.status, headers: { "content-type": response.headers.get("content-type") ?? "application/json" } });
  } catch {
    return NextResponse.json({ error: "Serviço WhatsApp offline." }, { status: 503 });
  }
}
