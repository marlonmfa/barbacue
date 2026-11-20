import { z } from "zod";
import { withStaff } from "@/lib/admin-auth";
import { dispatchConfigSchema } from "@/lib/dispatch-planner";
import { changeDispatchRoute, dispatchFailure, dispatchOverview, generateDispatch, removeDispatchStop, saveDispatchConfig } from "@/lib/dispatch-service";
import { canSetCourierAvailability } from "@/lib/courier-availability";
import { canReviewCourierPay } from "@/lib/courier-pay-report";
import { can } from "@/lib/permissions";

export const runtime = "nodejs";
const configInput = z.object({ config: dispatchConfigSchema, revision: z.number().int().nonnegative() }).strict();
const routeAction = z.union([
  z.object({ id: z.string().uuid(), driverId: z.number().int().positive().nullable() }).strict(),
  z.object({ id: z.string().uuid(), removeStopId: z.string().uuid() }).strict(),
]);
const headers = { "Cache-Control": "private, no-store" };

export const GET = withStaff(async (request, _context, session) => {
  try { return Response.json({ ...await dispatchOverview(request.nextUrl.searchParams.get("view") === "pending"), canConfigure: can(session, "settings"), canSetCourierAvailability: canSetCourierAvailability(session.role), canReviewCourierPay: canReviewCourierPay(session.role) }, { headers }); }
  catch (error) { return dispatchFailure(error); }
});

export const POST = withStaff(async () => {
  try {
    const report = await generateDispatch();
    return Response.json(report, { headers, status: report?.error ? 503 : 200 });
  } catch (error) { return dispatchFailure(error); }
});

export const PUT = withStaff(async (request, _context, session) => {
  if (!can(session, "settings")) return Response.json({ error: "Você não tem permissão para alterar as regras." }, { status: 403 });
  const parsed = configInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Revise as regras." }, { status: 422 });
  try {
    await saveDispatchConfig(parsed.data.config, parsed.data.revision);
    return Response.json({ ok: true }, { headers });
  } catch (error) { return dispatchFailure(error); }
});

export const PATCH = withStaff(async request => {
  const parsed = routeAction.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Informe uma rota e um entregador ou parada válidos." }, { status: 422 });
  try {
    if ("removeStopId" in parsed.data) await removeDispatchStop(parsed.data.id, parsed.data.removeStopId);
    else await changeDispatchRoute(parsed.data.id, parsed.data.driverId);
    return Response.json({ ok: true }, { headers });
  } catch (error) { return dispatchFailure(error); }
});
