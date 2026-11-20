import { NextRequest } from "next/server";
import { deliveryLinkData, deliveryLinkFailure, deliveryLinkMutate } from "@/lib/delivery-link";
import { rateLimit } from "@/lib/rate-limit";

type Context = { params: Promise<{ token: string }> };
const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow" };

export async function GET(_req: NextRequest, { params }: Context) {
  try { return Response.json(await deliveryLinkData((await params).token), { headers }); }
  catch (error) { return deliveryLinkFailure(error); }
}

export async function POST(req: NextRequest, { params }: Context) {
  const { token } = await params;
  if (!rateLimit(`delivery-write:${token}`, 20, 60_000, 60_000).ok) return Response.json({ error: "Aguarde um minuto antes de enviar novamente." }, { status: 429, headers });
  try {
    await deliveryLinkMutate(token, await req.json().catch(() => null), "driver");
    return Response.json(await deliveryLinkData(token), { headers });
  } catch (error) { return deliveryLinkFailure(error); }
}
