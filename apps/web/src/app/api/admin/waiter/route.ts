import { NextResponse } from "next/server";
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { orders, restaurantTables } from "@/db/schema";
import { withStaff } from "@/lib/admin-auth";

export const GET = withStaff(async () => {
  const [tables, rows] = await Promise.all([
    db.select({ id: restaurantTables.id, number: restaurantTables.number, label: restaurantTables.label, token: restaurantTables.token })
      .from(restaurantTables).where(eq(restaurantTables.active, true)).orderBy(asc(restaurantTables.number)),
    db.select({ id: orders.id, brand: orders.brand, tableId: orders.tableId, tableNumber: restaurantTables.number, items: orders.items, notes: orders.notes, status: orders.status, createdAt: orders.createdAt })
      .from(orders).leftJoin(restaurantTables, eq(orders.tableId, restaurantTables.id))
      .where(and(eq(orders.orderType, "dine_in"), inArray(orders.status, ["pending", "confirmed", "preparing", "ready"])))
      .orderBy(asc(orders.createdAt)).limit(200),
  ]);
  return NextResponse.json({ tables, orders: rows.map(row => ({ ...row, items: Array.isArray(row.items) ? row.items.map((item: { name?: string; qty?: number; notes?: string | null }) => ({ name: item.name ?? "Item", qty: item.qty ?? 1, notes: item.notes ?? null })) : [] })) }, { headers: { "Cache-Control": "no-store" } });
});

const serveSchema = z.object({ id: z.string().uuid(), status: z.literal("delivered") }).strict();
export const PATCH = withStaff(async req => {
  const parsed = serveSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Informe o pedido pronto para servir." }, { status: 422 });
  // Compare-and-set protects against stale screens and prevents floor access
  // from completing delivery/pickup orders or bypassing preparation.
  const [updated] = await db.update(orders).set({ status: "delivered", deliveredAt: new Date() })
    .where(and(eq(orders.id, parsed.data.id), eq(orders.orderType, "dine_in"), eq(orders.status, "ready")))
    .returning({ id: orders.id, status: orders.status });
  if (!updated) return NextResponse.json({ error: "Este pedido não está pronto para servir ou já mudou de etapa. Atualize o salão." }, { status: 409 });
  return NextResponse.json(updated);
});
