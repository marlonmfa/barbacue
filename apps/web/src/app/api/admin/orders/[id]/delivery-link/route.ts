import QRCode from "qrcode";
import { NextRequest } from "next/server";
import { withStaff } from "@/lib/admin-auth";
import { deliveryLinkData, deliveryLinkFailure, deliveryLinkMutate } from "@/lib/delivery-link";

type Context = { params: Promise<{ id: string }> };
const headers = { "Cache-Control": "private, no-store" };
export const GET = withStaff(async (_req: NextRequest, { params }: Context) => {
  try {
    const data = await deliveryLinkData((await params).id, false);
    const url = new URL(`/entregas/${data.token}`, process.env.PUBLIC_SITE_URL || process.env.APP_URL || "https://barbacue.cog.ia.br").toString();
    return Response.json({ ...data, token: undefined, url, qr: await QRCode.toDataURL(url, { width: 256, margin: 4, errorCorrectionLevel: "M" }) }, { headers });
  } catch (error) { return deliveryLinkFailure(error); }
});
export const POST = withStaff(async (req: NextRequest, { params }: Context) => {
  try {
    await deliveryLinkMutate((await params).id, await req.json().catch(() => null), "store");
    return Response.json({ ok: true }, { headers });
  } catch (error) { return deliveryLinkFailure(error); }
});
