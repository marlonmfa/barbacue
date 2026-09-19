import { NextResponse } from "next/server";
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { kitchenPrintJobs, orders, restaurantTables } from "@/db/schema";
import { withStaff } from "@/lib/admin-auth";
const projection = { id: orders.id, brand: orders.brand, items: orders.items, notes: orders.notes, status: orders.status, createdAt: orders.createdAt, orderType: orders.orderType, channel: orders.channel, customerName: orders.customerName };
function kitchenTicket(row: { id: string; brand: string; items: unknown; notes: string | null; status: string | null; createdAt: Date | null; orderType: string; channel: string | null; customerName: string; tableNumber?: number | null; ticket?: { tableNumber: number | null } | null; printStatus?: string | null }) {
  const items = Array.isArray(row.items) ? row.items.map((item: { name?: string; qty?: number; notes?: string | null }) => ({ name: item.name ?? "Item", qty: item.qty ?? 1, notes: item.notes ?? null })) : [];
  const { ticket, ...safe } = row;
  return { ...safe, customerName: row.orderType === "pickup" ? row.customerName : null, tableNumber: ticket?.tableNumber ?? row.tableNumber ?? null, items };
}
export const GET = withStaff(async () => {
  const rows = await db.select({ ...projection, tableNumber: restaurantTables.number, ticket: kitchenPrintJobs.ticket, printStatus: kitchenPrintJobs.status }).from(orders)
    .leftJoin(restaurantTables, eq(restaurantTables.id, orders.tableId)).leftJoin(kitchenPrintJobs, eq(kitchenPrintJobs.orderId, orders.id))
    .where(inArray(orders.status, ["confirmed", "preparing", "ready"])).orderBy(asc(orders.createdAt)).limit(100);
  return NextResponse.json(rows.map(kitchenTicket));
});
const schema = z.object({ id: z.string().uuid(), status: z.enum(["preparing", "ready"]) });
export const PATCH = withStaff(async req => {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Pedido ou etapa inválida." }, { status: 422 });
  const { id, status } = parsed.data;
  const [updated] = await db.update(orders).set({ status }).where(and(eq(orders.id, id), eq(orders.status, status === "preparing" ? "confirmed" : "preparing"))).returning(projection);
  if (!updated) return NextResponse.json({ error: "Este pedido mudou de etapa. Atualize a fila." }, { status: 409 });
  return NextResponse.json(kitchenTicket(updated));
});
