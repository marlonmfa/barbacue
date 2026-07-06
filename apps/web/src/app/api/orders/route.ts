import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import {
  orders,
  coupons,
  customers,
  products,
  storeSettings,
  closedDays,
  restaurantTables,
} from "@/db/schema";
import { and, eq, inArray, isNull, lt, or, sql, gte, asc } from "drizzle-orm";
import { buildPixPayload } from "@/lib/pix";
import { effectivePrice } from "@/lib/pricing";
import { computeStoreStatus } from "@/lib/store-hours";

// Only productId + qty are trusted from the client. Name and priceCents are
// resolved from the products table server-side to prevent price tampering.
const OrderItemSchema = z.object({
  productId: z.number().int().positive(),
  qty: z.number().int().positive(),
  // Tolerated for backwards compat with existing clients; ignored server-side.
  name: z.string().optional(),
  priceCents: z.number().int().nonnegative().optional(),
});

const OrderSchema = z.object({
  customerName: z.string().min(2),
  customerPhone: z.string().min(8),
  deliveryAddress: z.string().optional(),
  items: z.array(OrderItemSchema).min(1),
  notes: z.string().optional(),
  couponCode: z.string().optional(),
  paymentMethod: z.enum(["pix", "cash", "card_on_delivery"]).default("pix"),
  changeForCents: z.number().int().nonnegative().optional(),
  channel: z.enum(["click", "chat"]).default("click"),
  // ─── Dine-in (mesa) ───
  orderType: z.enum(["delivery", "dine_in"]).default("delivery"),
  // When seated via QR, the table's opaque token. Re-validated against the DB —
  // the server never trusts a client-supplied table number.
  tableToken: z.string().uuid().optional(),
});

// One JSON helper so every failure path returns a human pt-BR `message` the UI
// can show directly, alongside the structured `error` for debugging.
function fail(message: string, status: number, extra?: Record<string, unknown>) {
  return Response.json({ error: message, message, ...extra }, { status });
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("Requisição inválida.", 400);
  }

  const parsed = OrderSchema.safeParse(body);
  if (!parsed.success) {
    // Surface the first readable issue instead of dumping raw Zod to the customer.
    const first = parsed.error.issues[0];
    const msg = first ? `${first.path.join(".")}: ${first.message}` : "Dados do pedido inválidos.";
    return Response.json({ error: parsed.error.flatten(), message: msg }, { status: 422 });
  }

  const {
    customerName,
    customerPhone,
    deliveryAddress,
    items: requestedItems,
    notes,
    couponCode,
    paymentMethod,
    changeForCents,
    channel,
    orderType: requestedType,
    tableToken,
  } = parsed.data;

  // ─── Resolve the table (dine-in) ───────────────────────────────────
  // A valid, active token wins: it forces dine_in and ties the order to the
  // table. An invalid/inactive token is rejected so a stale QR can't slip an
  // order through as some random table.
  let tableId: number | null = null;
  let tableNumber: number | null = null;
  let orderType = requestedType;
  if (tableToken) {
    const [table] = await db
      .select()
      .from(restaurantTables)
      .where(eq(restaurantTables.token, tableToken));
    if (!table || !table.active) {
      return fail("Mesa inválida ou desativada. Escaneie o QR novamente.", 422);
    }
    tableId = table.id;
    tableNumber = table.number;
    orderType = "dine_in";
  }

  // ─── Address requirement depends on order type ─────────────────────
  const trimmedAddress = (deliveryAddress ?? "").trim();
  if (orderType === "delivery" && trimmedAddress.length < 4) {
    return fail("Informe o endereço de entrega.", 422);
  }
  // Dine-in never stores an address; delivery clears any stray table id.
  const finalAddress = orderType === "dine_in" ? null : trimmedAddress;
  if (orderType === "delivery") {
    tableId = null;
    tableNumber = null;
  }

  // ─── Re-source every line item from the products table ──────────────
  const requestedIds = Array.from(new Set(requestedItems.map((i) => i.productId)));
  const dbProducts = await db
    .select()
    .from(products)
    .where(inArray(products.id, requestedIds));
  const byId = new Map(dbProducts.map((p) => [p.id, p]));

  const canonicalItems: { productId: number; name: string; priceCents: number; qty: number }[] = [];
  for (const i of requestedItems) {
    const p = byId.get(i.productId);
    if (!p || !p.available) {
      return fail(`Produto indisponível: ${i.name ?? i.productId}`, 422);
    }
    canonicalItems.push({
      productId: p.id,
      name: p.name,
      priceCents: effectivePrice(p),
      qty: i.qty,
    });
  }

  // ─── Reject orders placed while the store is closed ─────────────────
  {
    const [settings] = await db.select().from(storeSettings).where(eq(storeSettings.id, 1));
    const todayStr = new Date().toISOString().slice(0, 10);
    const upcoming = await db
      .select({ date: closedDays.date, reason: closedDays.reason })
      .from(closedDays)
      .where(gte(closedDays.date, todayStr))
      .orderBy(asc(closedDays.date));
    const status = computeStoreStatus(settings, upcoming);
    if (!status.open) {
      return fail(
        status.nextOpen ? `${status.reason} ${status.nextOpen}` : status.reason,
        422,
        { storeClosed: true },
      );
    }
  }

  const subtotalCents = canonicalItems.reduce((sum, i) => sum + i.priceCents * i.qty, 0);

  // ─── changeFor sanity (cash only): can't ask change for less than the total ──
  if (paymentMethod === "cash" && changeForCents != null && changeForCents > 0) {
    // total may shrink with a coupon, but if the customer's cash is already below
    // the subtotal it's certainly below the total — reject early with a clear msg.
    if (changeForCents < subtotalCents) {
      return fail("O valor do troco não pode ser menor que o total do pedido.", 422);
    }
  }

  // ─── Atomic: reserve coupon, enforce minimum, upsert customer, insert order ──
  // Wrapping all four in one transaction means a failed insert (or a sub-minimum
  // coupon) rolls back the usedCount increment — a single-use coupon is never
  // burned by a failed order.
  let discountCents = 0;
  let couponId: number | null = null;
  let appliedCode: string | null = null;
  let orderId: string;

  try {
    orderId = await db.transaction(async (tx) => {
      if (couponCode) {
        const code = couponCode.toUpperCase().trim();
        const reserved = await tx
          .update(coupons)
          .set({ usedCount: sql`${coupons.usedCount} + 1` })
          .where(
            and(
              eq(coupons.code, code),
              eq(coupons.active, true),
              or(isNull(coupons.expiresAt), sql`${coupons.expiresAt} >= now()`),
              or(isNull(coupons.maxUsages), lt(coupons.usedCount, coupons.maxUsages)),
            ),
          )
          .returning();

        if (reserved.length > 0) {
          const coupon = reserved[0];
          // Enforce the minimum order at order time too — the soft preview in
          // /api/coupons is bypassable by a direct POST.
          if ((coupon.minOrderCents ?? 0) > 0 && subtotalCents < (coupon.minOrderCents ?? 0)) {
            throw new CouponMinError(coupon.minOrderCents ?? 0);
          }
          discountCents =
            coupon.discountType === "percentage"
              ? Math.round(subtotalCents * (coupon.discountValue / 100))
              : coupon.discountValue;
          discountCents = Math.min(Math.max(discountCents, 0), subtotalCents);
          couponId = coupon.id;
          appliedCode = coupon.code;
        }
        // A non-matching code is silently ignored (no discount) — not an error.
      }

      const totalCents = Math.max(0, subtotalCents - discountCents);

      // Upsert customer (best-effort, but inside the tx so a hard failure rolls back).
      let customerId: number | null = null;
      const existing = await tx
        .select({ id: customers.id })
        .from(customers)
        .where(eq(customers.phone, customerPhone));
      if (existing.length > 0) {
        customerId = existing[0].id;
      } else {
        const [newCustomer] = await tx
          .insert(customers)
          .values({ name: customerName, phone: customerPhone, address: finalAddress })
          .returning({ id: customers.id });
        customerId = newCustomer.id;
      }

      const [order] = await tx
        .insert(orders)
        .values({
          customerId,
          customerName,
          customerPhone,
          orderType,
          tableId,
          deliveryAddress: finalAddress,
          items: canonicalItems,
          subtotalCents,
          discountCents,
          totalCents,
          couponId,
          couponCode: appliedCode,
          paymentMethod,
          paymentStatus: "pending",
          changeForCents: paymentMethod === "cash" ? changeForCents ?? null : null,
          channel,
          notes: notes ?? null,
          status: "pending",
        })
        .returning({ id: orders.id });

      return order.id;
    });
  } catch (err) {
    if (err instanceof CouponMinError) {
      return fail(
        `Pedido mínimo para esse cupom: ${brl(err.minCents)}.`,
        422,
      );
    }
    console.error("order insert failed", err);
    return fail("Não foi possível registrar o pedido. Tente novamente.", 500);
  }

  const totalCents = Math.max(0, subtotalCents - discountCents);

  // For Pix, build the offline BR Code ("copia e cola") tied to this order.
  let pix: { payload: string } | null = null;
  if (paymentMethod === "pix" && totalCents > 0) {
    const [settings] = await db.select().from(storeSettings).where(eq(storeSettings.id, 1));
    if (settings?.pixKey) {
      pix = {
        payload: buildPixPayload({
          key: settings.pixKey,
          merchantName: settings.pixMerchantName ?? settings.storeName,
          merchantCity: settings.pixMerchantCity ?? "BRASIL",
          amountCents: totalCents,
          txid: orderId.replace(/-/g, "").slice(0, 25),
        }),
      };
    }
  }

  return Response.json(
    {
      orderId,
      paymentMethod,
      orderType,
      tableNumber,
      subtotalCents,
      discountCents,
      totalCents,
      items: canonicalItems,
      pix,
    },
    { status: 201 },
  );
}

// Sentinel thrown inside the transaction to roll back a coupon reserved below its
// minimum order. Carries the threshold so the handler can phrase the message.
class CouponMinError extends Error {
  constructor(public minCents: number) {
    super("coupon-min-not-met");
  }
}

const brl = (cents: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
