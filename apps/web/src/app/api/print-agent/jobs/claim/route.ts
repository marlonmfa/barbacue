import { authorizePrintAgent } from "@/lib/kitchen-print-auth";
import { claimKitchenPrintJob } from "@/lib/kitchen-print-queue";
import { z } from "zod";

export const runtime = "nodejs";
export async function POST(request: Request) {
  const denied = authorizePrintAgent(request);
  if (denied) return denied;
  const parsed = z.object({ deviceId: z.string().uuid().optional(), acceptDefault: z.boolean().default(true) }).safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: "Computador de impressão inválido." }, { status: 422 });
  return Response.json({ job: await claimKitchenPrintJob(parsed.data.deviceId, parsed.data.acceptDefault) }, { headers: { "Cache-Control": "no-store" } });
}
