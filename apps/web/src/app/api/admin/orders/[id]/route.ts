import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { orders, staffUsers } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { withStaff } from "@/lib/admin-auth";
import { can } from "@/lib/permissions";

const PatchSchema = z.object({
  status: z.enum(["pending", "confirmed", "preparing", "ready", "delivered", "cancelled"]).optional(),
  deliveryDriverId: z.number().int().positive().nullable().optional(),
}).strict().refine(value => Number(value.status !== undefined) + Number(value.deliveryDriverId !== undefined) === 1, "Altere a etapa ou a atribuição de entregador, uma ação por vez.");

type Params = { params: Promise<{ id: string }> };

export const PATCH = withStaff(async (req: NextRequest, { params }: Params) => {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Pedido inválido." }, { status: 422 });
  const body = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  try {
    const updated = await db.transaction(async tx => {
      const [order] = await tx.select().from(orders).where(eq(orders.id, id)).for("update");
      if (!order) throw new OrderUpdateError("Pedido não encontrado.", 404);
      if (parsed.data.deliveryDriverId !== undefined) {
        if (order.orderType !== "delivery") throw new OrderUpdateError("Somente pedidos de entrega podem receber um entregador.", 422);
        if (order.status === "delivered" || order.status === "cancelled" || order.deliveryStatus === "out_for_delivery" || order.deliveryStatus === "delivered") {
          throw new OrderUpdateError("A entrega já saiu ou foi encerrada. Não é possível trocar o entregador.", 409);
        }
        const deliveryDriverId = parsed.data.deliveryDriverId;
        if (deliveryDriverId !== null) {
          const [driver] = await tx.select({ role: staffUsers.role, permissions: staffUsers.permissions }).from(staffUsers)
            .where(and(eq(staffUsers.id, deliveryDriverId), eq(staffUsers.role, "driver"), eq(staffUsers.active, true))).for("share");
          if (!driver || !can(driver, "deliveries")) throw new OrderUpdateError("Escolha um entregador ativo com acesso às entregas.", 422);
        }
        const [saved] = await tx.update(orders).set({ deliveryDriverId, deliveryStatus: deliveryDriverId === null ? null : "assigned", dispatchedAt: null, deliveredAt: null })
          .where(eq(orders.id, id)).returning({ id: orders.id, status: orders.status, deliveryDriverId: orders.deliveryDriverId, deliveryStatus: orders.deliveryStatus });
        return saved;
      }
      const status = parsed.data.status!;
      if ((order.status === "delivered" || order.status === "cancelled") && status !== order.status) throw new OrderUpdateError("Este pedido já foi encerrado.", 409);
      if (order.deliveryStatus === "out_for_delivery" && status !== "delivered" && status !== "cancelled" && status !== "ready") {
        throw new OrderUpdateError("Este pedido já está em entrega. Conclua ou cancele a saída antes de mudar o preparo.", 409);
      }
      const [saved] = await tx.update(orders).set({
        status,
        ...(status === "delivered" ? { deliveredAt: order.deliveredAt ?? new Date(), ...(order.orderType === "delivery" && order.deliveryDriverId ? { deliveryStatus: "delivered" as const } : {}) } : {}),
        ...(status === "cancelled" ? { deliveryStatus: null } : {}),
      }).where(eq(orders.id, id)).returning({ id: orders.id, status: orders.status, deliveryDriverId: orders.deliveryDriverId, deliveryStatus: orders.deliveryStatus });
      return saved;
    });
    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof OrderUpdateError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
});

class OrderUpdateError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
