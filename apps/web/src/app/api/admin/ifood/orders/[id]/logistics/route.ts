import { NextRequest, NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { orders } from "@/db/schema";
import { withStaff } from "@/lib/admin-auth";
import { assertLive, call, IfoodApiError, ifoodSettings } from "@/lib/ifood-api";
import { ifoodExternalId, ifoodStoreFromNotes } from "@/lib/ifood";
import { ifoodFailure } from "@/lib/ifood-route";
import { logisticsAction, nextLogisticsAction, type LogisticsEvent, type LogisticsState } from "@/lib/ifood-logistics";

type Params = { params: Promise<{ id: string }> };
type RemoteOrder = { id?: string; displayId?: string; merchant?: { id?: string }; delivery?: { deliveredBy?: string } };
const headers = { "Cache-Control": "private, no-store" };
const response = (error: string, status: number) => NextResponse.json({ error }, { status, headers });

async function delivery({ params }: Params) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) throw new IfoodApiError("Pedido inválido.", 404);
  const [order] = await db.select({ id: orders.id, status: orders.status, brand: orders.brand, notes: orders.notes })
    .from(orders).where(and(eq(orders.id, id), eq(orders.channel, "ifood"), eq(orders.orderType, "delivery")));
  if (!order) throw new IfoodApiError("Pedido iFood de entrega não encontrado.", 404);

  const settings = ifoodSettings("logistics");
  if (!settings.configured) throw new IfoodApiError("Credencial dedicada do Logistics indisponível no servidor.", 503);
  const orderId = ifoodExternalId(order.id, order.notes);
  const store = ifoodStoreFromNotes(order.notes, settings.stores) ?? settings.stores.find(store => store.brand === order.brand);
  if (!orderId || !store || store.brand !== order.brand) throw new IfoodApiError("Pedido sem referência iFood válida para a loja.", 422);

  const path = `/logistics/v1.0/orders/${encodeURIComponent(orderId)}`;
  const remote = await call<RemoteOrder>(path, { requireResource: true, preserveClientStatus: true });
  if (remote?.id !== orderId || remote.merchant?.id !== store.id) throw new IfoodApiError("A referência do pedido ou da loja diverge no iFood.", 409);
  const result = await db.execute<{code: string; full_code: string | null; at: Date | string}>(sql`
    SELECT code, full_code, created_at AS at FROM ifood_order_events
    WHERE order_external_id = ${orderId} AND merchant_id = ${store.id}
    ORDER BY created_at DESC, id DESC LIMIT 100
  `);
  const events: LogisticsEvent[] = result.rows.map(row => ({ code: row.code, fullCode: row.full_code, createdAt: new Date(row.at).toISOString() }));
  const deliveredBy = remote.delivery?.deliveredBy ?? null;
  const active = ["confirmed", "preparing", "ready"].includes(order.status ?? "");
  const state: LogisticsState = {
    displayId: remote.displayId ?? null, deliveredBy, events,
    next: active && deliveredBy === "MERCHANT" ? nextLogisticsAction(events) : null,
  };
  return { path, state };
}

export const GET = withStaff(async (_req: NextRequest, params: Params) => {
  try { return NextResponse.json((await delivery(params)).state, { headers }); }
  catch (error) { return ifoodFailure(error); }
});

export const POST = withStaff(async (req: NextRequest, params: Params) => {
  const parsed = logisticsAction.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return response("Dados da etapa de entrega inválidos.", 422);
  try {
    assertLive();
    const { path, state } = await delivery(params);
    const { action, ...body } = parsed.data;
    if (state.next !== action) return response("Esta ação não corresponde à próxima etapa da entrega. Atualize o pedido.", 409);
    await call(`${path}/${action}`, {
      method: "POST", requireResource: true, preserveClientStatus: true,
      body: Object.keys(body).length ? body : undefined,
    });
    return NextResponse.json({ accepted: true }, { status: 202, headers });
  } catch (error) { return ifoodFailure(error); }
});
