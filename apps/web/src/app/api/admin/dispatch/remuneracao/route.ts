import { z } from "zod";
import { withStaff } from "@/lib/admin-auth";
import { courierOperatingDay, validOperatingDay } from "@/lib/courier-pay";
import { canReviewCourierPay, confirmCourierShift, courierPayReport, measureCourierDistance } from "@/lib/courier-pay-report";
import { DeliveryError } from "@/lib/delivery";
import { rateLimit } from "@/lib/rate-limit";

const headers = { "Cache-Control": "private, no-store" };
const failure = (message: string, status: number) => Response.json({ error: message }, { status, headers });
const daySchema = z.string().refine(day => validOperatingDay(day) && day <= courierOperatingDay());
const action = z.discriminatedUnion("type", [
  z.object({ type: z.literal("confirmShift"), day: daySchema, driverId: z.number().int().positive(), confirmed: z.boolean() }).strict(),
  z.object({ type: z.literal("measureDistance"), orderId: z.uuid() }).strict(),
]);

export const GET = withStaff(async (request, _context, session) => {
  if (!canReviewCourierPay(session.role)) return failure("A remuneração é restrita à gestão.", 403);
  const day = daySchema.safeParse(new URL(request.url).searchParams.get("dia") ?? courierOperatingDay());
  if (!day.success) return failure("Informe um dia operacional válido.", 422);
  return Response.json(await courierPayReport(day.data), { headers });
});

export const POST = withStaff(async (request, _context, session) => {
  if (!canReviewCourierPay(session.role)) return failure("A remuneração é restrita à gestão.", 403);
  const parsed = action.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return failure("Revise a entrega ou o turno informado.", 422);
  const input = parsed.data;
  try {
    if (input.type === "confirmShift") {
      if (!await confirmCourierShift(input.day, input.driverId, input.confirmed, session.userId)) {
        return failure("Entregador não encontrado.", 404);
      }
      return Response.json({ ok: true }, { headers });
    }
    if (!rateLimit(`courier-distance:${session.userId}`, 20, 60_000, 60_000).ok) return failure("Aguarde um minuto para medir novas distâncias.", 429);
    return Response.json({ distanceMeters: await measureCourierDistance(input.orderId) }, { headers });
  } catch (error) {
    if (error instanceof DeliveryError) return failure(error.message, error.status);
    throw error;
  }
});
