import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { orders } from "@/db/schema";
import { matchesDeliveryCode } from "@/lib/dispatch-confirmation";
import { queueDispatchUpdate, sendDispatchWhatsapp } from "@/lib/dispatch-whatsapp";
import { rateLimit } from "@/lib/rate-limit";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function completeDispatchStop(tx: Tx, order: { id: string; dispatchRouteId: string | null }, at: Date) {
  const [updated] = await tx.update(orders).set({ status: "delivered", deliveryStatus: "delivered", deliveredAt: at })
    .where(eq(orders.id, order.id)).returning({
      id: orders.id, status: orders.status, deliveryStatus: orders.deliveryStatus, dispatchedAt: orders.dispatchedAt, deliveredAt: orders.deliveredAt,
    });
  if (order.dispatchRouteId) await queueDispatchUpdate(tx, order.dispatchRouteId, order.id);
  return updated;
}

export async function confirmDispatchStopFromWhatsapp(driverId: number, reference: string, code?: string) {
  const confirmation = await db.transaction(async tx => {
    const candidates = await tx.select({
      id: orders.id, dispatchRouteId: orders.dispatchRouteId, hash: orders.deliveryConfirmationHash,
    }).from(orders).where(and(
      eq(orders.deliveryDriverId, driverId), eq(orders.orderType, "delivery"),
      eq(orders.status, "ready"), eq(orders.deliveryStatus, "out_for_delivery"),
      isNotNull(orders.dispatchRouteId), isNull(orders.archivedAt),
      sql`${orders.channel} is distinct from 'ifood' and upper(left(${orders.id}::text, 8)) = ${reference}`,
    )).limit(2).for("update");
    const [order] = candidates;
    if (candidates.length !== 1 || !order?.dispatchRouteId) {
      return { reply: "Este pedido não está entre as paradas pendentes da sua rota." };
    }
    if (order.hash) {
      if (!code) return { reply: `O pedido #${reference} exige código. Responda ENTREGUE #${reference} seguido do código recebido no destino.` };
      if (!rateLimit(`dispatch-delivery-code:${driverId}:${order.id}`, 5, 300_000, 300_000).ok) {
        return { reply: "Aguarde alguns minutos antes de tentar o código novamente." };
      }
      if (!matchesDeliveryCode(order.id, order.hash, code)) {
        return { reply: `Código incorreto. Confira no destino e tente novamente com ENTREGUE #${reference} seguido do código.` };
      }
    }
    await completeDispatchStop(tx, order, new Date());
    return { routeId: order.dispatchRouteId, orderId: order.id };
  });
  if (confirmation.reply !== undefined) return confirmation.reply;
  const notification = await sendDispatchWhatsapp(confirmation.routeId, confirmation.orderId);
  return notification === "sent" || notification === "sending"
    ? `Entrega #${reference} confirmada.`
    : `Entrega #${reference} confirmada. Consulte as próximas paradas no link da rota.`;
}
