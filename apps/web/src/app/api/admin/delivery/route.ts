import { NextResponse } from "next/server";
import { and, asc, eq, inArray, or, gte, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { dispatchRoutes, orders, storeSettings } from "@/db/schema";
import { withStaff } from "@/lib/admin-auth";
import { confirmDispatchReturn, dispatchFailure, returningDispatchRoute } from "@/lib/dispatch-service";
import { routeConfirmationHash } from "@/lib/dispatch-confirmation";
import { completeDispatchStop } from "@/lib/dispatch-stop-completion";
import { sendDispatchWhatsapp } from "@/lib/dispatch-whatsapp";
import { addressNavigationLinks, dispatchNavigationDestination } from "@/lib/delivery-navigation";

export const GET = withStaff(async (req, _ctx, session) => {
  if (req.nextUrl.searchParams.get("view") === "returning") {
    return NextResponse.json({ routeId: await returningDispatchRoute(session.userId) }, { headers: { "Cache-Control": "no-store" } });
  }
  const confirmation = req.nextUrl.searchParams.get("confirma");
  let routeId = req.nextUrl.searchParams.get("rota");
  if (confirmation !== null) {
    if (!/^[a-f0-9]{64}$/.test(confirmation)) return NextResponse.json({ error: "Link de rota inválido." }, { status: 422 });
    const [route] = await db.select({ id: dispatchRoutes.id }).from(dispatchRoutes).where(and(
      eq(dispatchRoutes.confirmationHash, routeConfirmationHash(confirmation)), eq(dispatchRoutes.driverId, session.userId),
      isNull(dispatchRoutes.releasedAt), isNull(dispatchRoutes.returnedAt)));
    if (!route) return NextResponse.json({ error: "Rota indisponível para esta conta." }, { status: 404 });
    routeId = route.id;
  }
  const route = z.string().uuid().nullable().safeParse(routeId);
  if (!route.success) return NextResponse.json({ error: "Link de rota inválido." }, { status: 422 });
  // Assignment is always bound to the authenticated identity. There is no
  // driverId query parameter and no fallback to unassigned orders.
  const [rows, [settings]] = await Promise.all([
    db.select({ id: orders.id, brand: orders.brand, customerName: orders.customerName, customerPhone: orders.customerPhone, deliveryAddress: orders.deliveryAddress, deliveryFeeCents: orders.deliveryFeeCents, deliveryDistanceMeters: orders.deliveryDistanceMeters, deliveryDurationSeconds: orders.deliveryDurationSeconds, deliveryRoute: orders.deliveryRoute, dispatchRouteId: orders.dispatchRouteId, dispatchPosition: orders.dispatchPosition, requiresConfirmationCode: sql<boolean>`${orders.deliveryConfirmationHash} is not null`, dispatchPoint: sql<{ latitude: number; longitude: number } | null>`(${dispatchRoutes.plan}->'stops'->(${orders.dispatchPosition} - 1)->'point')`, totalCents: orders.totalCents, paymentMethod: orders.paymentMethod, paymentStatus: orders.paymentStatus, changeForCents: orders.changeForCents, items: orders.items, notes: orders.notes, status: orders.status, deliveryStatus: orders.deliveryStatus, createdAt: orders.createdAt, dispatchedAt: orders.dispatchedAt, deliveredAt: orders.deliveredAt })
      .from(orders).leftJoin(dispatchRoutes, eq(orders.dispatchRouteId, dispatchRoutes.id)).where(and(eq(orders.deliveryDriverId, session.userId), route.data ? eq(orders.dispatchRouteId, route.data) : undefined, eq(orders.orderType, "delivery"), inArray(orders.status, ["pending", "confirmed", "preparing", "ready", "delivered"]), or(inArray(orders.deliveryStatus, ["assigned", "out_for_delivery"]), and(eq(orders.deliveryStatus, "delivered"), gte(orders.deliveredAt, new Date(Date.now() - 24 * 60 * 60_000))))))
      .orderBy(asc(eq(orders.deliveryStatus, "delivered")), asc(sql`case when ${orders.dispatchRouteId} is not null then ${orders.dispatchedAt} else ${orders.createdAt} end`), asc(orders.dispatchRouteId), asc(orders.dispatchPosition), asc(orders.createdAt)).limit(100),
    db.select({ address: storeSettings.address }).from(storeSettings).where(eq(storeSettings.id, 1)),
  ]);
  return NextResponse.json(rows.map(({ items, deliveryRoute, dispatchPoint, ...row }) => ({
    ...row,
    itemCount: Array.isArray(items) ? items.reduce((sum, item: { qty?: number }) => sum + (item.qty ?? 0), 0) : 0,
    amountToCollectCents: row.paymentStatus === "paid" ? 0 : row.totalCents,
    navigationLinks: row.dispatchRouteId ? addressNavigationLinks(dispatchNavigationDestination(dispatchPoint, row.deliveryAddress), null) : deliveryRoute ?? addressNavigationLinks(row.deliveryAddress, settings?.address ?? null),
  })), { headers: { "Cache-Control": "no-store", ...(routeId ? { "X-Dispatch-Route": routeId } : {}) } });
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
  const result = await db.transaction(async tx => {
    const [order] = await tx.select({
      id: orders.id, dispatchRouteId: orders.dispatchRouteId, confirmationHash: orders.deliveryConfirmationHash,
    }).from(orders).where(and(eq(orders.id, id), eq(orders.deliveryDriverId, session.userId),
      eq(orders.orderType, "delivery"), eq(orders.status, "ready"), isNull(orders.archivedAt),
      eq(orders.deliveryStatus, deliveryStatus === "out_for_delivery" ? "assigned" : "out_for_delivery"))).for("update");
    if (!order) return null;
    if (deliveryStatus === "delivered") {
      if (order.confirmationHash) return { whatsappRequired: true as const };
      return { updated: await completeDispatchStop(tx, order, now), completedRoute: order.dispatchRouteId };
    }
    const [updated] = await tx.update(orders).set({ deliveryStatus, dispatchedAt: now }).where(eq(orders.id, id))
      .returning({ id: orders.id, status: orders.status, deliveryStatus: orders.deliveryStatus, dispatchedAt: orders.dispatchedAt, deliveredAt: orders.deliveredAt });
    return { updated, completedRoute: null };
  });
  if (!result) return NextResponse.json({ error: "Esta entrega não está disponível para essa etapa. Atualize suas entregas." }, { status: 409 });
  if ("whatsappRequired" in result) return NextResponse.json({ error: "Confirme este pedido com o código pelo WhatsApp." }, { status: 409 });
  if (result.completedRoute) await sendDispatchWhatsapp(result.completedRoute, id);
  return NextResponse.json(result.updated);
});
