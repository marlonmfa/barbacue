import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { brandCatalogProducts, closedDays, kitchenPrintJobs, orders, products, restaurantTables, storeSettings } from "@/db/schema";
import { effectivePrice } from "@/lib/pricing";
import { computeStoreStatus } from "@/lib/store-hours";
import { canonicalSelfServiceItems, SelfServiceError, selfServiceRequestHash, type SelfServiceOrderInput, type SelfServiceReceipt } from "@/lib/self-service";
import type { KitchenTicket } from "@/lib/kitchen-print";
import { rateLimit } from "@/lib/rate-limit";

export async function createSelfServiceOrder(input: SelfServiceOrderInput, clientIp: string): Promise<{ receipt: SelfServiceReceipt; replayed: boolean }> {
  const hash = selfServiceRequestHash(input);
  return db.transaction(async tx => {
    // A transaction-scoped lock serializes concurrent retries, including the
    // first request before its UNIQUE request id exists. Hash collisions only
    // serialize unrelated requests; the complete UUID is always checked below.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${input.requestId}, 0))`);
    const [previous] = await tx.select({ hash: orders.selfServiceRequestHash, receipt: orders.selfServiceResponse })
      .from(orders).where(eq(orders.selfServiceRequestId, input.requestId));
    if (previous) {
      if (previous.hash !== hash) throw new SelfServiceError("Este envio já foi usado para outro pedido. Revise e envie novamente.", 409, "request_conflict");
      if (!previous.receipt) throw new Error("Self-service order is missing its receipt");
      return { receipt: previous.receipt, replayed: true };
    }
    // Successful retries must remain recoverable even when the tablet/shared
    // restaurant IP has reached the limit for new order attempts.
    if (!rateLimit(`self-service:${clientIp}`, 60, 60_000, 60_000).ok) {
      throw new SelfServiceError("Muitos envios em sequência. Aguarde um minuto e tente novamente.", 429, "rate_limited");
    }

    // Validate after checking a retry: accepted orders remain recoverable after
    // closing time, price edits, or QR rotation, without creating another job.
    let table: { id: number; number: number; label: string | null } | null = null;
    if (input.tableToken) {
      const [row] = await tx.select().from(restaurantTables)
        .where(and(eq(restaurantTables.token, input.tableToken), eq(restaurantTables.active, true))).for("share");
      if (!row) throw new SelfServiceError("Mesa inválida ou desativada. Escaneie o QR Code novamente.", 422, "invalid_table");
      table = row;
    }
    if (input.channel === "table_qr" && !table) throw new SelfServiceError("Escaneie o QR Code da mesa para pedir.", 422, "invalid_table");

    const [settings] = await tx.select().from(storeSettings).where(eq(storeSettings.id, 1));
    const closures = await tx.select({ date: closedDays.date, reason: closedDays.reason }).from(closedDays);
    const storeStatus = computeStoreStatus(settings, closures);
    if (!storeStatus.open) throw new SelfServiceError([storeStatus.reason, storeStatus.nextOpen].filter(Boolean).join(" "), 422, "store_closed");

    const ids = [...new Set(input.items.map(item => item.productId))];
    const canonicalProducts = input.brand === "barbacue"
      ? (await tx.select().from(products).where(inArray(products.id, ids)).for("share"))
        .map(product => ({ ...product, priceCents: effectivePrice(product) }))
      : await tx.select().from(brandCatalogProducts)
        .where(and(eq(brandCatalogProducts.brand, input.brand), inArray(brandCatalogProducts.id, ids))).for("share");
    const items = canonicalSelfServiceItems(input.items, canonicalProducts);
    const totalCents = items.reduce((sum, item) => sum + item.priceCents * item.qty, 0);
    if (!Number.isSafeInteger(totalCents) || totalCents > 10_000_000) throw new SelfServiceError("O valor do pedido excede o limite. Chame um atendente.", 422, "order_limit");

    const orderId = randomUUID();
    const now = new Date();
    const orderType = table ? "dine_in" as const : "pickup" as const;
    const receipt: SelfServiceReceipt = { orderId, orderType, tableNumber: table?.number ?? null, totalCents, items, status: "confirmed", printStatus: "queued" };
    const ticket: KitchenTicket = {
      version: 1, orderId, orderNumber: orderId.slice(0, 8).toUpperCase(), brand: input.brand,
      channel: input.channel, orderType, tableNumber: table?.number ?? null, tableLabel: table?.label ?? null,
      customerName: input.customerName || null,
      items: items.map(item => ({ name: item.name, qty: item.qty, notes: item.notes })),
      notes: input.notes || null, createdAt: now.toISOString(),
      payment: { method: input.paymentMethod, status: "pending", label: "Pagar no local" }, reprint: false,
    };
    await tx.insert(orders).values({
      id: orderId, selfServiceRequestId: input.requestId, selfServiceRequestHash: hash, selfServiceResponse: receipt,
      brand: input.brand, customerName: input.customerName || "", customerPhone: "",
      customerId: null, orderType, tableId: table?.id ?? null, deliveryAddress: null,
      items, subtotalCents: totalCents, totalCents, discountCents: 0,
      status: "confirmed", paymentMethod: input.paymentMethod, paymentStatus: "pending",
      channel: input.channel, notes: input.notes || null, createdAt: now,
    });
    await tx.insert(kitchenPrintJobs).values({ orderId, ticket });
    return { receipt, replayed: false };
  });
}
