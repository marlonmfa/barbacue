import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { orders, coupons, customers, storeSettings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { buildPixPayload } from "@/lib/pix";

const OrderItemSchema = z.object({
  productId: z.number().int().positive(),
  name: z.string().min(1),
  priceCents: z.number().int().positive(),
  qty: z.number().int().positive(),
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
});

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = OrderSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const {
    customerName,
    customerPhone,
    deliveryAddress,
    items,
    notes,
    couponCode,
    paymentMethod,
    changeForCents,
    channel,
  } = parsed.data;
  const subtotalCents = items.reduce((sum, i) => sum + i.priceCents * i.qty, 0);

  // Resolve coupon
  let discountCents = 0;
  let couponId: number | null = null;
  let appliedCode: string | null = null;

  if (couponCode) {
    const [coupon] = await db
      .select()
      .from(coupons)
      .where(eq(coupons.code, couponCode.toUpperCase().trim()));

    if (
      coupon &&
      coupon.active &&
      (!coupon.expiresAt || new Date(coupon.expiresAt) >= new Date()) &&
      (coupon.maxUsages === null || (coupon.usedCount ?? 0) < coupon.maxUsages)
    ) {
      discountCents =
        coupon.discountType === "percentage"
          ? Math.round(subtotalCents * (coupon.discountValue / 100))
          : coupon.discountValue;
      couponId = coupon.id;
      appliedCode = coupon.code;

      // Increment usage counter
      await db
        .update(coupons)
        .set({ usedCount: (coupon.usedCount ?? 0) + 1 })
        .where(eq(coupons.id, coupon.id));
    }
  }

  const totalCents = Math.max(0, subtotalCents - discountCents);

  // Upsert customer record
  let customerId: number | null = null;
  try {
    const existing = await db
      .select({ id: customers.id })
      .from(customers)
      .where(eq(customers.phone, customerPhone));

    if (existing.length > 0) {
      customerId = existing[0].id;
    } else {
      const [newCustomer] = await db
        .insert(customers)
        .values({ name: customerName, phone: customerPhone, address: deliveryAddress ?? null })
        .returning({ id: customers.id });
      customerId = newCustomer.id;
    }
  } catch {
    // Non-fatal: order still goes through without customer linkage
  }

  const [order] = await db
    .insert(orders)
    .values({
      customerId,
      customerName,
      customerPhone,
      deliveryAddress: deliveryAddress ?? null,
      items,
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

  // For Pix, build the offline BR Code ("copia e cola") tied to this order.
  let pix: { payload: string } | null = null;
  if (paymentMethod === "pix" && totalCents > 0) {
    const [settings] = await db
      .select()
      .from(storeSettings)
      .where(eq(storeSettings.id, 1));
    if (settings?.pixKey) {
      pix = {
        payload: buildPixPayload({
          key: settings.pixKey,
          merchantName: settings.pixMerchantName ?? settings.storeName,
          merchantCity: settings.pixMerchantCity ?? "BRASIL",
          amountCents: totalCents,
          // txid must be alphanumeric — strip dashes from the UUID, cap at 25.
          txid: order.id.replace(/-/g, "").slice(0, 25),
        }),
      };
    }
  }

  return Response.json(
    { orderId: order.id, paymentMethod, totalCents, pix },
    { status: 201 }
  );
}
