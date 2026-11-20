import { after, NextResponse } from "next/server";
import { and, asc, eq, inArray, or, ne, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { kitchenPrintJobs, orders, restaurantTables } from "@/db/schema";
import { ifoodExternalId } from "@/lib/ifood";
import { runIfoodAction } from "@/lib/ifood-api";
import { ifoodFailure } from "@/lib/ifood-route";
import { withStaff } from "@/lib/admin-auth";
import { generateDispatchOnReady } from "@/lib/dispatch-service";
const projection = { id: orders.id, brand: orders.brand, items: orders.items, notes: orders.notes, status: orders.status, createdAt: orders.createdAt, orderType: orders.orderType, channel: orders.channel, customerName: orders.customerName };
function kitchenTicket(row: { id: string; brand: string; items: unknown; notes: string | null; status: string | null; createdAt: Date | null; orderType: string; channel: string | null; customerName: string; tableNumber?: number | null; ticket?: { tableNumber: number | null } | null; printStatus?: string | null }) {
  const items = Array.isArray(row.items) ? row.items.map((item: { name?: string; qty?: number; notes?: string | null }) => ({ name: item.name ?? "Item", qty: item.qty ?? 1, notes: item.notes ?? null })) : [];
  const { ticket, ...safe } = row;
  return { ...safe, customerName: row.orderType === "pickup" ? row.customerName : null, tableNumber: ticket?.tableNumber ?? row.tableNumber ?? null, items };
}
export const GET = withStaff(async () => {
  const rows = await db.select({ ...projection, tableNumber: restaurantTables.number, ticket: kitchenPrintJobs.ticket, printStatus: kitchenPrintJobs.status }).from(orders)
    .leftJoin(restaurantTables, eq(restaurantTables.id, orders.tableId)).leftJoin(kitchenPrintJobs, eq(kitchenPrintJobs.orderId, orders.id))
    .where(and(inArray(orders.status, ["confirmed", "preparing", "ready"]), or(isNull(orders.channel), ne(orders.channel, "online"), eq(orders.paymentStatus, "paid")))).orderBy(asc(orders.createdAt)).limit(100);
  return NextResponse.json(rows.map(kitchenTicket));
});
const schema = z.object({ id: z.string().uuid(), status: z.enum(["preparing", "ready"]) });
export const PATCH = withStaff(async req => {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Pedido ou etapa inválida." }, { status: 422 });
  const { id, status } = parsed.data;
  const previous = status === "preparing" ? "confirmed" : "preparing";
  const ticket = and(eq(orders.id, id), isNull(orders.archivedAt));
  const externalStages = status === "preparing" ? ["confirmed"] as const : ["confirmed", "preparing"] as const;
  const [external] = await db.select({ notes: orders.notes }).from(orders)
    .where(and(ticket, inArray(orders.status, externalStages), eq(orders.channel, "ifood")));
  if (external) {
    const externalId = ifoodExternalId(id, external.notes);
    if (!externalId) return NextResponse.json({ error: "Pedido sem referência válida do iFood." }, { status: 422 });
    try {
      await runIfoodAction(externalId, status === "preparing" ? "startPreparation" : "readyToPickup");
      return NextResponse.json({ accepted: true }, { status: 202 });
    } catch (error) { return ifoodFailure(error); }
  }
  const [updated] = await db.update(orders).set({ status }).where(and(ticket, eq(orders.status, previous),
    or(isNull(orders.channel), ne(orders.channel, "ifood")),
    or(isNull(orders.channel), ne(orders.channel, "online"), eq(orders.paymentStatus, "paid")))).returning(projection);
  if (!updated) return NextResponse.json({ error: "Este pedido mudou de etapa. Atualize a fila." }, { status: 409 });
  if (status === "ready" && updated.orderType === "delivery" && updated.channel !== "test") after(generateDispatchOnReady);
  return NextResponse.json(kitchenTicket(updated));
});
