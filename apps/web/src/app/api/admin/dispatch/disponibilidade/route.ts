import { z } from "zod";
import { withStaff } from "@/lib/admin-auth";
import { canSetCourierAvailability, declareCourierAvailable } from "@/lib/courier-availability";

const input = z.object({ driverId: z.number().int().positive() }).strict();
const headers = { "Cache-Control": "private, no-store" };

export const POST = withStaff(async (request, _context, session) => {
  if (!canSetCourierAvailability(session.role)) {
    return Response.json({ error: "A operação é restrita à equipe de despacho." }, { status: 403, headers });
  }
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Informe um entregador válido." }, { status: 422, headers });
  const until = await declareCourierAvailable(parsed.data.driverId);
  if (!until) return Response.json({ error: "O entregador precisa estar ativo e ter acesso a Minhas entregas." }, { status: 404, headers });
  return Response.json({ availableUntil: until }, { headers });
});
