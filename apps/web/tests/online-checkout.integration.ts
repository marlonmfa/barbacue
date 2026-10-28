// Real disposable PostgreSQL + deterministic provider simulation. Never charges
// a real Asaas account. Run with DATABASE_URL pointing to *_online_test_*.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { config } from "dotenv";

async function main() {
  config({ path: "tmp/online-checkout-20261024/test.env", override: false, quiet: true });
  const url = new URL(process.env.DATABASE_URL!);
  assert(["127.0.0.1", "localhost"].includes(url.hostname) && url.pathname.includes("online_test"), "Disposable local DB required");
  process.env.ASAAS_ENVIRONMENT = "sandbox"; process.env.ASAAS_API_KEY = "test-only-never-a-real-key"; process.env.ASAAS_WEBHOOK_TOKEN = "test-webhook-secret-with-at-least-32-chars";
  const pool = new Pool({ connectionString: url.href });
  const { POST } = await import("../src/app/api/checkout/route");
  const { GET, DELETE } = await import("../src/app/api/checkout/[id]/route");
  const { POST: webhook } = await import("../src/app/api/webhooks/asaas/route");
  const { ensureOnlinePayment, applyVerifiedPayment, authorizedCheckout } = await import("../src/lib/online-checkout");
  const { paymentReference } = await import("../src/lib/online-payment");
  const remoteCustomers: Record<string, unknown>[] = [];
  const remotePayments: Record<string, unknown>[] = [];
  let paymentsCreated = 0, mode = "normal";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (request, init) => {
    const u = new URL(String(request));
    assert.equal(u.origin, "https://api-sandbox.asaas.com", "Real provider access is forbidden in this test");
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    if (u.pathname === "/v3/customers") {
      if (method === "GET") return Response.json({ data: remoteCustomers.filter(c => c.externalReference === u.searchParams.get("externalReference")) });
      const c = { ...body, id: `cus_test_${remoteCustomers.length + 1}` }; remoteCustomers.push(c); return Response.json(c);
    }
    if (u.pathname === "/v3/payments") {
      if (method === "GET") return Response.json({ data: remotePayments.filter(p => p.externalReference === u.searchParams.get("externalReference")), hasMore: false });
      paymentsCreated++;
      const p = { ...body, id: `pay_test_${paymentsCreated}`, status: "PENDING" };
      if (mode === "reject") return Response.json({ errors: [] }, { status: 400 });
      if (mode !== "timeout-without-result") remotePayments.push(p);
      if (mode.startsWith("timeout")) throw new TypeError("simulated lost response");
      return Response.json(p);
    }
    if (u.pathname.endsWith("/pixQrCode")) return Response.json({ payload: "000201-test-pix", encodedImage: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lWQAAAAASUVORK5CYII=", expirationDate: "2027-01-01 23:59:59" });
    const payment = remotePayments.find(p => u.pathname === `/v3/payments/${p.id}`);
    assert(payment, `Unknown provider operation ${u.pathname}`);
    if (method === "DELETE") { payment.deleted = true; return Response.json({ deleted: true, id: payment.id }); }
    return Response.json(payment);
  };
  let assertions = 0;
  const check = (condition: unknown, message: string) => { assert(condition, message); assertions++; };
  const counts = async (id: string) => (await pool.query("SELECT o.*, (SELECT count(*)::int FROM kitchen_print_jobs j WHERE j.order_id=o.id) jobs FROM orders o WHERE o.id=$1", [id])).rows[0];
  const post = async (input: unknown) => { const r = await POST(new Request("http://localhost/api/checkout", { method: "POST", body: JSON.stringify(input), headers: { "x-forwarded-for": "test-integration" } })); return { status: r.status, data: await r.json() }; };
  let productId: number;
  const order = (extra = {}) => ({ requestId: randomUUID(), accessToken: "a".repeat(64), brand: "barbacue", customerName: "Cliente Teste", customerPhone: "47999999999", cpf: "52998224725", orderType: "pickup", items: [{ productId, qty: 2, notes: "Sem cebola" }], ...extra });
  const sendWebhook = async (payment: Record<string, unknown>, token = process.env.ASAAS_WEBHOOK_TOKEN) => webhook(new Request("http://localhost/api/webhooks/asaas", { method: "POST", headers: { "asaas-access-token": token! }, body: JSON.stringify({ event: "PAYMENT_RECEIVED", payment }) }));
  try {
    check((await pool.query("SELECT count(*)::int n FROM orders")).rows[0].n === 0, "Own an empty disposable database");
    await pool.query("INSERT INTO store_settings(id,store_name,is_open) VALUES(1,'Checkout Test',true)");
    productId = (await pool.query("INSERT INTO products(name,price_cents,promo_price_cents,available) VALUES('Burger Test',3000,2500,true) RETURNING id")).rows[0].id;
    const managed = (await pool.query("INSERT INTO brand_catalog_products(brand,external_id,name,category,price_cents) VALUES('barbadog','dog-test','Dog Test','Dogs',1700) RETURNING id")).rows[0].id;
    const first = order();
    const simultaneous = await Promise.all(Array.from({ length: 12 }, () => post(first)));
    check(simultaneous.every(r => r.status === 201), "Concurrent retries succeed without pool starvation");
    check(new Set(simultaneous.map(r => r.data.orderId)).size === 1, "One order across concurrent retries");
    check(paymentsCreated === 1, "One financial POST across concurrent retries");
    const receipt = simultaneous[0].data;
    check(receipt.totalCents === 5000 && receipt.pix.payload === "000201-test-pix", "Canonical promotional price and provider Pix");
    let row = await counts(receipt.orderId);
    check(row.jobs === 0 && row.status === "pending" && row.payment_status === "pending", "Unpaid orders have no print ticket and cannot enter production");
    check((await post({ ...first, notes: "changed" })).status === 409, "Same id cannot create a different order");
    await assert.rejects(() => authorizedCheckout(first.requestId, "b".repeat(64))); assertions++;
    const bad = await GET(new Request("http://localhost/api/checkout", { headers: { Authorization: `Bearer ${"b".repeat(64)}` } }), { params: Promise.resolve({ id: first.requestId }) });
    check(bad.status === 404, "Order polling requires the original capability");
    const remote = remotePayments[0];
    check((await sendWebhook({ ...remote, status: "RECEIVED" }, "invalid")).status === 401, "Unauthenticated webhook rejected");
    await sendWebhook({ ...remote, status: "RECEIVED" });
    check((await counts(receipt.orderId)).payment_status === "pending", "Forged payload cannot settle a pending provider payment");
    remote.status = "RECEIVED";
    const confirmations = await Promise.all(Array.from({ length: 8 }, () => sendWebhook(remote)));
    check(confirmations.every(r => r.status === 200), "Duplicate authenticated webhooks are acknowledged");
    row = await counts(receipt.orderId);
    check(row.jobs === 1 && row.status === "confirmed" && row.payment_status === "paid", "Payment and exactly one production ticket commit together");
    const job = (await pool.query("SELECT ticket FROM kitchen_print_jobs WHERE order_id=$1", [receipt.orderId])).rows[0];
    check(job.ticket.payment.status === "paid" && job.ticket.items[0].notes === "Sem cebola", "Kitchen sees paid status and item notes");
    await pool.query("UPDATE orders SET status='preparing' WHERE id=$1", [receipt.orderId]);
    await sendWebhook(remote);
    check((await counts(receipt.orderId)).status === "preparing", "Repeated payment does not reset kitchen progress");
    await applyVerifiedPayment(first.requestId, { ...remote, status: "PENDING" } as never);
    check((await counts(receipt.orderId)).payment_status === "paid", "Stale pending response cannot undo settlement");
    const tampered = { ...remote, value: 1 };
    await assert.rejects(() => applyVerifiedPayment(first.requestId, tampered as never)); assertions++;
    remote.status = "REFUNDED"; await sendWebhook(remote);
    check((await counts(receipt.orderId)).payment_status === "failed", "Refund updates payment state without another production ticket");

    mode = "timeout-with-result";
    const lost = order(); const lostFirst = await post(lost);
    check(lostFirst.status === 201 && !lostFirst.data.pix, "Lost provider response retains the original pending order");
    const beforeRecovery = paymentsCreated; mode = "normal";
    const recovered = await post(lost);
    check(recovered.data.orderId === lostFirst.data.orderId && recovered.data.pix && paymentsCreated === beforeRecovery, "Recover monetary POST via externalReference without issuing again");
    mode = "timeout-without-result";
    const unknown = order(); await post(unknown); const beforeUnknown = paymentsCreated;
    mode = "normal"; await post(unknown); await post(unknown);
    check(paymentsCreated === beforeUnknown, "Uncertain financial POST with no found payment is never repeated");

    const dog = await post(order({ brand: "barbadog", items: [{ productId: managed, qty: 1 }] }));
    check(dog.status === 201 && dog.data.totalCents === 1700 && dog.data.brand === "barbadog", "Restaurant catalog and order remain separate");
    check((await post(order({ brand: "chelas", items: [{ productId: managed, qty: 1 }] }))).status === 422, "Products from another restaurant rejected");
    const tableToken = randomUUID(); await pool.query("INSERT INTO restaurant_tables(number,token) VALUES(88,$1)", [tableToken]);
    const tableOrder = await post(order({ orderType: "dine_in", tableToken }));
    check(tableOrder.status === 201 && tableOrder.data.tableNumber === 88, "Table QR keeps verified dine-in destination");
    const cancelled = order(); const pending = await post(cancelled);
    const cancellation = await DELETE(new Request("http://localhost/api/checkout", { method: "DELETE", headers: { Authorization: `Bearer ${cancelled.accessToken}` } }), { params: Promise.resolve({ id: cancelled.requestId }) });
    check(cancellation.status === 200 && (await counts(pending.data.orderId)).status === "cancelled", "Unpaid cancellation removes provider charge before closing local order");
    check((await counts(pending.data.orderId)).jobs === 0, "Cancelled unpaid order never prints");

    const racing = order(); const beforeRace = await post(racing);
    const racingPayment = remotePayments.find(p => p.externalReference === paymentReference(beforeRace.data.orderId))!;
    await pool.query("UPDATE online_checkouts SET payment_id=null WHERE id=$1", [racing.requestId]);
    racingPayment.status = "RECEIVED"; await sendWebhook(racingPayment);
    check((await counts(beforeRace.data.orderId)).payment_status === "paid", "Webhook recovers payment id when it races initial creation response");

    // A valid provider confirmation must roll back if the kitchen queue cannot
    // persist. The callback remains retryable and no half-paid order leaks out.
    const atomic = order(); const atomicReceipt = await post(atomic);
    const atomicPayment = remotePayments.find(p => p.externalReference === paymentReference(atomicReceipt.data.orderId))!;
    atomicPayment.status = "RECEIVED";
    await pool.query(`CREATE FUNCTION reject_test_ticket() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'simulated queue outage'; END; $$ LANGUAGE plpgsql; CREATE TRIGGER test_queue_failure BEFORE INSERT ON kitchen_print_jobs FOR EACH ROW EXECUTE FUNCTION reject_test_ticket()`);
    check((await sendWebhook(atomicPayment)).status === 503, "Queue outage asks provider to retry callback");
    check((await counts(atomicReceipt.data.orderId)).payment_status === "pending", "Queue failure rolls back payment and production release together");
    await pool.query("DROP TRIGGER test_queue_failure ON kitchen_print_jobs; DROP FUNCTION reject_test_ticket()");
    check((await sendWebhook(atomicPayment)).status === 200 && (await counts(atomicReceipt.data.orderId)).jobs === 1, "Callback retry completes atomic settlement once queue recovers");

    // Quote must belong to the restaurant/address and contributes to the
    // immutable payment amount. No configuration can imply free delivery.
    check((await post(order({ orderType: "delivery", deliveryAddress: "Rua Teste, 100, Centro, Jaraguá do Sul" }))).status === 422, "Delivery disabled never becomes free delivery");
    await pool.query("INSERT INTO delivery_settings(id,enabled) VALUES(1,true)");
    const quoteId = randomUUID();
    const deliveryAddress = "Rua Teste, 100, Centro, Jaraguá do Sul";
    const { deliveryAddressKey } = await import("../src/lib/delivery");
    await pool.query(`INSERT INTO delivery_quotes(id,brand,address,address_key,provider,distance_meters,duration_seconds,fee_cents,origin_latitude,origin_longitude,destination_latitude,destination_longitude,route_links,expires_at) VALUES($1,'barbacue',$2,$3,'osm',2500,600,850,-26.48,-49.07,-26.49,-49.08,$4,now()+interval '10 minutes')`, [quoteId, deliveryAddress, deliveryAddressKey(deliveryAddress), JSON.stringify({ google: "https://www.google.com/maps", apple: "https://maps.apple.com", osm: "https://www.openstreetmap.org" })]);
    const deliveryInput = order({ orderType: "delivery", deliveryAddress, deliveryQuoteId: quoteId });
    const delivered = await post(deliveryInput);
    check(delivered.status === 201 && delivered.data.totalCents === 5850 && delivered.data.deliveryFeeCents === 850, "Payment includes canonical delivery quote");
    check((await post(order({ orderType: "delivery", deliveryAddress: deliveryAddress + " outro", deliveryQuoteId: quoteId }))).status === 422, "Quote for another address rejected");
    await pool.query("UPDATE delivery_quotes SET expires_at=now()-interval '1 minute' WHERE id=$1", [quoteId]);
    check((await post(order({ orderType: "delivery", deliveryAddress, deliveryQuoteId: quoteId }))).status === 422, "Expired delivery quote rejected");
    mode = "reject"; const rejected = order(); await post(rejected); const beforeRetry = paymentsCreated;
    mode = "normal"; const retried = await post(rejected);
    check(retried.data.pix && paymentsCreated === beforeRetry + 1, "Definitively rejected financial POST may be retried after correction");

    await pool.query("UPDATE store_settings SET is_open=false WHERE id=1");
    check((await post(first)).status === 201, "Accepted order remains recoverable after closing time");
    check((await post(order())).status === 422, "Closed store rejects new orders");
    console.log(JSON.stringify({ success: true, assertions, simulatedPaymentPosts: paymentsCreated, database: url.pathname.slice(1) }));
  } finally { globalThis.fetch = originalFetch; await pool.end(); }
}
main().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
