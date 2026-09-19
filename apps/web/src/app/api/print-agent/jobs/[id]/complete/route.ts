import { z } from "zod";
import { authorizePrintAgent } from "@/lib/kitchen-print-auth";
import { completeKitchenPrintJob } from "@/lib/kitchen-print-queue";

export const runtime = "nodejs";
const schema = z.object({ leaseToken: z.string().uuid() });
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = authorizePrintAgent(request);
  if (denied) return denied;
  const { id } = await context.params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!z.string().uuid().safeParse(id).success || !parsed.success) return Response.json({ error: "invalid_job" }, { status: 422 });
  const ok = await completeKitchenPrintJob(id, parsed.data.leaseToken);
  return Response.json(ok ? { ok: true, status: "printed" } : { error: "lease_conflict", message: "Confirmação expirada ou pedido alterado. Confira a fila na cozinha." }, { status: ok ? 200 : 409 });
}
