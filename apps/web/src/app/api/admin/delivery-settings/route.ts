import { withStaff } from "@/lib/admin-auth";
import { deliverySettingsOverview, saveDeliverySettings } from "@/lib/delivery-service";
import { deliveryErrorResponse, deliverySettingsSchema, readDeliveryJson } from "@/lib/delivery";

export const runtime = "nodejs";
export const GET = withStaff(async () => {
  try { return Response.json(await deliverySettingsOverview(), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return deliveryErrorResponse(error); }
});
export const PUT = withStaff(async request => {
  try {
    const parsed = deliverySettingsSchema.safeParse(await readDeliveryJson(request));
    if (!parsed.success) return Response.json({ error: "invalid_delivery_settings", message: parsed.error.issues[0]?.message ?? "Revise a configuração do frete." }, { status: 422 });
    return Response.json(await saveDeliverySettings(parsed.data), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return deliveryErrorResponse(error); }
});
