import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { ifoodOrderEvents } from "@/db/schema";
import { withStaff } from "@/lib/admin-auth";
import { assertLive, call } from "@/lib/ifood-api";
import { buildDisputes, disputeRequest } from "@/lib/ifood-disputes";
import { ifoodFailure } from "@/lib/ifood-route";

type Params = { params: Promise<{ disputeId: string }> };
const Body = z.object({
  kind: z.enum(["accept", "reject", "alternative"]),
  reason: z.string().trim().max(250).optional(),
  alternativeId: z.string().trim().max(80).optional(),
  amountCents: z.number().int().positive().max(1_000_000).optional(),
  minutes: z.number().int().positive().max(240).optional(),
  timeReason: z.string().trim().max(80).optional(),
}).strict();

// Responde uma disputa do iFood: aceitar, recusar (com motivo) ou propor alternativa oferecida.
export const POST = withStaff(async (req: NextRequest, { params }: Params) => {
  const { disputeId } = await params;
  if (!/^[\w-]{1,80}$/.test(disputeId)) return NextResponse.json({ error: "Disputa inválida." }, { status: 422 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Resposta inválida." }, { status: 422 });
  const rows = await db.select().from(ifoodOrderEvents).where(eq(ifoodOrderEvents.disputeId, disputeId));
  const dispute = buildDisputes(rows).find(d => d.disputeId === disputeId);
  if (!dispute) return NextResponse.json({ error: "Disputa não encontrada." }, { status: 404 });
  if (dispute.status !== "open") return NextResponse.json({ error: "Esta disputa já foi respondida, resolvida ou expirou." }, { status: 409 });
  try {
    const request = disputeRequest(dispute, parsed.data);
    assertLive();
    await call(request.path, { method: "POST", body: request.body });
    await db.insert(ifoodOrderEvents).values({
      id: `local:${disputeId}`, orderExternalId: dispute.orderExternalId, merchantId: dispute.merchantId, brand: dispute.brand,
      code: "LOCAL_DISPUTE", disputeId, payload: { action: parsed.data.kind, request: request.body },
    }).onConflictDoNothing();
    return NextResponse.json({ ok: true });
  } catch (error) { return ifoodFailure(error); }
});
