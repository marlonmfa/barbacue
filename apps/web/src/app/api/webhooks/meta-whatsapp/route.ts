import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function endpoint(request: Request) {
  const base = process.env.BOT_STATUS_URL;
  if (!base) return null;
  const target = new URL("webhooks/meta", `${base.replace(/\/$/, "")}/`);
  new URL(request.url).searchParams.forEach((value, key) => target.searchParams.set(key, value));
  return target;
}

export async function GET(request: Request) {
  const target = endpoint(request);
  if (!target) return NextResponse.json({ error: "Serviço WhatsApp não configurado." }, { status: 503 });
  try {
    const response = await fetch(target, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
    return new NextResponse(response.body, { status: response.status, headers: { "content-type": response.headers.get("content-type") ?? "text/plain" } });
  } catch {
    return NextResponse.json({ error: "Serviço WhatsApp offline." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const target = endpoint(request);
  if (!target) return NextResponse.json({ error: "Serviço WhatsApp não configurado." }, { status: 503 });
  try {
    const response = await fetch(target, {
      method: "POST",
      headers: {
        "content-type": request.headers.get("content-type") ?? "application/json",
        ...(request.headers.get("x-hub-signature-256") ? { "x-hub-signature-256": request.headers.get("x-hub-signature-256")! } : {}),
        ...(request.headers.get("x-cog-router-signature") ? { "x-cog-router-signature": request.headers.get("x-cog-router-signature")! } : {}),
      },
      body: await request.text(),
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
    return new NextResponse(response.body, { status: response.status, headers: { "content-type": response.headers.get("content-type") ?? "application/json" } });
  } catch {
    return NextResponse.json({ error: "Serviço WhatsApp offline." }, { status: 503 });
  }
}
