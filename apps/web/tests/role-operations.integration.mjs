// Disposable local DB only. Exercises real server authorization and screenshots
// of each operational role; does not change delivery configuration or store hours.
// ROLE_TEST_URL=http://127.0.0.1:3099 ROLE_TEST_PASSWORD=... DATABASE_URL=... node tests/role-operations.integration.mjs
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import playwright from "../../../node_modules/playwright/index.js";
const { chromium } = playwright;

const base = process.env.ROLE_TEST_URL;
const database = process.env.DATABASE_URL;
assert(base && ["localhost", "127.0.0.1"].includes(new URL(base).hostname), "Local web server required");
assert(database && ["localhost", "127.0.0.1"].includes(new URL(database).hostname) && new URL(database).pathname.includes("test"), "Disposable local test database required");
const pool = new pg.Pool({ connectionString: database });
const suffix = Date.now().toString();
const password = "roles-test-password-2026";
const users = [], orderIds = [], tableIds = [];
const screenshots = path.resolve(import.meta.dirname, "../../../test-screenshots");
fs.mkdirSync(screenshots, { recursive: true });
const stamp = process.env.STAMP || "2026-09-08";
let checks = 0;
let loginIp = 1;
const check = (condition, message) => { assert(condition, message); checks++; };
async function request(route, { cookie, method = "GET", body } = {}) {
  // Each simulated staff member has a distinct test-only source IP so the
  // eight-attempt login guard is exercised independently of this multi-role run.
  const response = await fetch(base + route, { method, redirect: "manual", headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}), ...(route === "/api/admin/auth" ? { "x-forwarded-for": `198.51.100.${loginIp++}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const data = response.headers.get("content-type")?.includes("application/json") ? await response.json() : await response.text();
  return { response, data };
}
function status(result, expected) { assert.equal(result.response.status, expected, JSON.stringify(result.data).slice(0, 500)); checks++; return result.data; }
function cookie(result) { return result.response.headers.getSetCookie().map(value => value.split(";")[0]).join("; "); }
let browser;
const pageErrors = [];
async function capture(page, name) {
  await page.evaluate(async () => { await document.fonts.ready; window.scrollTo(0, 0); });
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  const width = await page.evaluate(() => ({ content: document.documentElement.scrollWidth, viewport: window.innerWidth }));
  check(width.content <= width.viewport + 1, `${name}: no horizontal overflow (${width.content}/${width.viewport})`);
  await page.screenshot({ path: path.join(screenshots, `${name}-${stamp}.png`) });
  console.log(`Screenshot: ${name} (${checks} checks so far)`);
}
try {
  status(await request("/api/admin/delivery"), 401);
  status(await request("/api/admin/waiter"), 401);
  const master = await request("/api/admin/auth", { method: "POST", body: { password: process.env.ROLE_TEST_PASSWORD } });
  status(master, 200); const admin = cookie(master);
  async function account(role, name, extra = {}) {
    const username = `role-${role}-${users.length}-${suffix}`;
    const created = status(await request("/api/admin/staff", { cookie: admin, method: "POST", body: { role, name, username, password, ...extra } }), 201);
    users.push(created.id);
    const login = await request("/api/admin/auth", { method: "POST", body: { username, password } });
    status(login, 200);
    return { ...created, username, cookie: cookie(login) };
  }
  const manager = await account("manager", "Marina Costa", { jobTitle: "Gerente de turno" });
  const cashier = await account("cashier", "Camila Souza", { jobTitle: "Caixa" });
  const kitchen = await account("kitchen", "Rafael Lima", { jobTitle: "Cozinha" });
  const waiter = await account("waiter", "Pedro Alves", { jobTitle: "Salão" });
  const driver = await account("driver", "Lucas Santos", { jobTitle: "Entregador" });
  const otherDriver = await account("driver", "Outra rota"), employee = await account("employee", "Equipe de apoio", { permissions: ["deliveries"] });
  const revokedDriver = await account("driver", "Acesso revogado", { permissions: [] });
  const disabledDriver = await account("driver", "Conta desativada");
  status(await request(`/api/admin/staff/${disabledDriver.id}`, { cookie: admin, method: "PATCH", body: { active: false } }), 200);
  for (const [person, landing] of [[manager, "/admin"], [cashier, "/admin/orders"], [kitchen, "/admin/kitchen"], [waiter, "/admin/waiter"], [driver, "/admin/delivery"]]) {
    const result = await request("/", { cookie: person.cookie });
    check(result.response.headers.get("location") === landing || String(result.data).includes(`url=${landing}`), `${person.role} must land at ${landing}`);
  }
  for (const person of [waiter, driver]) for (const route of ["/api/admin/orders", "/api/admin/customers", "/api/admin/tables", "/api/admin/staff", "/api/admin/delivery-settings"]) status(await request(route, { cookie: person.cookie }), 403);
  status(await request("/api/admin/waiter", { cookie: driver.cookie }), 403);
  status(await request("/api/admin/delivery", { cookie: waiter.cookie }), 403);
  status(await request("/api/admin/delivery", { cookie: revokedDriver.cookie }), 403);
  status(await request("/api/admin/delivery", { cookie: disabledDriver.cookie }), 401);
  status(await request("/api/admin/delivery-settings", { cookie: manager.cookie }), 200);
  status(await request("/api/admin/delivery-settings", { cookie: cashier.cookie }), 403);
  const existingTables = new Set((await pool.query("SELECT number FROM restaurant_tables")).rows.map(row => row.number));
  async function table(preferred, label) {
    while (existingTables.has(preferred)) preferred++;
    existingTables.add(preferred);
    const { rows } = await pool.query("INSERT INTO restaurant_tables(number,label) VALUES($1,$2) RETURNING id,number,token", [preferred, label]);
    tableIds.push(rows[0].id); return rows[0];
  }
  const terrace = await table(7, "Varanda"), inside = await table(8, "Salão interno");
  async function order(overrides = {}) {
    const data = { id: randomUUID(), brand: "barbacue", customer_name: "Cliente da entrega", customer_phone: "5547999990000", delivery_address: "Rua Reinoldo Rau, 250, Centro, Jaraguá do Sul", items: [{ name: "Burger da casa", qty: 2, priceCents: 2400, notes: "Um sem cebola" }], subtotal_cents: 4800, total_cents: 5400, delivery_fee_cents: 600, delivery_distance_meters: 4300, delivery_duration_seconds: 780, status: "ready", order_type: "delivery", payment_method: "cash", payment_status: "pending", notes: "Entregar na portaria.", ...overrides };
    const entries = Object.entries(data);
    await pool.query(`INSERT INTO orders(${entries.map(([key]) => key).join(",")}) VALUES(${entries.map((_, index) => `$${index + 1}`).join(",")})`, entries.map(([key, value]) => key === "items" ? JSON.stringify(value) : value));
    orderIds.push(data.id); return data;
  }
  const dineIn = await order({ order_type: "dine_in", table_id: terrace.id, customer_name: "Dados privados da mesa", customer_phone: "secret-floor-phone", delivery_address: null, delivery_fee_cents: 0, total_cents: 4800, notes: "Levar os molhos à parte." });
  const preparing = await order({ order_type: "dine_in", table_id: inside.id, status: "preparing", delivery_address: null, delivery_fee_cents: 0, total_cents: 4800, notes: "" });
  const pickup = await order({ order_type: "pickup", delivery_address: null });
  const own = await order({ customer_name: "Ana Martins", change_for_cents: 10000 });
  const foreign = await order({ delivery_driver_id: otherDriver.id, delivery_status: "assigned", customer_name: "Cliente privado de outra rota" });
  const notReady = await order({ delivery_driver_id: driver.id, delivery_status: "assigned", status: "preparing", customer_name: "Bruno Oliveira", payment_status: "paid" });
  const canceled = await order({ delivery_driver_id: driver.id, delivery_status: "assigned", status: "cancelled" });
  const floor = status(await request("/api/admin/waiter", { cookie: waiter.cookie }), 200);
  check(floor.tables.some(row => row.id === terrace.id && row.token === terrace.token), "floor gets active table access for entering orders");
  check(floor.orders.some(row => row.id === dineIn.id), "floor sees dine-in ready order");
  check(!floor.orders.some(row => [own.id, pickup.id].includes(row.id)), "floor cannot see delivery or pickup orders");
  const floorOrder = floor.orders.find(row => row.id === dineIn.id);
  for (const key of ["customerName", "customerPhone", "totalCents", "paymentMethod", "deliveryAddress"]) check(!(key in floorOrder), `floor omits ${key}`);
  check(!("priceCents" in floorOrder.items[0]), "floor omits item prices");
  status(await request("/api/admin/waiter", { cookie: waiter.cookie, method: "PATCH", body: { id: preparing.id, status: "delivered" } }), 409);
  status(await request("/api/admin/waiter", { cookie: waiter.cookie, method: "PATCH", body: { id: own.id, status: "delivered" } }), 409);
  status(await request("/api/admin/waiter", { cookie: waiter.cookie, method: "PATCH", body: { id: dineIn.id, status: "delivered", paymentStatus: "paid" } }), 422);
  const candidates = status(await request("/api/admin/orders?drivers=1", { cookie: cashier.cookie }), 200).drivers;
  check(candidates.some(row => row.id === driver.id), "cashier sees eligible driver");
  check(!candidates.some(row => [employee.id, revokedDriver.id, disabledDriver.id].includes(row.id)), "ineligible drivers omitted");
  check(candidates.every(row => Object.keys(row).sort().join(",") === "id,name"), "assignment list has only id/name");
  for (const deliveryDriverId of [employee.id, revokedDriver.id, disabledDriver.id]) status(await request(`/api/admin/orders/${own.id}`, { cookie: cashier.cookie, method: "PATCH", body: { deliveryDriverId } }), 422);
  status(await request(`/api/admin/orders/${pickup.id}`, { cookie: cashier.cookie, method: "PATCH", body: { deliveryDriverId: driver.id } }), 422);
  status(await request(`/api/admin/orders/${own.id}`, { cookie: driver.cookie, method: "PATCH", body: { deliveryDriverId: driver.id } }), 403);
  const previous = status(await request("/api/admin/delivery", { cookie: driver.cookie }), 200);
  check(!previous.some(row => row.id === own.id), "unassigned order not visible to driver");
  status(await request(`/api/admin/orders/${own.id}`, { cookie: manager.cookie, method: "PATCH", body: { deliveryDriverId: driver.id } }), 200);
  status(await request(`/api/admin/orders/${own.id}`, { cookie: cashier.cookie, method: "PATCH", body: { deliveryDriverId: null } }), 200);
  const unassigned = (await pool.query("SELECT delivery_driver_id,delivery_status,status FROM orders WHERE id=$1", [own.id])).rows[0];
  check(unassigned.delivery_driver_id === null && unassigned.delivery_status === null && unassigned.status === "ready", "unassignment clears delivery stage without changing preparation");
  console.log(`Initial API isolation and assignment checks passed: ${checks}. Starting role screenshots.`);

  browser = await chromium.launch();
  async function pageFor(person, viewport = { width: 1390, height: 1000 }) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
    await context.addCookies(person.cookie.split("; ").map(pair => { const index = pair.indexOf("="); return { name: pair.slice(0, index), value: pair.slice(index + 1), url: base }; }));
    const page = await context.newPage();
    page.setDefaultNavigationTimeout(180_000);
    page.setDefaultTimeout(180_000);
    page.on("pageerror", error => pageErrors.push(`${person.role}: ${error.message}`));
    return { context, page };
  }
  const managerView = await pageFor(manager);
  await managerView.page.goto(base + "/", { waitUntil: "domcontentloaded" });
  await managerView.page.waitForURL(base + "/admin");
  check(new URL(managerView.page.url()).pathname === "/admin", "manager dashboard landing in browser");
  await capture(managerView.page, "papel-gerente");
  const cashierView = await pageFor(cashier);
  await cashierView.page.goto(base + "/", { waitUntil: "domcontentloaded" });
  await cashierView.page.getByRole("button", { name: `Ver pedido ${own.id.slice(0, 8)}`, exact: true }).click();
  await Promise.all([cashierView.page.waitForResponse(response => response.url().endsWith("/api/admin/orders") && response.request().method() === "GET"), cashierView.page.getByLabel("Entregador", { exact: true }).selectOption(String(driver.id))]);
  await cashierView.page.waitForFunction(id => { const select = document.querySelector("#assigned-driver"); return select?.value === String(id) && !select.disabled; }, driver.id);
  await capture(cashierView.page, "papel-caixa-atribuicao");
  const ownList = status(await request("/api/admin/delivery?driverId=" + otherDriver.id, { cookie: driver.cookie }), 200);
  check(ownList.some(row => row.id === own.id), "assigned own order visible");
  check(!ownList.some(row => [foreign.id, canceled.id].includes(row.id)), "query cannot override identity or reveal canceled route");
  const ownData = ownList.find(row => row.id === own.id), paidData = ownList.find(row => row.id === notReady.id);
  check(ownData.amountToCollectCents === 5400 && ownData.deliveryFeeCents === 600, "collect amount includes freight");
  check(paidData.amountToCollectCents === 0, "paid order never asks to collect again");
  check(!("items" in ownData) && !("deliveryDriverId" in ownData), "driver gets only operational projection");
  check(ownData.navigationLinks.google.includes("destination="), "legacy delivery has encoded map destination");
  check(ownData.navigationLinks.osm === null, "legacy delivery does not invent OSM coordinates");
  for (const id of [foreign.id, dineIn.id, pickup.id, randomUUID(), notReady.id]) status(await request("/api/admin/delivery", { cookie: driver.cookie, method: "PATCH", body: { id, deliveryStatus: "out_for_delivery" } }), 409);
  status(await request("/api/admin/delivery", { cookie: driver.cookie, method: "PATCH", body: { id: own.id, deliveryStatus: "delivered" } }), 409);
  status(await request("/api/admin/delivery", { cookie: driver.cookie, method: "PATCH", body: { id: own.id, deliveryStatus: "out_for_delivery", paymentStatus: "paid" } }), 422);
  const kitchenView = await pageFor(kitchen);
  await kitchenView.page.goto(base + "/", { waitUntil: "domcontentloaded" });
  await kitchenView.page.getByRole("heading", { name: "Cozinha", exact: true }).waitFor();
  check(new URL(kitchenView.page.url()).pathname === "/admin/kitchen", "kitchen lands in preparation");
  check(await kitchenView.page.getByRole("navigation", { name: "Navegação da equipe" }).getByRole("link", { name: "Caixa e pedidos" }).count() === 0, "kitchen does not see cashier navigation");
  await kitchenView.page.getByText("Sem cebola", { exact: false }).first().waitFor();
  await kitchenView.page.getByText("Consultando conexão…", { exact: true }).waitFor({ state: "hidden" });
  await capture(kitchenView.page, "papel-cozinha");
  const waiterView = await pageFor(waiter, { width: 390, height: 844 });
  await waiterView.page.goto(base + "/", { waitUntil: "domcontentloaded" });
  await waiterView.page.getByRole("heading", { name: `Mesa ${terrace.number}`, exact: true }).waitFor();
  check(new URL(waiterView.page.url()).pathname === "/admin/waiter", "waiter lands in floor");
  await capture(waiterView.page, "papel-garcom");
  const serveButton = waiterView.page.getByRole("article").filter({ hasText: `#${dineIn.id.slice(0, 8).toUpperCase()}` }).getByRole("button", { name: "Marcar como servido", exact: true });
  await serveButton.click();
  await waiterView.page.getByRole("status").filter({ hasText: "marcado como servido" }).waitFor();
  check((await pool.query("SELECT status,payment_status FROM orders WHERE id=$1", [dineIn.id])).rows[0].status === "delivered", "waiter UI records serving");
  status(await request("/api/admin/waiter", { cookie: waiter.cookie, method: "PATCH", body: { id: dineIn.id, status: "delivered" } }), 409);
  const driverView = await pageFor(driver, { width: 390, height: 844 });
  await driverView.page.goto(base + "/", { waitUntil: "domcontentloaded" });
  await driverView.page.getByRole("heading", { name: "Ana Martins", exact: true }).waitFor();
  check(new URL(driverView.page.url()).pathname === "/admin/delivery", "driver lands in personal deliveries");
  const ownCard = driverView.page.getByRole("article").filter({ hasText: "Ana Martins" });
  await capture(driverView.page, "papel-entregador");
  await ownCard.getByRole("button", { name: "Iniciar entrega", exact: true }).click();
  await ownCard.getByRole("button", { name: "Concluir entrega", exact: true }).waitFor();
  status(await request(`/api/admin/orders/${own.id}`, { cookie: cashier.cookie, method: "PATCH", body: { deliveryDriverId: otherDriver.id } }), 409);
  status(await request("/api/admin/delivery", { cookie: driver.cookie, method: "PATCH", body: { id: own.id, deliveryStatus: "out_for_delivery" } }), 409);
  await ownCard.getByRole("button", { name: "Concluir entrega", exact: true }).click();
  await driverView.page.getByRole("status").filter({ hasText: "concluída" }).waitFor();
  const result = (await pool.query("SELECT status,delivery_status,dispatched_at,delivered_at,payment_status FROM orders WHERE id=$1", [own.id])).rows[0];
  check(result.status === "delivered" && result.delivery_status === "delivered" && result.dispatched_at && result.delivered_at, "driver UI completes route with timestamps");
  check(result.payment_status === "pending", "driver cannot mark a payment paid");
  status(await request("/api/admin/delivery", { cookie: driver.cookie, method: "PATCH", body: { id: own.id, deliveryStatus: "delivered" } }), 409);
  status(await request(`/api/admin/staff/${driver.id}`, { cookie: admin, method: "PATCH", body: { permissions: [] } }), 200);
  status(await request("/api/admin/delivery", { cookie: driver.cookie }), 403);
  const revokedPage = await request("/admin/delivery", { cookie: driver.cookie });
  status(revokedPage, 307); check(revokedPage.response.headers.get("location").endsWith("/admin/workspace"), "revoked primary role falls back safely");
  check(pageErrors.length === 0, `No browser exceptions: ${pageErrors.join("; ")}`);
  console.log(`PASS ${checks} role operations checks; five screenshots saved in ${screenshots}.`);
} finally {
  if (browser) await browser.close();
  if (orderIds.length) await pool.query("DELETE FROM orders WHERE id=ANY($1::uuid[])", [orderIds]);
  if (tableIds.length) await pool.query("DELETE FROM restaurant_tables WHERE id=ANY($1::int[])", [tableIds]);
  if (users.length) await pool.query("DELETE FROM staff_users WHERE id=ANY($1::int[])", [users]);
  await pool.end();
}
