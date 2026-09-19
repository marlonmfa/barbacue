import { createDeliveryQuote, readDeliverySettings } from "@/lib/delivery-service";
import { DeliveryError, deliveryErrorResponse, deliveryQuoteRequestSchema, readDeliveryJson } from "@/lib/delivery";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try { return Response.json({ enabled: (await readDeliverySettings()).enabled }, { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return deliveryErrorResponse(error); }
}
export async function POST(request: Request) {
  try {
    if (!rateLimit(`delivery-quote:${clientIp(request)}`, 30, 60_000, 60_000).ok) throw new DeliveryError("Muitas consultas de frete. Aguarde um minuto e tente novamente.", "delivery_rate_limited", 429);
    const parsed = deliveryQuoteRequestSchema.safeParse(await readDeliveryJson(request));
    if (!parsed.success) return Response.json({ error: "invalid_delivery_address", message: parsed.error.issues[0]?.message ?? "Informe o endereço completo." }, { status: 422 });
    return Response.json(await createDeliveryQuote(parsed.data), { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return deliveryErrorResponse(error); }
}
