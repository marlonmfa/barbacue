import assert from "node:assert/strict";
import { randomBytes, randomUUID, scryptSync } from "node:crypto";
import { readFile } from "node:fs/promises";
import { request } from "@playwright/test";
import { Pool } from "pg";
import { ifoodLocalId } from "../src/lib/ifood";

async function main() {
  const database = new URL(process.env.DATABASE_URL ?? "");
  const server = new URL(process.env.DISPATCH_TEST_URL ?? "");
  const trace = process.env.IFOOD_TEST_TRACE;
  assert(database.hostname === "127.0.0.1" && database.pathname.startsWith("/barbacue_dispatch_test_"));
  assert.equal(server.hostname, "127.0.0.1");
  assert(trace);
  const { recordIfoodEvent, storeIfoodEvent } = await import("../../../packages/ifood/src/order-store");
  const db = new Pool({ connectionString: database.href });
  const browser = await request.newContext({ baseURL: server.href });
  const orderId = "97bf281a-e571-41c8-b240-dcc3bee76097";
  const merchantId = "403af0c6-176b-4021-a6cd-3e09dca09cbf";
  const id = ifoodLocalId(orderId);
  const orderPath = `/api/admin/ifood/orders/${id}`;
  const path = `${orderPath}/logistics`;
  const password = randomBytes(16).toString("hex");
  const salt = randomBytes(16);
  const hash = `${salt.toString("hex")}:${scryptSync(password, salt, 64).toString("hex")}`;

  async function event(code: string) {
    const event = { id: randomUUID(), code, orderId, merchantId, createdAt: new Date().toISOString() };
    await recordIfoodEvent(event, "barbacue", false);
    await storeIfoodEvent(event, null, "barbacue", false);
  }
  async function checkStatus(expected: string) {
    const { rows } = await db.query("select status from orders where id=$1", [id]);
    assert.equal(rows[0].status, expected);
  }
  async function checkDispatch(inPreparation: number, awaitingDispatch: number, dispatched: number) {
    const reply = await browser.get("/api/admin/dispatch");
    assert.equal(reply.status(), 200);
    const state = await reply.json();
    assert.deepEqual(state.ifood, { inPreparation, awaitingDispatch, dispatched });
    assert.equal(state.readyWithoutRoute, 0);
  }
  async function next(expected: string | null) {
    const response = await browser.get(path);
    assert.equal(response.status(), 200, await response.text());
    const state = await response.json();
    assert.equal(state.next, expected);
    return state;
  }
  async function action(action: string, status: number, data: object = {}) {
    const response = await browser.post(path, { data: { action, ...data } });
    assert.equal(response.status(), status, await response.text());
  }

  try {
    await db.query(`CREATE TABLE IF NOT EXISTS ifood_order_events (
      id text primary key, order_external_id text not null, merchant_id text, brand text, code text not null,
      full_code text, dispute_id text, payload jsonb not null, created_at timestamptz not null)`);
    await db.query("insert into staff_users(name,username,password_hash,role) values ('Homologação','ifood-fixture',$1,'admin')", [hash]);
    await db.query(`insert into orders(id,brand,customer_name,customer_phone,items,subtotal_cents,total_cents,channel,status,order_type,notes)
      values ($1,'barbacue','Homologação','','[]',500,500,'ifood','confirmed','delivery',$2)`,
    [id, `Pedido externo: ${orderId}\nLoja iFood: ${merchantId}`]);
    assert.equal((await browser.get(path)).status(), 401);
    assert.equal((await browser.post("/api/admin/auth", { data: { username: "ifood-fixture", password } })).status(), 200);
    assert.equal((await browser.patch(`/api/admin/orders/${id}`, { data: { status: "ready" } })).status(), 409);
    assert.equal((await browser.post(orderPath, { data: { action: "dispatch" } })).status(), 409);
    assert.equal((await browser.patch("/api/admin/kitchen", { data: { id, status: "preparing" } })).status(), 202);
    await checkStatus("confirmed");
    await event("PRS");
    await checkStatus("preparing");
    await checkDispatch(1, 0, 0);
    await next("assignDriver");
    await action("assignDriver", 202, { workerName: "Entregador de teste", workerPhone: "47990000000", workerVehicleType: "MOTORCYCLE" });
    await action("goingToOrigin", 409);
    await event("ADR");
    await action("goingToOrigin", 202);
    await event("GTO");
    await action("arrivedAtOrigin", 202);
    await event("AAO");
    assert.equal((await next(null)).waitingForReady, true);
    await action("dispatch", 409);
    assert.equal((await browser.patch("/api/admin/kitchen", { data: { id, status: "ready" } })).status(), 202);
    await checkStatus("preparing");
    await action("dispatch", 409);
    await event("RTP");
    await checkStatus("ready");
    await checkDispatch(0, 1, 0);
    await next("dispatch");
    await action("dispatch", 202);
    await event("DSP");
    await checkDispatch(0, 0, 1);
    await action("arrivedAtDestination", 202);
    await event("AAD");
    await next(null);
    await action("verifyDeliveryCode", 409, { code: "1234" });
    await event("DDCR");
    await action("verifyDeliveryCode", 422, { code: "0000" });
    await action("verifyDeliveryCode", 202, { code: "1234" });
    await event("DDCS");
    await next(null);
    await event("CON");
    await checkStatus("delivered");
    await checkDispatch(0, 0, 0);
    assert.deepEqual((await readFile(trace, "utf8")).trim().split("\n"), [
      "order/startPreparation", "logistics/assignDriver", "logistics/goingToOrigin", "logistics/arrivedAtOrigin",
      "order/readyToPickup", "logistics/dispatch", "logistics/arrivedAtDestination",
      "logistics/verifyDeliveryCode", "logistics/verifyDeliveryCode",
    ]);
    console.log("Cozinha, credenciais por módulo, eventos persistidos, saída e validação do código verificados com iFood simulado.");
  } finally {
    await browser.dispose();
    await db.end();
  }
}

void main().catch(error => { console.error(error); process.exitCode = 1; });
