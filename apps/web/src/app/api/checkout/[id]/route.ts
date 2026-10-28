import { z } from "zod";
import { onlineErrorResponse, OnlinePaymentError } from "@/lib/online-payment";
import { authorizedCheckout, cancelOnlineCheckout, ensureOnlinePayment, onlineReceipt } from "@/lib/online-checkout";
import { clientIp, rateLimit } from "@/lib/rate-limit";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    if (!z.string().uuid().safeParse(id).success) throw new OnlinePaymentError("Confirmação inválida.", 404);
    const token = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
    if (!/^[a-f0-9]{64}$/.test(token)) throw new OnlinePaymentError("Confirmação inválida.", 404);
    if (!rateLimit(`checkout-read:${clientIp(request)}`, 180, 60_000, 60_000).ok) throw new OnlinePaymentError("Aguarde um minuto para consultar novamente.", 429);
    const checkout = await authorizedCheckout(id, token);
    let message: string | undefined;
    if (!checkout.lastCheckedAt || Date.now() - checkout.lastCheckedAt.getTime() >= 8_000) {
      try { await ensureOnlinePayment(id); }
      catch { message = "Ainda não conseguimos atualizar o pagamento. O pedido está salvo; consulte novamente ou fale com a loja."; }
    }
    return Response.json({ ...await onlineReceipt(id), message }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return onlineErrorResponse(error); }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    if (!z.string().uuid().safeParse(id).success) throw new OnlinePaymentError("Pedido inválido.", 404);
    const token = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
    if (!/^[a-f0-9]{64}$/.test(token)) throw new OnlinePaymentError("Confirmação inválida.", 404);
    await authorizedCheckout(id, token);
    await cancelOnlineCheckout(id);
    return Response.json(await onlineReceipt(id), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return onlineErrorResponse(error); }
}
