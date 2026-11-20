import { and, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { dispatchRoutes, orders, staffUsers } from "@/db/schema";
import { barbaContactPhone } from "@/lib/barba-contact";
import { dispatchGoogleMapsLinks } from "@/lib/dispatch-maps";
import { addressNavigationLinks } from "@/lib/delivery-navigation";
import { routeConfirmationHash, routeConfirmationToken } from "@/lib/dispatch-confirmation";

export type DispatchWhatsappStatus = "pending" | "sending" | "sent" | "failed" | "missing_phone" | "unconfirmed";
export type DispatchWhatsappNotification = { state: DispatchWhatsappStatus; event: string; attemptAt?: number };
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const sendingTimeoutMs = 30_000;

export function dispatchWhatsappStatus(notification: DispatchWhatsappNotification | null, now: number) {
  if (notification?.state === "sending" && (notification.attemptAt ?? 0) < now - sendingTimeoutMs) return "unconfirmed";
  return notification?.state ?? null;
}

export async function queueDispatchUpdate(tx: Tx, routeId: string, orderId: string) {
  await tx.update(dispatchRoutes).set({
    confirmationHash: routeConfirmationHash(routeConfirmationToken(routeId)),
    whatsappNotification: { state: "pending", event: orderId },
  }).where(and(eq(dispatchRoutes.id, routeId), isNotNull(dispatchRoutes.startedAt), isNull(dispatchRoutes.returnedAt)));
}

export async function sendDispatchWhatsapp(id: string, eventId?: string) {
  const attemptAt = Date.now();
  const state = sql`${dispatchRoutes.whatsappNotification}->>'state'`;
  const event = sql<string>`${dispatchRoutes.whatsappNotification}->>'event'`;
  const attempt = sql`(${dispatchRoutes.whatsappNotification}->>'attemptAt')::bigint`;
  const eligible = eventId ? sql`${state} = 'pending' and ${event} = ${eventId}`
    : sql`(${state} in ('pending','failed','missing_phone','unconfirmed') or
        (${state} = 'sending' and ${attempt} < ${attemptAt - sendingTimeoutMs}))`;
  const route = and(eq(dispatchRoutes.id, id), isNotNull(dispatchRoutes.startedAt),
    isNull(dispatchRoutes.returnedAt), isNull(dispatchRoutes.releasedAt));
  const [claimed] = await db.update(dispatchRoutes).set({
    whatsappNotification: sql`jsonb_build_object('state', 'sending', 'event', ${event}, 'attemptAt', ${attemptAt}::bigint)`,
  }).where(and(route, eligible)).returning();
  if (!claimed?.whatsappNotification) {
    const [current] = await db.select({ notification: dispatchRoutes.whatsappNotification }).from(dispatchRoutes).where(route);
    return dispatchWhatsappStatus(current?.notification ?? null, attemptAt);
  }

  const notificationEvent = claimed.whatsappNotification.event;
  let result: DispatchWhatsappStatus = "missing_phone";
  if (claimed.driverId !== null) {
    const [driver] = await db.select({ phone: staffUsers.whatsappPhone }).from(staffUsers)
      .where(and(eq(staffUsers.id, claimed.driverId), eq(staffUsers.active, true)));
    const phone = driver?.phone && barbaContactPhone(driver.phone);
    if (phone) {
      const base = process.env.BOT_STATUS_URL;
      const token = process.env.BOT_API_TOKEN;
      result = "failed";
      if (base && token) {
        const text = await dispatchWhatsappMessage(claimed, notificationEvent);
        try {
          const response = await fetch(new URL("messages", base.endsWith("/") ? base : base + "/"), {
            method: "POST", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(7_000),
            headers: { "x-bot-token": token, "content-type": "application/json" },
            body: JSON.stringify({ account: "cogia", jid: `${phone}@s.whatsapp.net`, text }),
          });
          result = response.status === 201 ? "sent" : "failed";
        } catch { result = "unconfirmed"; }
      }
    }
  }

  await db.update(dispatchRoutes).set({ whatsappNotification: { state: result, event: notificationEvent, attemptAt } })
    .where(and(eq(dispatchRoutes.id, id), sql`${state} = 'sending' and ${event} = ${notificationEvent} and ${attempt} = ${attemptAt}`));
  return result;
}

export async function dispatchWhatsappRouteForDriver(driverId: number) {
  const [route] = await db.select().from(dispatchRoutes).where(and(
    eq(dispatchRoutes.driverId, driverId), isNotNull(dispatchRoutes.startedAt),
    isNull(dispatchRoutes.releasedAt), isNull(dispatchRoutes.returnedAt),
  )).orderBy(desc(dispatchRoutes.startedAt)).limit(1);
  return route ? dispatchWhatsappMessage(route, route.whatsappNotification?.event)
    : "Você não tem uma rota em andamento.";
}

async function dispatchWhatsappMessage(route: typeof dispatchRoutes.$inferSelect, notificationEvent?: string) {
  const rows = await db.select({ id: orders.id, requiresCode: sql<boolean>`${orders.deliveryConfirmationHash} is not null` }).from(orders).where(and(eq(orders.dispatchRouteId, route.id),
    eq(orders.deliveryStatus, "out_for_delivery"), sql`${orders.status} not in ('cancelled','delivered')`));
  const remaining = new Map(rows.map(order => [order.id, order.requiresCode]));
  const stops = route.plan.stops.filter(stop => remaining.has(stop.id));
  const maps = dispatchGoogleMapsLinks(route.originKey, stops.map(stop => stop.point),
    route.plan.stops.find(stop => stop.id === notificationEvent)?.point);
  const link = new URL("https://barbacue.cog.ia.br");
  if (route.confirmationHash) link.searchParams.set("confirma", routeConfirmationToken(route.id));
  else {
    link.pathname = "/admin/delivery";
    link.searchParams.set("rota", route.id);
  }
  const intro = !notificationEvent ? "Sua rota de entregas atualizada."
    : notificationEvent === route.id ? "Sua rota de entregas foi confirmada."
    : `Entrega #${notificationEvent.slice(0, 8).toUpperCase()} confirmada.`;
  return [intro, "",
    maps.length ? stops.length ? "Google Maps · Rota completa" : "Google Maps · Retorno à loja" : "",
    ...maps.map((map, index) => maps.length > 1 ? `Trecho ${index + 1}: ${map}` : map),
    "",
    ...stops.flatMap(stop => {
      const destination = `${stop.point.latitude},${stop.point.longitude}`;
      const reference = stop.id.slice(0, 8).toUpperCase();
      return [`Pedido #${reference}`, addressNavigationLinks(destination, null)!.google,
        ...(remaining.get(stop.id) ? [`Peça o código no destino e responda ENTREGUE #${reference} seguido do código.`] : [])];
    }),
    "", "Confirme as entregas e acompanhe a rota atualizada:", link.href,
  ].join("\n");
}
