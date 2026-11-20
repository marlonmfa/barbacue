import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { deliveryMessages, dispatchRoutes, orders } from "@/db/schema";
import { addressNavigationLinks, dispatchNavigationDestination, wazeNavigationLink } from "@/lib/delivery-navigation";
import { deliveryLinkAction, deliveryLinkAvailable, deliveryLinkTransition } from "./delivery-link-validation";

export class DeliveryLinkError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

/** Items shown to the driver: what to carry, never unit prices or product ids. */
export function deliveryLinkItems(items: unknown) {
  if (!Array.isArray(items)) return [];
  return items.flatMap(item => {
    if (!item || typeof item !== "object") return [];
    const { name, qty, notes } = item as { name?: unknown; qty?: unknown; notes?: unknown };
    if (typeof name !== "string" || !name.trim()) return [];
    return [{ name: name.trim(), qty: Number.isFinite(Number(qty)) && Number(qty) > 0 ? Number(qty) : 1, notes: typeof notes === "string" && notes.trim() ? notes.trim() : null }];
  });
}

export async function deliveryLinkData(value: string, byToken = true) {
  if (!z.string().uuid().safeParse(value).success) throw new DeliveryLinkError("Entrega não encontrada ou link expirado.", 404);
  const [match] = await db.select({
    order: orders,
    dispatchPoint: sql<unknown>`(${dispatchRoutes.plan}->'stops'->(${orders.dispatchPosition} - 1)->'point')`,
  }).from(orders)
    .leftJoin(dispatchRoutes, eq(orders.dispatchRouteId, dispatchRoutes.id))
    .where(eq(byToken ? orders.deliveryAccessToken : orders.id, value));
  if (!match || !deliveryLinkAvailable(match.order)) throw new DeliveryLinkError("Entrega não encontrada ou link expirado.", 404);
  const { order } = match;
  const destination = dispatchNavigationDestination(match.dispatchPoint, order.deliveryAddress);
  const navigation = addressNavigationLinks(destination, null);
  const waze = wazeNavigationLink(order.deliveryAddress?.trim() || destination);
  const messages = await db.select({ id: deliveryMessages.id, sender: deliveryMessages.sender, body: deliveryMessages.body, createdAt: deliveryMessages.createdAt })
    .from(deliveryMessages).where(eq(deliveryMessages.orderId, order.id)).orderBy(desc(deliveryMessages.createdAt), desc(deliveryMessages.id)).limit(100);
  return {
    // Only staff receive the access token; public responses contain delivery details only.
    ...(byToken ? {} : { token: order.deliveryAccessToken }),
    id: order.id, brand: order.brand, channel: order.channel, customerName: order.customerName, customerPhone: order.customerPhone,
    address: order.deliveryAddress, notes: order.notes,
    items: deliveryLinkItems(order.items), totalCents: order.totalCents,
    paymentMethod: order.paymentMethod, paymentStatus: order.paymentStatus, changeForCents: order.changeForCents,
    status: order.status, deliveryStatus: order.deliveryStatus,
    dispatchedAt: order.dispatchedAt, deliveredAt: order.deliveredAt,
    navigation: navigation && waze ? { ...navigation, waze } : null,
    messages: messages.reverse(),
  };
}

export async function deliveryLinkMutate(value: string, input: unknown, sender: "store" | "driver") {
  const parsed = deliveryLinkAction.safeParse(input);
  if (!parsed.success) throw new DeliveryLinkError("Informe uma mensagem de até 1.000 caracteres ou uma etapa válida.", 422);
  if (sender === "store" && parsed.data.action !== "message") throw new DeliveryLinkError("Etapa inválida.", 422);
  if (!z.string().uuid().safeParse(value).success) throw new DeliveryLinkError("Entrega não encontrada ou link expirado.", 404);
  await db.transaction(async tx => {
    const [order] = await tx.select().from(orders).where(eq(sender === "driver" ? orders.deliveryAccessToken : orders.id, value)).for("update");
    if (!order || !deliveryLinkAvailable(order)) throw new DeliveryLinkError("Entrega não encontrada ou link expirado.", 404);
    if (parsed.data.action === "message") {
      if (order.status === "delivered") throw new DeliveryLinkError("Esta entrega já foi concluída.", 409);
      await tx.insert(deliveryMessages).values({ orderId: order.id, sender, body: parsed.data.body });
      return;
    }
    // iFood owns dispatch and conclusion; the link there is for address, items and messages.
    if (order.channel === "ifood") throw new DeliveryLinkError("A saída e a conclusão do pedido iFood são informadas pela plataforma.", 409);
    if (order.dispatchRouteId && !order.dispatchedAt && parsed.data.action === "start") {
      throw new DeliveryLinkError("O caixa precisa registrar a saída da rota antes de iniciar esta entrega.", 409);
    }
    const transition = deliveryLinkTransition(order, parsed.data.action);
    if (transition === "blocked" || (order.channel === "online" && order.paymentStatus !== "paid")) throw new DeliveryLinkError("Aguarde o pedido ficar pronto e registre a saída antes de concluir.", 409);
    if (transition === "unchanged") return;
    const now = new Date();
    await tx.update(orders).set(transition === "delivered"
      ? { status: "delivered", deliveryStatus: "delivered", deliveredAt: now }
      : { deliveryStatus: "out_for_delivery", dispatchedAt: now })
      .where(and(eq(orders.id, order.id), eq(orders.deliveryAccessToken, order.deliveryAccessToken)));
  });
}

export function deliveryLinkFailure(error: unknown) {
  if (error instanceof DeliveryLinkError) return Response.json({ error: error.message }, { status: error.status, headers: { "Cache-Control": "no-store" } });
  console.error("Delivery link request failed", error instanceof Error ? error.name : "unknown");
  return Response.json({ error: "Não foi possível acessar a entrega. Tente novamente." }, { status: 500 });
}
