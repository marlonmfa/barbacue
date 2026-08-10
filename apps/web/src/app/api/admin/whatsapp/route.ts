import { NextResponse } from "next/server";
import { withRole } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

// Server-side proxy to the WhatsApp bot's status server. Keeps BOT_API_TOKEN on
// the server and lets only admins read the pairing QR / connection status.
export const GET = withRole("admin", async () => {
  const base = process.env.BOT_STATUS_URL;
  const token = process.env.BOT_API_TOKEN;
  if (!base || !token) {
    return NextResponse.json({ error: "Bot não configurado (BOT_STATUS_URL/BOT_API_TOKEN)." }, { status: 503 });
  }

  try {
    const res = await fetch(`${base}/status`, {
      headers: { "x-bot-token": token },
      cache: "no-store",
      // Don't hang the admin page if the bot is down.
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      return NextResponse.json({ error: `Bot respondeu ${res.status}` }, { status: 502 });
    }
    return NextResponse.json(await res.json());
  } catch {
    return NextResponse.json({ error: "Bot offline ou inacessível.", status: "disconnected" }, { status: 200 });
  }
});
