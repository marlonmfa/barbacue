import { onlineOrderSchema, onlineErrorResponse } from "@/lib/online-payment";
import { createOnlineOrder, ensureOnlinePayment, onlineReceipt } from "@/lib/online-checkout";
import { clientIp } from "@/lib/rate-limit";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const raw = await request.text();
    if (raw.length > 24_000) return Response.json({ message: "Pedido muito grande." }, { status: 413 });
    const parsed = onlineOrderSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return Response.json({ message: parsed.error.issues[0]?.message ?? "Revise o pedido." }, { status: 422 });
    const id = await createOnlineOrder(parsed.data, clientIp(request));
    let message: string | undefined;
    try { await ensureOnlinePayment(id, parsed.data); }
    catch { message = "O pedido está salvo. Consulte novamente para recuperar o pagamento sem duplicar o pedido. Se persistir, fale com a loja."; }
    return Response.json({ ...await onlineReceipt(id), message }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return onlineErrorResponse(error); }
}
