import { and, asc, eq, isNotNull, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { courierPayShifts, deliverySettings, dispatchRoutes, orders, staffUsers } from "@/db/schema";
import { courierPayRules, summarizeCourierPay, validCourierDistance } from "@/lib/courier-pay";
import { deliveryCoordinatesSchema, DeliveryError } from "@/lib/delivery";
import { getDeliveryProvider } from "@/lib/delivery-provider";
import type { AccessRole } from "@/lib/permissions";

export const canReviewCourierPay = (role: AccessRole) => role === "admin" || role === "manager";
const completed = and(eq(orders.orderType, "delivery"), eq(orders.status, "delivered"), eq(orders.deliveryStatus, "delivered"),
  isNotNull(orders.deliveryDriverId), isNotNull(orders.deliveredAt),
  or(ne(orders.channel, "test"), sql`${orders.channel} is null`));
const dispatchTime = sql<Date>`coalesce(${orders.dispatchedAt}, ${orders.deliveredAt})`;

export async function courierPayReport(day: string) {
  const from = sql`(${day}::date + make_time(${courierPayRules.dayStartHour}, 0, 0)) at time zone ${courierPayRules.timeZone}`;
  const to = sql`((${day}::date + 1) + make_time(${courierPayRules.dayStartHour}, 0, 0)) at time zone ${courierPayRules.timeZone}`;
  const [drivers, deliveries] = await db.transaction(async tx => {
    const drivers = await tx.select({ id: staffUsers.id, name: staffUsers.name, active: staffUsers.active,
      confirmed: courierPayShifts.confirmed })
      .from(staffUsers).leftJoin(courierPayShifts, and(eq(courierPayShifts.driverId, staffUsers.id), eq(courierPayShifts.day, day)))
      .where(or(eq(staffUsers.role, "driver"), isNotNull(courierPayShifts.confirmed))).orderBy(asc(staffUsers.name), asc(staffUsers.id));
    const deliveries = await tx.select({ id: orders.id, brand: orders.brand, driverId: orders.deliveryDriverId, driverName: staffUsers.name,
      deliveredAt: orders.deliveredAt, distance: orders.deliveryDistanceMeters, position: orders.dispatchPosition,
      plannedDistance: sql<number | null>`(${dispatchRoutes.plan}->'stops'->(${orders.dispatchPosition} - 1)->>'originDistanceMeters')::integer`,
      initialLeg: sql<number | null>`(${dispatchRoutes.plan}->'stops'->0->'leg'->>'distanceMeters')::integer`,
    }).from(orders).innerJoin(staffUsers, eq(orders.deliveryDriverId, staffUsers.id)).leftJoin(dispatchRoutes, eq(orders.dispatchRouteId, dispatchRoutes.id))
      .where(and(completed, sql`${dispatchTime} >= (${from}) and ${dispatchTime} < (${to})`))
      .orderBy(asc(orders.deliveredAt), asc(orders.id));
    return [drivers, deliveries] as const;
  }, { accessMode: "read only", isolationLevel: "repeatable read" });

  const byDriver = new Map<number, { id: string; brand: string; deliveredAt: string; distanceMeters: number | null }[]>();
  const included = new Set(drivers.map(driver => driver.id));
  for (const order of deliveries) {
    const driverId = order.driverId!;
    const list = byDriver.get(driverId) ?? [];
    const distanceMeters = [order.distance, order.plannedDistance, order.position === 1 ? order.initialLeg : null]
      .find(validCourierDistance) ?? null;
    list.push({ id: order.id, brand: order.brand, deliveredAt: order.deliveredAt!.toISOString(), distanceMeters });
    byDriver.set(driverId, list);
    if (!included.has(driverId)) {
      drivers.push({ id: driverId, name: order.driverName, active: false, confirmed: null });
      included.add(driverId);
    }
  }
  const rows = drivers.filter(driver => driver.active || driver.confirmed || byDriver.has(driver.id)).map(driver => ({
    id: driver.id, name: driver.name, confirmed: Boolean(driver.confirmed),
    ...summarizeCourierPay(byDriver.get(driver.id) ?? [], Boolean(driver.confirmed)),
  }));
  return { day, drivers: rows,
    totalCents: rows.reduce((total, row) => total + row.totalCents, 0),
    pendingDistances: rows.reduce((total, row) => total + row.pendingDistances, 0) };
}

export async function confirmCourierShift(day: string, driverId: number, confirmed: boolean, recordedBy: number) {
  return db.transaction(async tx => {
    const [driver] = await tx.select({ id: staffUsers.id }).from(staffUsers)
      .where(and(eq(staffUsers.id, driverId), eq(staffUsers.role, "driver"))).for("share");
    if (!driver) return false;
    const values = { day, driverId, confirmed, recordedBy, updatedAt: new Date() };
    await tx.insert(courierPayShifts).values(values).onConflictDoUpdate({
      target: [courierPayShifts.day, courierPayShifts.driverId], set: { confirmed, recordedBy, updatedAt: values.updatedAt },
    });
    return true;
  });
}

export async function measureCourierDistance(orderId: string) {
  const [order] = await db.select({
    distance: orders.deliveryDistanceMeters, address: orders.deliveryAddress, driverId: orders.deliveryDriverId,
    routeId: orders.dispatchRouteId, originKey: dispatchRoutes.originKey,
  }).from(orders).leftJoin(dispatchRoutes, eq(orders.dispatchRouteId, dispatchRoutes.id))
    .where(and(eq(orders.id, orderId), completed));
  if (!order?.address) throw new DeliveryError("Entrega concluída com endereço não encontrada.", "delivery_address_not_found", 404);
  if (validCourierDistance(order.distance)) return order.distance;
  const [settings] = await db.select().from(deliverySettings).where(eq(deliverySettings.id, 1));
  let stored: unknown;
  try { stored = order.originKey ? JSON.parse(order.originKey) : null; }
  catch { throw new DeliveryError("A rota não tem uma origem válida para recálculo.", "delivery_not_configured", 422); }
  if (order.originKey && (!Array.isArray(stored) || stored[0] !== "osm")) {
    throw new DeliveryError("A rota não tem uma origem válida para recálculo.", "delivery_not_configured", 422);
  }
  const origin = deliveryCoordinatesSchema.safeParse(Array.isArray(stored)
    ? { latitude: stored[1], longitude: stored[2] }
    : { latitude: settings?.originLatitude, longitude: settings?.originLongitude });
  if (!origin.success || (!order.originKey && !settings)) throw new DeliveryError("Configure o endereço de saída antes de medir.", "delivery_not_configured", 422);
  const provider = getDeliveryProvider(order.originKey ? "osm" : settings!.provider);
  const destination = await provider.geocode(order.address, { allowRegionalMatch: true });
  const measurement = await provider.route(origin.data, destination);
  if (!validCourierDistance(measurement.distanceMeters)) throw new DeliveryError("O serviço de mapas não devolveu uma distância válida.", "delivery_route_not_found", 422);
  return db.transaction(async tx => {
    if (!order.originKey) {
      const [current] = await tx.select().from(deliverySettings).where(eq(deliverySettings.id, 1)).for("share");
      if (!current || current.originLatitude !== settings?.originLatitude || current.originLongitude !== settings.originLongitude || current.provider !== settings.provider) {
        throw new DeliveryError("A origem mudou. Meça novamente.", "delivery_not_configured", 409);
      }
    }
    const [locked] = await tx.select({ distance: orders.deliveryDistanceMeters }).from(orders).where(and(eq(orders.id, orderId),
      completed, eq(orders.deliveryAddress, order.address!), eq(orders.deliveryDriverId, order.driverId!),
      sql`${orders.dispatchRouteId} is not distinct from ${order.routeId}::uuid`)).for("update");
    if (!locked) throw new DeliveryError("A entrega mudou. Atualize a apuração.", "delivery_address_not_found", 409);
    if (validCourierDistance(locked.distance)) return locked.distance;
    await tx.update(orders).set({ deliveryDistanceMeters: measurement.distanceMeters }).where(eq(orders.id, orderId));
    return measurement.distanceMeters;
  });
}
