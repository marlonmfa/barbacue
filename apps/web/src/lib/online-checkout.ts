import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { brandCatalogProducts, closedDays, deliveryQuotes, deliverySettings, kitchenPrintJobs, onlineCheckouts, orders, products, restaurantTables, storeSettings } from "@/db/schema";
import { asaasConfig, asaasRequest, findAsaasPayment, getAsaasPayment, type PixCode } from "@/lib/asaas";
import { asaasPaymentState, assertPaymentMatches, OnlinePaymentError, paymentReference, secureEquals, tokenHash, type AsaasPayment, type OnlineOrderInput } from "@/lib/online-payment";
import { canonicalSelfServiceItems } from "@/lib/self-service";
import { effectivePrice } from "@/lib/pricing";
import { computeStoreStatus } from "@/lib/store-hours";
import { deliveryAddressKey } from "@/lib/delivery";
import { rateLimit } from "@/lib/rate-limit";
import type { KitchenTicket } from "@/lib/kitchen-print";

// Separate connections prevent concurrent provider calls waiting on the same
// advisory lock from exhausting the application pool needed for durable writes.
const paymentLocks = new Pool({ connectionString: process.env.DATABASE_URL, max: 4, allowExitOnIdle: true });
async function withPaymentLock<T>(id: string, action: () => Promise<T>): Promise<T> {
  const connection = await paymentLocks.connect();
  try {
    await connection.query("BEGIN");
    await connection.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`asaas:${id}`]);
    const result = await action();
    await connection.query("COMMIT");
    return result;
  } catch (error) { await connection.query("ROLLBACK"); throw error; }
  finally { connection.release(); }
}

export async function createOnlineOrder(input: OnlineOrderInput, ip: string) {
  const environment = asaasConfig().environment;
  const requestHash = tokenHash(JSON.stringify(input));
  return db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`online-order:${input.requestId}`}, 0))`);
    const [previous] = await tx.select().from(onlineCheckouts).where(eq(onlineCheckouts.id, input.requestId));
    if (previous) {
      if (previous.requestHash !== requestHash || !secureEquals(previous.accessTokenHash, tokenHash(input.accessToken))) throw new OnlinePaymentError("Este envio corresponde a outro pedido. Recupere a confirmação original.", 409);
      return previous.id;
    }
    if (!rateLimit(`online-order:${ip}`, 15, 60_000, 60_000).ok) throw new OnlinePaymentError("Muitos envios. Aguarde um minuto e tente novamente.", 429);
    const [settings] = await tx.select().from(storeSettings).where(eq(storeSettings.id, 1));
    const closures = await tx.select().from(closedDays);
    const status = computeStoreStatus(settings, closures);
    if (!status.open) throw new OnlinePaymentError([status.reason, status.nextOpen].filter(Boolean).join(" "), 422);
    let table = null;
    if (input.orderType === "dine_in") {
      [table] = await tx.select().from(restaurantTables).where(and(eq(restaurantTables.token, input.tableToken!), eq(restaurantTables.active, true))).for("share");
      if (!table) throw new OnlinePaymentError("Mesa inválida ou desativada. Escaneie o QR Code novamente.", 422);
    }
    const ids = [...new Set(input.items.map(item => item.productId))];
    const catalog = input.brand === "barbacue"
      ? (await tx.select().from(products).where(inArray(products.id, ids)).for("share")).map(p => ({ ...p, priceCents: effectivePrice(p) }))
      : await tx.select().from(brandCatalogProducts).where(and(eq(brandCatalogProducts.brand, input.brand), inArray(brandCatalogProducts.id, ids))).for("share");
    let items;
    try { items = canonicalSelfServiceItems(input.items, catalog); }
    catch { throw new OnlinePaymentError("Um produto ficou indisponível. Atualize o cardápio e revise o pedido.", 422); }
    const subtotalCents = items.reduce((n, item) => n + item.priceCents * item.qty, 0);
    let quote = null;
    if (input.orderType === "delivery") {
      const [config] = await tx.select().from(deliverySettings).where(eq(deliverySettings.id, 1)).for("share");
      // Never assume delivery is free when a restaurant has no delivery setup.
      if (!config?.enabled) throw new OnlinePaymentError("Entrega indisponível no momento. Escolha retirada na loja.", 422);
      if (!input.deliveryQuoteId) throw new OnlinePaymentError("Calcule o frete antes de pagar.", 422);
      [quote] = await tx.select().from(deliveryQuotes).where(eq(deliveryQuotes.id, input.deliveryQuoteId)).for("share");
      if (!quote || quote.brand !== input.brand || quote.addressKey !== deliveryAddressKey(input.deliveryAddress!) || quote.expiresAt.getTime() <= Date.now()) throw new OnlinePaymentError("O frete expirou ou corresponde a outro endereço. Calcule novamente.", 422);
    }
    const totalCents = subtotalCents + (quote?.feeCents ?? 0);
    if (!Number.isSafeInteger(totalCents) || totalCents < 100 || totalCents > 1_000_000) throw new OnlinePaymentError("O total deve ficar entre R$ 1 e R$ 10.000. Confira os itens.", 422);
    const orderId = randomUUID();
    await tx.insert(orders).values({ id: orderId, brand: input.brand, customerName: input.customerName, customerPhone: input.customerPhone,
      orderType: input.orderType, tableId: table?.id ?? null, deliveryAddress: quote ? input.deliveryAddress : null,
      deliveryQuoteId: quote?.id ?? null, deliveryFeeCents: quote?.feeCents ?? 0, deliveryDistanceMeters: quote?.distanceMeters ?? null,
      deliveryDurationSeconds: quote?.durationSeconds ?? null, deliveryRoute: quote?.routeLinks ?? null,
      items, subtotalCents, totalCents, discountCents: 0, channel: "online", paymentMethod: "pix", paymentStatus: "pending", status: "pending", notes: input.notes || null });
    await tx.insert(onlineCheckouts).values({ id: input.requestId, requestHash, accessTokenHash: tokenHash(input.accessToken), orderId, environment });
    return input.requestId;
  });
}

export async function authorizedCheckout(id: string, accessToken: string) {
  const [checkout] = await db.select().from(onlineCheckouts).where(eq(onlineCheckouts.id, id));
  if (!checkout || !secureEquals(checkout.accessTokenHash, tokenHash(accessToken))) throw new OnlinePaymentError("Confirmação não encontrada neste navegador.", 404);
  return checkout;
}

/** Serialized locally; the attempt marker commits before any financial POST.
 * A timeout or process crash can only be recovered by finding the existing
 * externalReference. An ambiguous financial POST is NEVER repeated. */
export async function ensureOnlinePayment(id: string, input?: OnlineOrderInput) {
  await withPaymentLock(id, async () => {
    const [checkout] = await db.select().from(onlineCheckouts).where(eq(onlineCheckouts.id, id));
    if (!checkout) throw new OnlinePaymentError("Pedido não encontrado.", 404);
    if (checkout.environment !== asaasConfig().environment) throw new OnlinePaymentError("Este pedido pertence a outro ambiente de pagamento. Fale com a loja.", 409);
    const [order] = await db.select().from(orders).where(eq(orders.id, checkout.orderId));
    if (!order || order.status === "cancelled") return;
    let customerId = checkout.customerId;
    let payment = checkout.paymentId ? await getAsaasPayment(checkout.paymentId) : await findAsaasPayment(paymentReference(order.id));
    if (!payment) {
      if (checkout.paymentAttemptedAt) throw new OnlinePaymentError("A emissão ainda precisa de conferência no Asaas. O pedido está salvo e não será cobrado novamente. Consulte de novo ou fale com a loja.", 503, true);
      if (!customerId) {
        if (!input) throw new OnlinePaymentError("Retome o envio original para concluir o cadastro do pagamento.", 409);
        const reference = paymentReference(order.id);
        const found = await asaasRequest<{ data: { id: string; notificationDisabled: boolean }[] }>(`/customers?externalReference=${encodeURIComponent(reference)}&limit=100`);
        customerId = found.data.find(c => c.notificationDisabled)?.id ?? null;
        if (!customerId) {
          const customer = await asaasRequest<{ id: string }>("/customers", "POST", { name: order.customerName, cpfCnpj: input.cpf, mobilePhone: order.customerPhone, externalReference: reference, notificationDisabled: true });
          if (!customer.id) throw new OnlinePaymentError("O cadastro do pagamento ainda não foi confirmado.", 503, true);
          customerId = customer.id;
        }
        await db.update(onlineCheckouts).set({ customerId }).where(eq(onlineCheckouts.id, id));
      }
      await db.update(onlineCheckouts).set({ paymentAttemptedAt: new Date() }).where(eq(onlineCheckouts.id, id));
      const dueDate = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
      try {
        payment = await asaasRequest<AsaasPayment>("/payments", "POST", { customer: customerId, billingType: "PIX", value: order.totalCents / 100, dueDate, externalReference: paymentReference(order.id), description: `${order.brand} · Pedido ${order.id.slice(0, 8).toUpperCase()}`, postalService: false });
        if (!payment.id) throw new OnlinePaymentError("A emissão está aguardando confirmação no Asaas.", 503, true);
      } catch (error) {
        if (error instanceof OnlinePaymentError && !error.uncertain) await db.update(onlineCheckouts).set({ paymentAttemptedAt: null }).where(eq(onlineCheckouts.id, id));
        throw error;
      }
    }
    if (!customerId) throw new OnlinePaymentError("O cliente da cobrança precisa de conferência.", 409);
    assertPaymentMatches(payment, { paymentId: checkout.paymentId, customerId, orderId: order.id, totalCents: order.totalCents });
    await db.update(onlineCheckouts).set({ paymentId: payment.id }).where(eq(onlineCheckouts.id, id));
    await applyVerifiedPayment(id, payment);
    if (asaasPaymentState(payment) === "pending" && !checkout.pix) {
      const pix = await asaasRequest<PixCode>(`/payments/${encodeURIComponent(payment.id)}/pixQrCode`);
      if (!pix.payload || !pix.encodedImage) throw new OnlinePaymentError("O código Pix ainda não está disponível. Consulte novamente em instantes.");
      await db.update(onlineCheckouts).set({ pix }).where(eq(onlineCheckouts.id, id));
    }
  });
}

export async function applyVerifiedPayment(id: string, payment: AsaasPayment) {
  return db.transaction(async tx => {
    const [checkout] = await tx.select().from(onlineCheckouts).where(eq(onlineCheckouts.id, id)).for("update");
    if (!checkout || checkout.environment !== asaasConfig().environment || !checkout.customerId) throw new OnlinePaymentError("Cobrança não encontrada para este ambiente.", 409);
    const [order] = await tx.select().from(orders).where(eq(orders.id, checkout.orderId)).for("update");
    assertPaymentMatches(payment, { paymentId: checkout.paymentId, customerId: checkout.customerId, orderId: order.id, totalCents: order.totalCents });
    const state = asaasPaymentState(payment);
    // An old/pending response may never undo an already confirmed settlement.
    const effectiveState = checkout.paidAt && state === "pending" ? order.paymentStatus ?? "paid" : state;
    await tx.update(onlineCheckouts).set({ paymentId: payment.id, providerStatus: payment.status, lastCheckedAt: new Date(), ...(state === "paid" ? { paidAt: checkout.paidAt ?? new Date() } : {}) }).where(eq(onlineCheckouts.id, id));
    const release = state === "paid" && order.status === "pending";
    await tx.update(orders).set({ paymentStatus: effectiveState, ...(release ? { status: "confirmed" as const } : {}), ...(state === "failed" && ["pending", "confirmed"].includes(order.status ?? "") ? { status: "cancelled" as const } : {}) }).where(eq(orders.id, order.id));
    if (release) {
      const [table] = order.tableId ? await tx.select().from(restaurantTables).where(eq(restaurantTables.id, order.tableId)) : [];
      const ticket: KitchenTicket = {
        version: 2, orderId: order.id, orderNumber: order.id.slice(0, 8).toUpperCase(), brand: order.brand as KitchenTicket["brand"], channel: "online", orderType: order.orderType,
        tableNumber: table?.number ?? null, tableLabel: table?.label ?? null, customerName: order.customerName, customerPhone: order.customerPhone, deliveryAddress: order.deliveryAddress,
        items: (order.items as { name: string; qty: number; priceCents: number; notes: string | null }[]), notes: order.notes, createdAt: (order.createdAt ?? new Date()).toISOString(),
        payment: { method: "pix", status: "paid", label: "Pix pago" }, subtotalCents: order.subtotalCents, totalCents: order.totalCents, deliveryFeeCents: order.deliveryFeeCents, reprint: false,
      };
      await tx.insert(kitchenPrintJobs).values({ orderId: order.id, ticket }).onConflictDoNothing({ target: kitchenPrintJobs.orderId });
    }
  });
}

export async function onlineReceipt(id: string) {
  const [row] = await db.select({ checkout: onlineCheckouts, order: orders, tableNumber: restaurantTables.number }).from(onlineCheckouts)
    .innerJoin(orders, eq(orders.id, onlineCheckouts.orderId)).leftJoin(restaurantTables, eq(restaurantTables.id, orders.tableId)).where(eq(onlineCheckouts.id, id));
  if (!row) throw new OnlinePaymentError("Pedido não encontrado.", 404);
  return { checkoutId: id, orderId: row.order.id, orderNumber: row.order.id.slice(0, 8).toUpperCase(), brand: row.order.brand,
    orderType: row.order.orderType, tableNumber: row.tableNumber, status: row.order.status, paymentStatus: row.order.paymentStatus,
    subtotalCents: row.order.subtotalCents, deliveryFeeCents: row.order.deliveryFeeCents, totalCents: row.order.totalCents, items: row.order.items,
    pix: row.order.status !== "cancelled" && row.order.paymentStatus === "pending" ? row.checkout.pix : null,
    environment: row.checkout.environment, paidAt: row.checkout.paidAt, checkedAt: row.checkout.lastCheckedAt };
}

/** Cancel only an unpaid charge. A payment racing cancellation is reconciled
 * first, and a provider refusal never turns into a local cancellation. */
export async function cancelOnlineCheckout(id: string) {
  await withPaymentLock(id, async () => {
    const [checkout] = await db.select().from(onlineCheckouts).where(eq(onlineCheckouts.id, id));
    if (!checkout || checkout.environment !== asaasConfig().environment) throw new OnlinePaymentError("Pedido não encontrado neste ambiente.", 404);
    const [order] = await db.select().from(orders).where(eq(orders.id, checkout.orderId));
    if (order.paymentStatus === "paid") throw new OnlinePaymentError("O pagamento já foi confirmado. Fale com a loja para cancelar e conferir o estorno.", 409);
    if (order.status === "cancelled") return;
    const payment = checkout.paymentId ? await getAsaasPayment(checkout.paymentId) : await findAsaasPayment(paymentReference(order.id));
    if (!payment && checkout.paymentAttemptedAt) throw new OnlinePaymentError("A emissão ainda precisa de conferência no Asaas. Fale com a loja antes de cancelar.", 409);
    if (payment) {
      assertPaymentMatches(payment, { paymentId: checkout.paymentId, customerId: checkout.customerId!, orderId: order.id, totalCents: order.totalCents });
      if (asaasPaymentState(payment) === "paid") {
        await applyVerifiedPayment(id, payment);
        throw new OnlinePaymentError("O Pix já foi recebido. Fale com a loja para cancelar e conferir o estorno.", 409);
      }
      if (!payment.deleted) await asaasRequest(`/payments/${encodeURIComponent(payment.id)}`, "DELETE");
    }
    // Cancellation takes the same row lock as settlement. A webhook that won
    // the race must never be overwritten by this request.
    await db.transaction(async write => {
      await write.select().from(onlineCheckouts).where(eq(onlineCheckouts.id, id)).for("update");
      const [current] = await write.select().from(orders).where(eq(orders.id, order.id)).for("update");
      if (current.paymentStatus === "paid") throw new OnlinePaymentError("Pagamento recebido durante a consulta. Fale com a loja para conferir o cancelamento.", 409);
      await write.update(orders).set({ status: "cancelled", paymentStatus: "failed" }).where(eq(orders.id, order.id));
      await write.update(onlineCheckouts).set({ providerStatus: "DELETED", lastCheckedAt: new Date() }).where(eq(onlineCheckouts.id, id));
    });
  });
}
