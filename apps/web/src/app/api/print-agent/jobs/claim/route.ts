import { authorizePrintAgent } from "@/lib/kitchen-print-auth";
import { claimKitchenPrintJob } from "@/lib/kitchen-print-queue";

export const runtime = "nodejs";
export async function POST(request: Request) {
  const denied = authorizePrintAgent(request);
  if (denied) return denied;
  return Response.json({ job: await claimKitchenPrintJob() }, { headers: { "Cache-Control": "no-store" } });
}
