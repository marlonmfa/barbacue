import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { dispatchRoutes, orders } from "@/db/schema";
import { deliveryCoordinatesSchema } from "@/lib/delivery";
import { getDeliveryProvider } from "@/lib/delivery-provider";
import { dispatchGpsIntervalMs, type DispatchGpsEstimate } from "@/lib/dispatch-gps";

const sessionInput = { routeId: z.string().uuid(), sessionId: z.string().uuid() };
export const dispatchGpsInput = z.discriminatedUnion("action", [
  z.object({ ...sessionInput, action: z.literal("start") }).strict(),
  z.object({ ...sessionInput, action: z.literal("stop") }).strict(),
  z.object({
    ...sessionInput, action: z.literal("position"), point: deliveryCoordinatesSchema,
    accuracy: z.number().positive().max(100), capturedAt: z.number().int().positive(),
  }).strict(),
]);

function ownedOpenRoute(driverId: number) {
  return and(eq(dispatchRoutes.driverId, driverId), isNotNull(dispatchRoutes.startedAt),
    isNull(dispatchRoutes.returnedAt), isNull(dispatchRoutes.releasedAt))!;
}

export async function dispatchGpsRoute(driverId: number) {
  const [route] = await db.select({ id: dispatchRoutes.id }).from(dispatchRoutes).where(ownedOpenRoute(driverId)).limit(1);
  return route?.id ?? null;
}

export async function updateDispatchGps(driverId: number, input: z.infer<typeof dispatchGpsInput>) {
  const owned = and(ownedOpenRoute(driverId), eq(dispatchRoutes.id, input.routeId));
  const session = sql`${dispatchRoutes.gps}->>'sessionId' = ${input.sessionId}`;
  if (input.action !== "position") {
    const started = input.action === "start";
    const [updated] = await db.update(dispatchRoutes).set({ gps: started ? { sessionId: input.sessionId } : null })
      .where(started ? owned : and(owned, session)).returning({ id: dispatchRoutes.id });
    return !started || updated ? "ok" : "closed";
  }

  const now = Date.now();
  if (input.capturedAt < now - 30_000 || input.capturedAt > now + 10_000) return "stale";
  const [route] = await db.select().from(dispatchRoutes).where(and(owned, session));
  if (!route) return "closed";
  if (route.gps?.estimate && route.gps.estimate.at + dispatchGpsIntervalMs - 1000 > now) return "ok";

  const [, latitude, longitude] = JSON.parse(route.originKey) as [string, number, number];
  const origin = deliveryCoordinatesSchema.parse({ latitude, longitude });
  const pending = await db.select({ id: orders.id }).from(orders).where(and(
    eq(orders.dispatchRouteId, input.routeId),
    sql`${orders.status} is distinct from 'cancelled' and ${orders.status} is distinct from 'delivered' and ${orders.deliveryStatus} is distinct from 'delivered'`,
  ));
  const pendingIds = new Set(pending.map(order => order.id));
  const stops = route.plan.stops.filter(stop => pendingIds.has(stop.id));
  const points = [input.point, ...stops.map(stop => stop.point), origin];
  const matrix = await getDeliveryProvider("osm").matrix(points);
  const next = matrix[0][1];
  if (!next) return "unreachable";
  const originalLeg = stops[0]?.leg ?? route.plan.returnLeg;
  const progress = Math.max(0, Math.min(1, 1 - next.distanceMeters / Math.max(1, originalLeg.distanceMeters)));
  let at = now;
  const arrivals: DispatchGpsEstimate["arrivals"] = [];
  for (const [index, stop] of stops.entries()) {
    const leg = matrix[index][index + 1];
    if (!leg) return "unreachable";
    at += leg.durationSeconds * 1000;
    arrivals.push({ id: stop.id, at });
    at += (route.departureConfig?.serviceSeconds ?? 120) * 1000;
  }
  const lastLeg = matrix[stops.length][stops.length + 1];
  if (!lastLeg) return "unreachable";
  const [updated] = await db.update(dispatchRoutes).set({ gps: {
    sessionId: input.sessionId, estimate: { at: now, progress, arrivals, returnAt: at + lastLeg.durationSeconds * 1000 },
  } }).where(and(owned, session, sql`coalesce((${dispatchRoutes.gps}->'estimate'->>'at')::bigint, 0) < ${now}`))
    .returning({ id: dispatchRoutes.id });
  return updated ? "ok" : "closed";
}
