import { z } from "zod";
import { withStaff } from "@/lib/admin-auth";
import { DeliveryError, deliveryAddressSchema, deliveryErrorResponse, deliveryProviderSchema, readDeliveryJson } from "@/lib/delivery";
import { getDeliveryProvider } from "@/lib/delivery-provider";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
const schema = z.object({ address: deliveryAddressSchema, provider: deliveryProviderSchema }).strict();
export const POST = withStaff(async request => {
  try {
    if (!rateLimit(`delivery-origin:${clientIp(request)}`, 15, 60_000, 60_000).ok) throw new DeliveryError("Muitas buscas de endereço. Aguarde um minuto.", "delivery_rate_limited", 429);
    const parsed = schema.safeParse(await readDeliveryJson(request));
    if (!parsed.success) return Response.json({ error: "invalid_delivery_address", message: parsed.error.issues[0]?.message ?? "Informe o endereço completo." }, { status: 422 });
    return Response.json(await getDeliveryProvider(parsed.data.provider).geocode(parsed.data.address), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return deliveryErrorResponse(error); }
});
