import { getMember } from "@/lib/member-auth";
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
  brandCatalogProducts,
  deliverySettings,
  deliveryQuotes,
} from "@/db/schema";
import { and, eq, inArray, isNull, lt, or, sql, gte, asc } from "drizzle-orm";
import { buildPixPayload } from "@/lib/pix";
import { effectivePrice } from "@/lib/pricing";
import { computeStoreStatus } from "@/lib/store-hours";
import { brandFromHost } from "@/lib/brand-storefront";
import { requireStaff } from "@/lib/admin-auth";
import { can } from "@/lib/permissions";
import { deliveryAddressKey, type DeliveryRouteLinks } from "@/lib/delivery";
import { orderTotalCents } from "@/lib/order-totals";

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
  deliveryQuoteId: z.string().uuid().optional(),
  items: z.array(OrderItemSchema).min(1),
  notes: z.string().optional(),
  couponCode: z.string().optional(),
  paymentMethod: z.enum(["pix", "cash", "card_on_delivery"]).default("pix"),
  changeForCents: z.number().int().nonnegative().optional(),
  channel: z.enum(["click", "chat", "test"]).default("click"),
  // ─── Dine-in (mesa) ───
  orderType: z.enum(["delivery", "dine_in"]).default("delivery"),
  // When seated via QR, the table's opaque token. Re-validated against the DB —
  // the server never trusts a client-supplied table number.
  tableToken: z.string().uuid().optional(),
  brand: z.enum(["barbacue", "barbadog", "chelas"]).optional(),
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
    deliveryQuoteId,
    items: requestedItems,
    notes,
    couponCode,
    paymentMethod,
    changeForCents,
    channel,
    orderType: requestedType,
    tableToken,
    brand: requestedBrand,
  } = parsed.data;

  const hostBrand = brandFromHost(request.headers.get("x-forwarded-host") ?? request.headers.get("host"));
  const brand = requestedBrand ?? hostBrand ?? "barbacue";
  const isTestOrder = channel === "test";

  // Test orders can bypass store hours, but only from an authenticated admin
  // session. A public caller cannot turn this into a back door for closed-store
  // checkout by merely changing the channel value.
  const staff = isTestOrder ? await requireStaff().catch(() => null) : null;
  if (isTestOrder && (!staff || !can(staff, "service"))) {
    return fail("Apenas a equipe pode registrar pedidos de teste.", 403);
  }

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
  if (orderType !== "delivery" && deliveryQuoteId) return fail("Pedidos na mesa não têm frete. Atualize o pedido.", 422);

  // ─── Re-source every line item from the products table ──────────────
  const requestedIds = Array.from(new Set(requestedItems.map((i) => i.productId)));
  const canonicalProducts: { id: number; name: string; priceCents: number; available: boolean }[] = [];
  if (brand === "barbacue") {
    const nativeProducts = await db.select().from(products).where(inArray(products.id, requestedIds));
    canonicalProducts.push(...nativeProducts.map((product) => ({
      id: product.id,
      name: product.name,
      priceCents: effectivePrice(product),
      available: Boolean(product.available),
    })));
  } else {
    const managedProducts = await db
      .select()
      .from(brandCatalogProducts)
      .where(and(eq(brandCatalogProducts.brand, brand), inArray(brandCatalogProducts.id, requestedIds)));
    canonicalProducts.push(...managedProducts.map((product) => ({
      id: product.id,
      name: product.name,
      priceCents: product.priceCents,
      available: product.available,
    })));
  }
  const byId = new Map(canonicalProducts.map((p) => [p.id, p]));

  const canonicalItems: { productId: number; name: string; priceCents: number; qty: number }[] = [];
  for (const i of requestedItems) {
    const p = byId.get(i.productId);
    if (!p || !p.available) {
      return fail(`Produto indisponível: ${i.name ?? i.productId}`, 422);
    }
    canonicalItems.push({
      productId: p.id,
      name: p.name,
      priceCents: p.priceCents,
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
    if (!status.open && !isTestOrder) {
      return fail(
        status.nextOpen ? `${status.reason} ${status.nextOpen}` : status.reason,
        422,
        { storeClosed: true },
      );
    }
  }

  const subtotalCents = canonicalItems.reduce((sum, i) => sum + i.priceCents * i.qty, 0);

  // ─── Atomic: reserve coupon, enforce minimum, upsert customer, insert order ──
  // Wrapping all four in one transaction means a failed insert (or a sub-minimum
  // coupon) rolls back the usedCount increment — a single-use coupon is never
  // burned by a failed order.
  let discountCents = 0;
  const member = couponCode ? await getMember() : null;
  let couponId: number | null = null;
  let appliedCode: string | null = null;
  let orderId: string;
  let deliveryFeeCents = 0;
  let deliveryDistanceMeters: number | null = null;
  let deliveryDurationSeconds: number | null = null;
  let deliveryRoute: DeliveryRouteLinks | null = null;

  try {
    orderId = await db.transaction(async (tx) => {
      if (orderType === "delivery") {
        const [deliveryConfig] = await tx.select({ enabled: deliverySettings.enabled }).from(deliverySettings).where(eq(deliverySettings.id, 1)).for("share");
        if (deliveryConfig?.enabled && !deliveryQuoteId) {
          throw new DeliveryCheckoutError("Calcule o frete para este endereço antes de confirmar o pedido.", "delivery_quote_required");
        }
        if (!deliveryConfig?.enabled && deliveryQuoteId) {
          throw new DeliveryCheckoutError("O cálculo automático de frete foi desativado. Atualize o pedido antes de confirmar.", "delivery_disabled");
        }
        if (deliveryQuoteId) {
          const [quote] = await tx.select().from(deliveryQuotes).where(eq(deliveryQuotes.id, deliveryQuoteId)).for("share");
          if (!quote || quote.brand !== brand || quote.addressKey !== deliveryAddressKey(trimmedAddress) || quote.expiresAt.getTime() <= Date.now()) {
            throw new DeliveryCheckoutError("O cálculo de frete expirou ou corresponde a outro endereço. Calcule novamente.", "delivery_quote_invalid");
          }
          deliveryFeeCents = quote.feeCents;
          deliveryDistanceMeters = quote.distanceMeters;
          deliveryDurationSeconds = quote.durationSeconds;
          deliveryRoute = quote.routeLinks;
        }
      }
      if (couponCode) {
        const code = couponCode.toUpperCase().trim();
        const reserved = await tx
          .update(coupons)
          .set({ usedCount: sql`${coupons.usedCount} + 1` })
          .where(
            and(
              eq(coupons.code, code),
              eq(coupons.active, true),
              or(eq(coupons.audience, "all"), eq(coupons.audience, member ? "member" : "visitor")),
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

      const totalCents = orderTotalCents(subtotalCents, discountCents, deliveryFeeCents);
      if (paymentMethod === "cash" && changeForCents != null && changeForCents > 0 && changeForCents < totalCents) {
        throw new DeliveryCheckoutError("O valor para troco deve cobrir o total, incluindo o frete.", "insufficient_change");
      }

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
          brand,
          customerName,
          customerPhone,
          orderType,
          tableId,
          deliveryAddress: finalAddress,
          deliveryQuoteId: orderType === "delivery" ? deliveryQuoteId ?? null : null,
          deliveryFeeCents,
          deliveryDistanceMeters,
          deliveryDurationSeconds,
          deliveryRoute,
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
    if (err instanceof DeliveryCheckoutError) return fail(err.message, 422, { code: err.code });
    if (err instanceof RangeError) return fail(err.message, 422);
    if (err instanceof CouponMinError) {
      return fail(
        `Pedido mínimo para esse cupom: ${brl(err.minCents)}.`,
        422,
      );
    }
    console.error("order insert failed", err);
    return fail("Não foi possível registrar o pedido. Tente novamente.", 500);
  }

  const totalCents = orderTotalCents(subtotalCents, discountCents, deliveryFeeCents);

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
      brand,
      paymentMethod,
      orderType,
      tableNumber,
      subtotalCents,
      discountCents,
      totalCents,
      deliveryFeeCents,
      deliveryDistanceMeters,
      deliveryDurationSeconds,
      deliveryRoute,
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

class DeliveryCheckoutError extends Error {
  code: string;
  constructor(message: string, code: string) { super(message); this.code = code; }
}

const brl = (cents: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
