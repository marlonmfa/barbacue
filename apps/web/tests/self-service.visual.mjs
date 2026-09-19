// Real API + PostgreSQL integration; use ONLY a disposable local test database.
// BASE=http://127.0.0.1:3098 DATABASE_URL=postgresql://.../barbacue_self_service_test_20260907 node tests/self-service.visual.mjs
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import pw from "../../../node_modules/playwright/index.js";

const base = process.env.BASE;
const database = process.env.DATABASE_URL;
assert(base && ["localhost", "127.0.0.1"].includes(new URL(base).hostname), "Local test server required");
assert(database && ["localhost", "127.0.0.1"].includes(new URL(database).hostname) && new URL(database).pathname.includes("_test_"), "Disposable local _test_ database required");
const pool = new pg.Pool({ connectionString: database });
const shots = path.resolve(import.meta.dirname, "../../../test-screenshots");
const stamp = process.env.STAMP ?? "2026-09-07";
const token = "11111111-1111-4111-8111-111111111117";
const browser = await pw.chromium.launch();
const errors = [];
let checks = 0;
function check(value, message) { assert(value, message); checks++; }
async function screenshot(page, name) {
  await page.evaluate(() => document.fonts.ready);
  // Dev-only Next controls are not part of the customer or kitchen interface.
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await page.screenshot({ path: path.join(shots, `${name}-${stamp}.png`), fullPage: false });
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${name}: horizontal overflow`);
}

try {
  await mkdir(shots, { recursive: true });
  // Keep captures deterministic on reruns; remove only this script's fixtures.
  const previous = await pool.query("SELECT id FROM orders WHERE customer_name='Marina Teste Visual' OR (channel='table_qr' AND notes='Trazer guardanapos' AND table_id IN (SELECT id FROM restaurant_tables WHERE token=$1))", [token]);
  const previousIds = previous.rows.map(row => row.id);
  if (previousIds.length) {
    await pool.query("DELETE FROM kitchen_print_jobs WHERE order_id=ANY($1::uuid[])", [previousIds]);
    await pool.query("DELETE FROM orders WHERE id=ANY($1::uuid[])", [previousIds]);
  }
  await pool.query("INSERT INTO store_settings(id,store_name,is_open,weekly_hours) VALUES(1,'Barbacue',true,NULL) ON CONFLICT(id) DO UPDATE SET is_open=true,weekly_hours=NULL");
  await pool.query("INSERT INTO restaurant_tables(number,label,token,active) VALUES(7,'Salão',$1,true) ON CONFLICT(number) DO UPDATE SET token=$1,active=true", [token]);
  const categories = [];
  for (const [name, slug] of [["Combos na brasa", "ss-visual-combos"], ["Para acompanhar", "ss-visual-sides"], ["Bebidas", "ss-visual-drinks"]]) {
    const r = await pool.query("INSERT INTO categories(name,slug,sort_order) VALUES($1,$2,$3) ON CONFLICT(slug) DO UPDATE SET name=$1 RETURNING id", [name, slug, categories.length]);
    categories.push(r.rows[0].id);
  }
  const fixtures = [
    ["Combo Crunch", "Burger na brasa com catupiry empanado, batata e bebida.", 4500, "combo-crunch", 0],
    ["Combo Supreme", "Burger na brasa, creme de queijos e bacon caramelizado.", 5200, "combo-supreme", 0],
    ["Combo de cordeiro", "Hambúrguer de cordeiro com acompanhamentos.", 4900, "combo-cordeiro", 0],
    ["Onion rings", "Anéis de cebola crocantes para dividir.", 1900, "onion-rings", 1],
    ["Mini churros", "Uma porção quentinha para fechar o pedido.", 1600, "mini-churros", 1],
    ["Água com gás", "Garrafa individual gelada.", 600, "agua-com-gas", 2],
  ];
  for (const [name, description, price, image, category] of fixtures) {
    await pool.query("INSERT INTO products(external_id,category_id,name,description,price_cents,image_url,available) VALUES($1,$2,$3,$4,$5,$6,true) ON CONFLICT(external_id) DO UPDATE SET available=true,price_cents=$5", [`ss-visual-${image}`, categories[category], name, description, price, `/menu/review-2026-09/${image}.webp`]);
  }

  const tablet = await browser.newContext({ viewport: { width: 1180, height: 820 }, deviceScaleFactor: 1 });
  const page = await tablet.newPage();
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`${base}/totem`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Adicionar Combo Crunch", exact: true }).click();
  const sidebar = page.getByRole("complementary", { name: "Resumo do pedido" });
  await sidebar.getByRole("button", { name: "Aumentar Combo Crunch", exact: true }).click();
  await sidebar.locator("summary").first().click();
  await sidebar.getByLabel("Observação para Combo Crunch", { exact: true }).fill("Sem cebola");
  await sidebar.getByLabel(/^Nome para retirada/).fill("Marina Teste Visual");
  await screenshot(page, "totem-tablet");
  const before = await pool.query("SELECT count(*)::int n FROM orders WHERE customer_name='Marina Teste Visual'");
  const submission = page.waitForResponse(r => r.url().endsWith("/api/self-service/orders") && r.request().method() === "POST");
  await page.getByRole("button", { name: "Enviar pedido", exact: true }).click();
  const response = await submission;
  check(response.status() === 201, "Totem must create order");
  const created = await response.json();
  await page.getByRole("heading", { name: "Pedido recebido", exact: true }).waitFor();
  const rows = await pool.query("SELECT o.*,j.ticket,j.status print_status FROM orders o JOIN kitchen_print_jobs j ON j.order_id=o.id WHERE o.id=$1", [created.orderId]);
  check(rows.rows[0].order_type === "pickup" && rows.rows[0].status === "confirmed", "Pickup goes directly to kitchen");
  check(rows.rows[0].payment_status === "pending" && rows.rows[0].print_status === "queued", "Payment remains pending, print is queued");
  check(rows.rows[0].items[0].notes === "Sem cebola" && rows.rows[0].ticket.items[0].notes === "Sem cebola", "Item notes survive into print ticket");
  check(rows.rows[0].total_cents === 9000, "Canonical total is correct");
  const after = await pool.query("SELECT count(*)::int n FROM orders WHERE customer_name='Marina Teste Visual'");
  check(after.rows[0].n === before.rows[0].n + 1, "Single order created");
  await screenshot(page, "totem-confirmacao");

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const phone = await mobile.newPage();
  phone.on("pageerror", error => errors.push(error.message));
  await phone.goto(`${base}/mesa/${token}`, { waitUntil: "networkidle" });
  check(new URL(phone.url()).pathname === "/pedir", "Printed QR opens dedicated ordering interface");
  await phone.getByRole("button", { name: "Adicionar Combo Supreme", exact: true }).click();
  await screenshot(phone, "qr-mesa-cardapio");
  await phone.locator('button[aria-haspopup="dialog"]').click();
  await phone.getByRole("dialog").getByLabel(/^Observações do pedido/).fill("Trazer guardanapos");
  await screenshot(phone, "qr-mesa-pedido");
  // Simulate a lost successful response. A retry MUST reuse the exact request.
  let submittedBody;
  await phone.route("**/api/self-service/orders", async route => {
    submittedBody = route.request().postDataJSON();
    const sent = await route.fetch();
    check(sent.status() === 201, "Server accepted before simulated connection loss");
    await route.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ message: "Conexão interrompida no teste" }) });
  }, { times: 1 });
  await phone.getByRole("button", { name: "Enviar pedido", exact: true }).click();
  await phone.getByRole("button", { name: "Verificar pedido", exact: true }).waitFor();
  phone.once("dialog", dialog => dialog.accept());
  await phone.reload({ waitUntil: "networkidle" });
  await phone.locator('button[aria-haspopup="dialog"]').click();
  await phone.getByRole("button", { name: "Verificar pedido", exact: true }).waitFor();
  check(await phone.getByRole("dialog").getByLabel(/^Observações do pedido/).isDisabled(), "Recovered pending order stays immutable");
  const retried = phone.waitForResponse(r => r.url().endsWith("/api/self-service/orders") && r.request().method() === "POST");
  await phone.getByRole("button", { name: "Verificar pedido", exact: true }).click();
  const retryResponse = await retried;
  check(retryResponse.ok(), "Retry recovers order");
  assert.deepEqual(retryResponse.request().postDataJSON(), submittedBody, "Retry preserves payload and idempotency key"); checks++;
  await phone.getByRole("heading", { name: "Pedido recebido", exact: true }).waitFor();
  const saved = await pool.query("SELECT o.order_type,o.table_id,count(j.id)::int jobs FROM orders o JOIN kitchen_print_jobs j ON j.order_id=o.id WHERE o.self_service_request_id=$1 GROUP BY o.id", [submittedBody.requestId]);
  check(saved.rows.length === 1 && saved.rows[0].jobs === 1 && saved.rows[0].table_id && saved.rows[0].order_type === "dine_in", "QR retry has one order and one print job at correct table");
  await screenshot(phone, "qr-mesa-confirmacao");
  check(await phone.evaluate(() => !Object.keys(sessionStorage).some(key => key.startsWith("barbacue-pending-order:"))), "Confirmed order clears stored pending customer data");

  const login = await tablet.request.post(`${base}/api/admin/auth`, { data: { password: process.env.SELF_SERVICE_TEST_PASSWORD ?? "self-service-test-password" } });
  check(login.ok(), "Test administrator authenticated");
  await page.goto(`${base}/admin/kitchen`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Impressão da cozinha", exact: true }).waitFor();
  const kitchenTicket = page.locator("article").filter({ has: page.getByRole("heading", { name: `Pedido ${created.orderId.slice(0, 8)}`, exact: true }) });
  check(await kitchenTicket.getByText("Marina Teste Visual", { exact: true }).isVisible(), "Kitchen identifies pickup customer");
  check(await kitchenTicket.getByText(/Sem cebola/).isVisible(), "Kitchen shows preparation notes");
  await kitchenTicket.getByRole("button", { name: "Iniciar preparo", exact: true }).click();
  await kitchenTicket.getByRole("button", { name: "Marcar como pronto", exact: true }).waitFor({ timeout: 90_000 });
  const preparing = await pool.query("SELECT status FROM orders WHERE id=$1", [created.orderId]);
  check(preparing.rows[0].status === "preparing", "Kitchen advances the real order");
  await page.evaluate(() => window.scrollTo(0, 0));
  await screenshot(page, "autoatendimento-cozinha");
  check(errors.length === 0, `Browser errors: ${errors.join("; ")}`);
  console.log(`Passed ${checks} visual integration checks; tablet + QR ordering, saved tickets, canonical totals and lost-response retry.`);
} finally {
  await browser.close();
  await pool.end();
}
