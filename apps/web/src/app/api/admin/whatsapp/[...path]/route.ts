import { NextResponse } from "next/server";
import { withStaff } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ path: string[] }> };

const proxy = withStaff<Context>(async (request, context) => {
  const base = process.env.BOT_STATUS_URL;
  const token = process.env.BOT_API_TOKEN;
  if (!base || !token) return NextResponse.json({ error: "Serviço WhatsApp não configurado." }, { status: 503 });
  const { path } = await context.params;
  const target = new URL(path.join("/"), `${base.replace(/\/$/, "")}/`);
  request.nextUrl.searchParams.forEach((value, key) => target.searchParams.set(key, value));
  try {
    const response = await fetch(target, {
      method: request.method,
      headers: { "x-bot-token": token, "content-type": request.headers.get("content-type") ?? "application/json" },
      body: request.method === "GET" || request.method === "HEAD" ? undefined : await request.text(),
      cache: "no-store",
      // Pairing holds the request while the WhatsApp handshake runs (version
      // fetch + socket open + pairing code), so it needs the long budget too —
      // aborting at 10s surfaced a bogus "Serviço WhatsApp offline".
      signal: AbortSignal.timeout(path[0] === "media" || path[0] === "pair" ? 30_000 : 10_000),
    });
    return new NextResponse(response.body, {
      status: response.status,
      headers: {
        "content-type": response.headers.get("content-type") ?? "application/json",
        "cache-control": response.headers.get("cache-control") ?? "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "Serviço WhatsApp offline." }, { status: 503 });
  }
});

export const GET = proxy;
export const POST = proxy;
export const DELETE = proxy;
