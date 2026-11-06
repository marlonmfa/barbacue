import { NextResponse } from "next/server";
import { withStaff } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ path: string[] }> };

// Administrator-only: pairing, reading and sending on the business number.
const proxy = withStaff<Context>(async (request, context, session) => {
  const base = process.env.BOT_STATUS_URL;
  const token = process.env.BOT_API_TOKEN;
  if (!base || !token) return NextResponse.json({ error: "Serviço WhatsApp não configurado." }, { status: 503 });
  const { path } = await context.params;
  const operation = path.join("/");
  const delegated = request.method === "GET" && ["accounts", "chats", "messages"].includes(operation)
    || request.method === "POST" && ["messages", "read", "history/recover"].includes(operation);
  if (session.role !== "admin" && !delegated) return NextResponse.json({ error: "Somente o administrador pode gerenciar a conexão WhatsApp." }, { status: 403 });
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
      signal: AbortSignal.timeout(["media", "pair", "history", "chats", "messages"].includes(path[0]) ? 30_000 : 10_000),
    });
    if (operation === "accounts" && session.role !== "admin" && response.ok) {
      const data = await response.json();
      return NextResponse.json({ accounts: (data.accounts ?? []).map((account: { id: string; status: string; phoneNumber?: string }) => ({ id: account.id, status: account.status, phoneNumber: account.phoneNumber, qrDataUrl: null, pairingCode: null })) }, { headers: { "Cache-Control": "no-store" } });
    }
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
