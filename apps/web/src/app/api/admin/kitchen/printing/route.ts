import { z } from "zod";
import { withStaff } from "@/lib/admin-auth";
import { kitchenPrintingOverview, retryKitchenPrintJob } from "@/lib/kitchen-print-queue";

export const runtime = "nodejs";
export const GET = withStaff(async () => Response.json(await kitchenPrintingOverview(), { headers: { "Cache-Control": "no-store" } }));
const retrySchema = z.object({ jobId: z.string().uuid(), acknowledgePossibleDuplicate: z.literal(true) });
export const POST = withStaff(async request => {
  const parsed = retrySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Confirme que conferiu a impressora: reenviar pode duplicar o papel." }, { status: 422 });
  const ok = await retryKitchenPrintJob(parsed.data.jobId);
  return Response.json(ok ? { ok: true } : { error: "Somente falhas pendentes de revisão podem ser reenviadas. Atualize a fila." }, { status: ok ? 200 : 409 });
});
