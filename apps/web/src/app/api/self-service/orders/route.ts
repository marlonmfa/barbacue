import { createSelfServiceOrder } from "@/lib/self-service-orders";
import { SelfServiceError, selfServiceOrderSchema } from "@/lib/self-service";
import { clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const maxBytes = 20_000;
  if (Number(request.headers.get("content-length") ?? 0) > maxBytes) return Response.json({ error: "order_too_large", message: "Pedido muito grande. Divida os itens ou chame um atendente." }, { status: 413 });
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (reader) {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        return Response.json({ error: "order_too_large", message: "Pedido muito grande. Divida os itens ou chame um atendente." }, { status: 413 });
      }
      chunks.push(value);
    }
  }
  let body: unknown = null;
  try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { /* Validated below. */ }
  const parsed = selfServiceOrderSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "invalid_order", message: parsed.error.issues[0]?.message ?? "Revise os dados do pedido." }, { status: 422 });
  try {
    const { receipt, replayed } = await createSelfServiceOrder(parsed.data, clientIp(request));
    return Response.json(receipt, { status: replayed ? 200 : 201, headers: { "Cache-Control": "no-store", ...(replayed ? { "Idempotent-Replayed": "true" } : {}) } });
  } catch (error) {
    if (error instanceof SelfServiceError) return Response.json({ error: error.code, message: error.message, ...(error.code === "store_closed" ? { storeClosed: true } : {}) }, { status: error.status, headers: error.status === 429 ? { "Retry-After": "60" } : undefined });
    console.error("self-service order failed", error);
    return Response.json({ error: "order_failed", message: "Não foi possível confirmar agora. Tente novamente; o mesmo envio não duplica seu pedido." }, { status: 500 });
  }
}
