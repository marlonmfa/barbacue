// PostgreSQL descartável + simulador local do C6 (mTLS/OAuth/Pix v2). Nunca
// acessa o banco real. Rode com DATABASE_URL apontando para *_online_test_*.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";

async function main() {
  const url = new URL(process.env.DATABASE_URL!);
  assert(["127.0.0.1", "localhost"].includes(url.hostname) && url.pathname.includes("online_test"), "Disposable local DB required");
  Object.assign(process.env, {
    PIX_PROVIDER: "c6", C6_ENVIRONMENT: "sandbox", C6_CLIENT_ID: "test-client", C6_CLIENT_SECRET: "test-secret", C6_PIX_KEY: "12345678000199",
    C6_CERT_PEM: "-----BEGIN CERTIFICATE-----\\ntest\\n-----END CERTIFICATE-----", C6_KEY_PEM: "-----BEGIN PRIVATE KEY-----\\ntest\\n-----END PRIVATE KEY-----",
    C6_WEBHOOK_TOKEN: "c6-test-webhook-secret-with-at-least-32-chars",
  });
  const pool = new Pool({ connectionString: url.href });
  const { setC6TransportForTests, c6Txid } = await import("../src/lib/c6-pix");
  const { POST } = await import("../src/app/api/checkout/route");
  const { GET, DELETE } = await import("../src/app/api/checkout/[id]/route");
  const { POST: webhook } = await import("../src/app/api/webhooks/c6/[token]/[[...path]]/route");
  const { reconcileOpenC6Checkouts } = await import("../src/lib/online-checkout");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- simulador do banco
  const cobs = new Map<string, Record<string, any>>();
  let puts = 0, auths = 0, mode = "normal";
  setC6TransportForTests(async (req, tls) => {
    const u = new URL(req.url);
    assert.equal(u.origin, "https://baas-api-sandbox.c6bank.info", "Real bank access is forbidden in this test");
    assert(tls.cert.includes("BEGIN CERTIFICATE") && tls.key.includes("PRIVATE KEY"), "mTLS identity on every call");
    if (u.pathname === "/v1/auth/") {
      auths++;
      assert(req.body?.includes("grant_type=client_credentials") && req.body.includes("client_id=test-client"));
      return { status: 200, text: JSON.stringify({ access_token: "tok", expires_in: 600 }) };
    }
    assert.equal(req.headers.Authorization, "Bearer tok");
    const m = u.pathname.match(/^\/v2\/pix\/cob\/([A-Za-z0-9]+)$/);
    assert(m, `Unknown bank operation ${u.pathname}`);
    const txid = m[1];
    if (req.method === "GET") { const c = cobs.get(txid); return c ? { status: 200, text: JSON.stringify(c) } : { status: 404, text: JSON.stringify({ title: "Cobrança não encontrada" }) }; }
    if (req.method === "PUT") {
      puts++;
      if (mode === "reject") return { status: 400, text: JSON.stringify({ title: "Cobrança inválida", detail: "teste" }) };
      if (cobs.has(txid)) return { status: 400, text: JSON.stringify({ title: "txid duplicado" }) };
      const body = JSON.parse(req.body!);
      assert.equal(body.chave, "12345678000199");
      const cob = { ...body, txid, status: "ATIVA", revisao: 0, calendario: { ...body.calendario, criacao: new Date().toISOString() }, pixCopiaECola: `00020101021226-c6-${txid}6304ABCD` };
      if (mode !== "timeout-without-result") cobs.set(txid, cob);
      if (mode.startsWith("timeout")) throw new Error("simulated lost response");
      return { status: 201, text: JSON.stringify(cob) };
    }
    if (req.method === "PATCH") {
      const c = cobs.get(txid)!;
      if (c.status !== "ATIVA") return { status: 400, text: JSON.stringify({ title: "Cobrança não pode ser alterada" }) };
      c.status = JSON.parse(req.body!).status; return { status: 200, text: JSON.stringify(c) };
    }
    throw new Error(`Unexpected ${req.method}`);
  });
  const pay = (txid: string, valor?: string) => { const c = cobs.get(txid)!; c.status = "CONCLUIDA"; c.pix = [{ endToEndId: `E${txid}`, txid, valor: valor ?? c.valor.original, horario: new Date().toISOString() }]; };

  let assertions = 0;
  const check = (condition: unknown, message: string) => { assert(condition, message); assertions++; };
  const counts = async (id: string) => (await pool.query("SELECT o.*, (SELECT count(*)::int FROM kitchen_print_jobs j WHERE j.order_id=o.id) jobs FROM orders o WHERE o.id=$1", [id])).rows[0];
  const post = async (input: unknown) => { const r = await POST(new Request("http://localhost/api/checkout", { method: "POST", body: JSON.stringify(input), headers: { "x-forwarded-for": "test-c6" } })); return { status: r.status, data: await r.json() }; };
  const hook = (txids: string[], token = process.env.C6_WEBHOOK_TOKEN!) => webhook(new Request(`http://localhost/api/webhooks/c6/${token}/pix`, { method: "POST", body: JSON.stringify({ pix: txids.map(txid => ({ txid, endToEndId: `E${txid}`, valor: "999.99" })) }) }), { params: Promise.resolve({ token, path: ["pix"] }) });
  let productId: number;
  const order = (extra = {}) => ({ requestId: randomUUID(), accessToken: "c".repeat(64), brand: "barbacue", customerName: "Cliente C6", customerPhone: "47999999999", cpf: "52998224725", orderType: "pickup", items: [{ productId, qty: 2 }], ...extra });
  try {
    check((await pool.query("SELECT count(*)::int n FROM orders")).rows[0].n === 0, "Own an empty disposable database");
    await pool.query("INSERT INTO store_settings(id,store_name,is_open) VALUES(1,'C6 Test',true)");
    productId = (await pool.query("INSERT INTO products(name,price_cents,promo_price_cents,available) VALUES('Burger C6',3000,2500,true) RETURNING id")).rows[0].id;

    const first = order();
    const parallel = await Promise.all(Array.from({ length: 10 }, () => post(first)));
    check(parallel.every(r => r.status === 201) && new Set(parallel.map(r => r.data.orderId)).size === 1, "Concurrent retries keep one order");
    check(puts === 1 && auths === 1, "One charge and one cached OAuth token across retries");
    const receipt = parallel[0].data; const txid = c6Txid(first.requestId);
    const cob = cobs.get(txid)!;
    check(cob.valor.original === "50.00" && cob.devedor.cpf === "52998224725" && cob.devedor.nome === "Cliente C6", "Canonical price and payer sent to the bank");
    check(receipt.pix.payload === cob.pixCopiaECola && receipt.pix.encodedImage.length > 200 && receipt.environment === "sandbox", "Pix copia e cola and locally rendered QR Code");
    check((await counts(receipt.orderId)).jobs === 0, "Unpaid order never reaches the kitchen");

    check((await hook([txid], "x".repeat(45))).status === 401, "Webhook with wrong path secret rejected");
    check((await hook([txid])).status === 200 && (await counts(receipt.orderId)).payment_status === "pending", "Webhook body alone cannot settle an unpaid charge");
    pay(txid, "1.00");
    await hook([txid]);
    check((await counts(receipt.orderId)).payment_status === "pending", "Underpaid charge is not released");
    pay(txid);
    const repeated = await Promise.all(Array.from({ length: 6 }, () => hook([txid, "outrosistema0000000000000000000"])));
    check(repeated.every(r => r.status === 200), "Repeated webhooks and foreign txids acknowledged");
    let row = await counts(receipt.orderId);
    check(row.payment_status === "paid" && row.status === "confirmed" && row.jobs === 1, "Bank-verified payment releases exactly one kitchen ticket");
    cob.pix[0].devolucoes = [{ id: "D1", status: "DEVOLVIDO", valor: "50.00" }];
    await hook([txid]);
    row = await counts(receipt.orderId);
    check(row.payment_status === "failed" && row.jobs === 1, "Refund marks payment failed without reprinting");

    mode = "timeout-with-result";
    const lost = order(); const lostFirst = await post(lost);
    check(lostFirst.status === 201 && !lostFirst.data.pix, "Lost bank response keeps the pending order");
    mode = "normal"; const before = puts;
    const recovered = await post(lost);
    check(recovered.data.pix && puts === before, "Lost PUT recovered by txid without a second charge");
    mode = "timeout-without-result";
    const never = order(); await post(never);
    mode = "normal"; const retry = await post(never);
    check(retry.data.pix && cobs.has(c6Txid(never.requestId)), "Charge that never reached the bank is created on retry with the same txid");

    mode = "reject"; const rejected = order(); const rej = await post(rejected);
    check(rej.status === 201 && !rej.data.pix, "Rejected charge keeps order pending without Pix");
    mode = "normal"; check((await post(rejected)).data.pix, "Rejected charge may be retried after correction");

    const cancelled = order(); const pending = await post(cancelled);
    const del = await DELETE(new Request("http://localhost/x", { method: "DELETE", headers: { Authorization: `Bearer ${cancelled.accessToken}` } }), { params: Promise.resolve({ id: cancelled.requestId }) });
    check(del.status === 200 && cobs.get(c6Txid(cancelled.requestId))!.status === "REMOVIDA_PELO_USUARIO_RECEBEDOR" && (await counts(pending.data.orderId)).status === "cancelled", "Cancel removes the bank charge before closing the order");

    const paidRace = order(); const raced = await post(paidRace); pay(c6Txid(paidRace.requestId));
    const delPaid = await DELETE(new Request("http://localhost/x", { method: "DELETE", headers: { Authorization: `Bearer ${paidRace.accessToken}` } }), { params: Promise.resolve({ id: paidRace.requestId }) });
    check(delPaid.status === 409 && (await counts(raced.data.orderId)).payment_status === "paid", "Paid charge cannot be cancelled and is settled instead");

    const closedTab = order(); const ct = await post(closedTab); pay(c6Txid(closedTab.requestId));
    await reconcileOpenC6Checkouts();
    check((await counts(ct.data.orderId)).payment_status === "paid", "Store reconciliation confirms Pix paid with the tab closed and no webhook");

    const polled = order(); const pr = await post(polled); pay(c6Txid(polled.requestId));
    await pool.query("UPDATE online_checkouts SET last_checked_at=now()-interval '1 minute' WHERE id=$1", [polled.requestId]);
    const g = await GET(new Request("http://localhost/x", { headers: { Authorization: `Bearer ${polled.accessToken}` } }), { params: Promise.resolve({ id: polled.requestId }) });
    check(g.status === 200 && (await g.json()).paymentStatus === "paid" && (await counts(pr.data.orderId)).jobs === 1, "Customer polling confirms payment");

    console.log(JSON.stringify({ success: true, assertions, simulatedPuts: puts, database: url.pathname.slice(1) }));
  } finally { setC6TransportForTests(null); await pool.end(); }
}
main().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
