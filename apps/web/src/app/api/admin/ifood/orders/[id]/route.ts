import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { orders } from "@/db/schema";
import { withStaff } from "@/lib/admin-auth";
import { IFOOD_ACTIONS, allowedIfoodActions, ifoodExternalId } from "@/lib/ifood";
import { IfoodApiError, cancellationReasons, getIfoodOrder, runIfoodAction } from "@/lib/ifood-api";

type Params = { params: Promise<{ id: string }> };

async function findOrder(id: string) {
  if (!z.string().uuid().safeParse(id).success) return null;
  const [order] = await db.select({ id: orders.id, status: orders.status, orderType: orders.orderType, notes: orders.notes })
    .from(orders).where(and(eq(orders.id, id), eq(orders.channel, "ifood")));
  if (!order) return null;
  const externalId = ifoodExternalId(order.id, order.notes);
  return externalId ? { ...order, externalId } : null;
}

function failure(error: unknown) {
  if (error instanceof IfoodApiError) return NextResponse.json({ error: error.message }, { status: error.status });
  throw error;
}

// Detalhes atuais no iFood e, com ?reasons=1, os motivos de cancelamento aceitos.
export const GET = withStaff(async (req: NextRequest, { params }: Params) => {
  const order = await findOrder((await params).id);
  if (!order) return NextResponse.json({ error: "Pedido iFood não encontrado." }, { status: 404 });
  try {
    if (req.nextUrl.searchParams.get("reasons") === "1") return NextResponse.json({ reasons: await cancellationReasons(order.externalId) });
    return NextResponse.json({ order: await getIfoodOrder(order.externalId) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
});

const ActionSchema = z.object({
  action: z.enum(IFOOD_ACTIONS),
  cancellationCode: z.string().trim().min(1).max(20).optional(),
  reason: z.string().trim().min(1).max(250).optional(),
}).strict();

// A ação vai ao iFood; a etapa local muda quando o monitor recebe o evento correspondente.
export const POST = withStaff(async (req: NextRequest, { params }: Params) => {
  const order = await findOrder((await params).id);
  if (!order) return NextResponse.json({ error: "Pedido iFood não encontrado." }, { status: 404 });
  const parsed = ActionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ação inválida." }, { status: 422 });
  const { action, cancellationCode, reason } = parsed.data;
  if (!allowedIfoodActions(order.status, order.orderType).includes(action)) {
    return NextResponse.json({ error: "Esta ação não vale para a etapa atual do pedido. Atualize a tela." }, { status: 409 });
  }
  try {
    await runIfoodAction(order.externalId, action, action === "cancel" ? (cancellationCode && reason ? { cancellationCode, reason } : undefined) : undefined);
    return NextResponse.json({ ok: true });
  } catch (error) { return failure(error); }
});
