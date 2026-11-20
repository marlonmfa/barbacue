import { z } from "zod";

export const deliveryLinkAction = z.discriminatedUnion("action", [
  z.object({ action: z.literal("message"), body: z.string().trim().min(1).max(1000) }).strict(),
  z.object({ action: z.literal("start") }).strict(),
  z.object({ action: z.literal("complete") }).strict(),
]);

export function deliveryLinkAvailable(order: { orderType: string; channel: string | null; status: string | null; createdAt: Date | null; deliveredAt: Date | null }, now = Date.now()) {
  return order.orderType === "delivery" && order.status !== "cancelled"
    && !!order.createdAt && order.createdAt.getTime() > now - 7 * 86400_000
    && (!order.deliveredAt || order.deliveredAt.getTime() > now - 86400_000);
}

export function deliveryLinkTransition(order: { status: string | null; deliveryStatus: string | null }, action: "start" | "complete") {
  if (action === "complete" && order.status === "delivered" && order.deliveryStatus === "delivered") return "unchanged";
  if (action === "start" && order.status === "ready" && order.deliveryStatus === "out_for_delivery") return "unchanged";
  if (order.status !== "ready") return "blocked";
  if (action === "start" && (!order.deliveryStatus || order.deliveryStatus === "assigned")) return "out_for_delivery";
  if (action === "complete" && order.deliveryStatus === "out_for_delivery") return "delivered";
  return "blocked";
}
