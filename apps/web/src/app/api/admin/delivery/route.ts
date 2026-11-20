import { NextResponse } from "next/server";
import { and, asc, eq, inArray, or, gte, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { dispatchRoutes, orders, storeSettings } from "@/db/schema";
import { withStaff } from "@/lib/admin-auth";
import { confirmDispatchReturn, dispatchFailure, returningDispatchRoute } from "@/lib/dispatch-service";
import { addressNavigationLinks, dispatchNavigationDestination } from "@/lib/delivery-navigation";

export const GET = withStaff(async (req, _ctx, session) => {
  if (req.nextUrl.searchParams.get("view") === "returning") {
    return NextResponse.json({ routeId: await returningDispatchRoute(session.userId) }, { headers: { "Cache-Control": "no-store" } });
  }
  // Assignment is always bound to the authenticated identity. There is no
  // driverId query parameter and no fallback to unassigned orders.
  const [rows, [settings]] = await Promise.all([
    db.select({ id: orders.id, brand: orders.brand, customerName: orders.customerName, customerPhone: orders.customerPhone, deliveryAddress: orders.deliveryAddress, deliveryFeeCents: orders.deliveryFeeCents, deliveryDistanceMeters: orders.deliveryDistanceMeters, deliveryDurationSeconds: orders.deliveryDurationSeconds, deliveryRoute: orders.deliveryRoute, dispatchRouteId: orders.dispatchRouteId, dispatchPosition: orders.dispatchPosition, dispatchPoint: sql<{ latitude: number; longitude: number } | null>`(${dispatchRoutes.plan}->'stops'->(${orders.dispatchPosition} - 1)->'point')`, totalCents: orders.totalCents, paymentMethod: orders.paymentMethod, paymentStatus: orders.paymentStatus, changeForCents: orders.changeForCents, items: orders.items, notes: orders.notes, status: orders.status, deliveryStatus: orders.deliveryStatus, createdAt: orders.createdAt, dispatchedAt: orders.dispatchedAt, deliveredAt: orders.deliveredAt })
      .from(orders).leftJoin(dispatchRoutes, eq(orders.dispatchRouteId, dispatchRoutes.id)).where(and(eq(orders.deliveryDriverId, session.userId), eq(orders.orderType, "delivery"), inArray(orders.status, ["pending", "confirmed", "preparing", "ready", "delivered"]), or(inArray(orders.deliveryStatus, ["assigned", "out_for_delivery"]), and(eq(orders.deliveryStatus, "delivered"), gte(orders.deliveredAt, new Date(Date.now() - 24 * 60 * 60_000))))))
      .orderBy(asc(eq(orders.deliveryStatus, "delivered")), asc(sql`case when ${orders.dispatchRouteId} is not null then ${orders.dispatchedAt} else ${orders.createdAt} end`), asc(orders.dispatchRouteId), asc(orders.dispatchPosition), asc(orders.createdAt)).limit(100),
    db.select({ address: storeSettings.address }).from(storeSettings).where(eq(storeSettings.id, 1)),
  ]);
  return NextResponse.json(rows.map(({ items, deliveryRoute, dispatchPoint, ...row }) => ({
    ...row,
    itemCount: Array.isArray(items) ? items.reduce((sum, item: { qty?: number }) => sum + (item.qty ?? 0), 0) : 0,
    amountToCollectCents: row.paymentStatus === "paid" ? 0 : row.totalCents,
    navigationLinks: row.dispatchRouteId ? addressNavigationLinks(dispatchNavigationDestination(dispatchPoint, row.deliveryAddress), null) : deliveryRoute ?? addressNavigationLinks(row.deliveryAddress, settings?.address ?? null),
  })), { headers: { "Cache-Control": "no-store" } });
});

const deliverySchema = z.union([
  z.object({ id: z.string().uuid(), deliveryStatus: z.enum(["out_for_delivery", "delivered"]) }).strict(),
  z.object({ returnRouteId: z.string().uuid() }).strict(),
]);
export const PATCH = withStaff(async (req, _ctx, session) => {
  const parsed = deliverySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Informe a próxima etapa da entrega." }, { status: 422 });
  if ("returnRouteId" in parsed.data) {
    try {
      await confirmDispatchReturn(parsed.data.returnRouteId, session.userId);
      return NextResponse.json({ ok: true });
    } catch (error) { return dispatchFailure(error); }
  }
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
