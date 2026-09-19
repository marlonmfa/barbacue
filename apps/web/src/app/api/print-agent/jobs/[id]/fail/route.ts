import { z } from "zod";
import { authorizePrintAgent } from "@/lib/kitchen-print-auth";
import { failKitchenPrintJob } from "@/lib/kitchen-print-queue";

export const runtime = "nodejs";
const schema = z.object({ leaseToken: z.string().uuid(), error: z.string().trim().min(1).max(500), uncertain: z.boolean().default(true) });
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = authorizePrintAgent(request);
  if (denied) return denied;
  const { id } = await context.params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!z.string().uuid().safeParse(id).success || !parsed.success) return Response.json({ error: "invalid_job" }, { status: 422 });
  const ok = await failKitchenPrintJob(id, parsed.data.leaseToken, parsed.data.error, parsed.data.uncertain);
  return Response.json(ok ? { ok: true } : { error: "lease_conflict" }, { status: ok ? 200 : 409 });
}
