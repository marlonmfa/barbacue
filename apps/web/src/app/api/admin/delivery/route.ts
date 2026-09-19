import { NextResponse } from "next/server";
import { and, asc, eq, inArray, or, gte } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { orders, storeSettings } from "@/db/schema";
import { withStaff } from "@/lib/admin-auth";
import { addressNavigationLinks } from "@/lib/delivery-navigation";

export const GET = withStaff(async (_req, _ctx, session) => {
  // Assignment is always bound to the authenticated identity. There is no
  // driverId query parameter and no fallback to unassigned orders.
  const [rows, [settings]] = await Promise.all([
    db.select({ id: orders.id, brand: orders.brand, customerName: orders.customerName, customerPhone: orders.customerPhone, deliveryAddress: orders.deliveryAddress, deliveryFeeCents: orders.deliveryFeeCents, deliveryDistanceMeters: orders.deliveryDistanceMeters, deliveryDurationSeconds: orders.deliveryDurationSeconds, deliveryRoute: orders.deliveryRoute, totalCents: orders.totalCents, paymentMethod: orders.paymentMethod, paymentStatus: orders.paymentStatus, changeForCents: orders.changeForCents, items: orders.items, notes: orders.notes, status: orders.status, deliveryStatus: orders.deliveryStatus, createdAt: orders.createdAt, dispatchedAt: orders.dispatchedAt, deliveredAt: orders.deliveredAt })
      .from(orders).where(and(eq(orders.deliveryDriverId, session.userId), eq(orders.orderType, "delivery"), inArray(orders.status, ["pending", "confirmed", "preparing", "ready", "delivered"]), or(inArray(orders.deliveryStatus, ["assigned", "out_for_delivery"]), and(eq(orders.deliveryStatus, "delivered"), gte(orders.deliveredAt, new Date(Date.now() - 24 * 60 * 60_000))))))
      .orderBy(asc(orders.createdAt)).limit(100),
    db.select({ address: storeSettings.address }).from(storeSettings).where(eq(storeSettings.id, 1)),
  ]);
  return NextResponse.json(rows.map(({ items, deliveryRoute, ...row }) => ({
    ...row,
    itemCount: Array.isArray(items) ? items.reduce((sum, item: { qty?: number }) => sum + (item.qty ?? 0), 0) : 0,
    amountToCollectCents: row.paymentStatus === "paid" ? 0 : row.totalCents,
    navigationLinks: deliveryRoute ?? addressNavigationLinks(row.deliveryAddress, settings?.address ?? null),
  })), { headers: { "Cache-Control": "no-store" } });
});

const deliverySchema = z.object({ id: z.string().uuid(), deliveryStatus: z.enum(["out_for_delivery", "delivered"]) }).strict();
export const PATCH = withStaff(async (req, _ctx, session) => {
  const parsed = deliverySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Informe a próxima etapa da entrega." }, { status: 422 });
  const { id, deliveryStatus } = parsed.data;
  const now = new Date();
  const [updated] = await db.update(orders)
    .set(deliveryStatus === "out_for_delivery" ? { deliveryStatus, dispatchedAt: now } : { deliveryStatus, status: "delivered", deliveredAt: now })
    .where(and(eq(orders.id, id), eq(orders.deliveryDriverId, session.userId), eq(orders.orderType, "delivery"), eq(orders.status, "ready"), eq(orders.deliveryStatus, deliveryStatus === "out_for_delivery" ? "assigned" : "out_for_delivery")))
    .returning({ id: orders.id, status: orders.status, deliveryStatus: orders.deliveryStatus, dispatchedAt: orders.dispatchedAt, deliveredAt: orders.deliveredAt });
  // One response for stale, foreign and nonexistent orders avoids revealing
  // whether another driver's order id exists.
  if (!updated) return NextResponse.json({ error: "Esta entrega não está disponível para essa etapa. Atualize suas entregas." }, { status: 409 });
  return NextResponse.json(updated);
});
