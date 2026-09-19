// Real checkout/admin APIs + disposable PostgreSQL; only the remote maps service is simulated.
// BASE=http://127.0.0.1:3099 DATABASE_URL=postgresql://.../barbacue_delivery_test_20260908 node tests/delivery-checkout.visual.mjs
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import pw from "../../../node_modules/playwright/index.js";

const base = process.env.BASE;
const database = process.env.DATABASE_URL;
assert(base && ["localhost", "127.0.0.1"].includes(new URL(base).hostname), "Local test server required");
assert(database && ["localhost", "127.0.0.1"].includes(new URL(database).hostname) && new URL(database).pathname.includes("_test_"), "Disposable local _test_ database required");
const fake = process.env.DELIVERY_TEST_PROVIDER_URL ?? "http://127.0.0.1:3199";
assert(["localhost", "127.0.0.1"].includes(new URL(fake).hostname));
const pool = new pg.Pool({ connectionString: database });
const shots = path.resolve(import.meta.dirname, "../../../test-screenshots");
const stamp = process.env.STAMP ?? "2026-09-08";
const browser = await pw.chromium.launch();
const errors = [];
const quotes = [];
const previousSettings = (await pool.query("SELECT * FROM delivery_settings WHERE id=1")).rows[0];
const previousStore = (await pool.query("SELECT * FROM store_settings WHERE id=1")).rows[0];
let productId, categoryId, orderId, checks = 0;
function check(value, message) { assert(value, message); checks++; }
async function shot(page, name) {
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  await page.screenshot({ path: path.join(shots, `${name}-${stamp}.png`) });
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${name}: no horizontal overflow`);
}
async function resetFake(config = {}) {
  const response = await fetch(`${fake}/__test/config`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer local-delivery-provider-test" }, body: JSON.stringify({ reset: true, ...config }) });
  assert(response.ok);
}

try {
  await mkdir(shots, { recursive: true });
  await resetFake();
  await pool.query("INSERT INTO store_settings(id,store_name,is_open,weekly_hours) VALUES(1,'Barbacue',true,NULL) ON CONFLICT(id) DO UPDATE SET is_open=true,weekly_hours=NULL");
  categoryId = (await pool.query("INSERT INTO categories(name,slug) VALUES('Na brasa','delivery-visual-test') RETURNING id")).rows[0].id;
  productId = (await pool.query("INSERT INTO products(external_id,category_id,name,price_cents,available) VALUES('delivery-visual-test',$1,'Burger na brasa',3000,true) RETURNING id", [categoryId])).rows[0].id;
  const adminContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, extraHTTPHeaders: { "x-forwarded-for": "198.51.100.91" } });
  const login = await adminContext.request.post(`${base}/api/admin/auth`, { data: { password: process.env.DELIVERY_TEST_PASSWORD ?? "delivery-test-password" } });
  check(login.ok(), "Admin login");
  const admin = await adminContext.newPage();
  admin.setDefaultTimeout(90000);
  admin.on("pageerror", error => errors.push(error.message));
  await admin.goto(`${base}/admin/delivery-settings`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await admin.getByLabel("Endereço de saída", { exact: true }).fill("Rua da Loja, 123, Centro, São Paulo, SP");
  await admin.getByRole("button", { name: "Localizar loja pelo endereço" }).click();
  await admin.getByText("Localização encontrada. Confira e salve.", { exact: true }).waitFor();
  check((await admin.getByLabel("Latitude", { exact: true }).inputValue()).length > 0, "Origin geocoded through configured provider");
  await admin.getByLabel("Taxa de saída (R$)", { exact: true }).fill("3,00");
  await admin.getByLabel("Valor por quilômetro (R$)", { exact: true }).fill("1,00");
  await admin.getByLabel("Frete mínimo (R$)", { exact: true }).fill("5,00");
  await admin.getByLabel("Distância máxima (km)", { exact: true }).fill("10");
  await admin.getByRole("checkbox", { name: /Calcular frete por distância/ }).check();
  await admin.getByRole("button", { name: "Salvar condições de entrega" }).click();
  await admin.getByText("Configurações de entrega salvas.", { exact: true }).waitFor();
  const persisted = (await pool.query("SELECT * FROM delivery_settings WHERE id=1")).rows[0];
  check(persisted.enabled && persisted.fee_per_km_cents === 100 && persisted.origin_latitude != null, "UI persists origin and freight tariff");
  await admin.evaluate(() => window.scrollTo(0, 0));
  await shot(admin, "configuracao-frete");

  const customer = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, extraHTTPHeaders: { "x-forwarded-for": "198.51.100.92" } });
  await customer.addInitScript(({ productId }) => {
    localStorage.setItem("barbacue-cart", JSON.stringify({ state: { items: [{ productId, name: "Burger na brasa", priceCents: 3000, qty: 1, imageUrl: null }] }, version: 0 }));
    localStorage.setItem("barbacue-checkout", JSON.stringify({ state: { name: "Cliente Teste Frete Visual", phone: "11987650091", address: "Rua do Cliente, 123, Centro, São Paulo, SP", paymentMethod: "cash", changeForCents: null, couponCode: null, notes: "", orderType: "delivery", tableToken: null, tableNumber: null }, version: 0 }));
  }, { productId });
  const page = await customer.newPage();
  page.setDefaultTimeout(90000);
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`${base}/payment`, { waitUntil: "domcontentloaded", timeout: 90000 });
  const blocked = page.getByRole("button", { name: "Calcule o frete para continuar", exact: true });
  check(await blocked.isDisabled(), "Checkout cannot submit before reviewing freight");
  async function calculate() {
    const pending = page.waitForResponse(r => r.url().endsWith("/api/delivery/quote") && r.request().method() === "POST");
    await page.getByRole("button", { name: "Calcular frete", exact: true }).click();
    const response = await pending;
    const quote = await response.json();
    check(response.status() === 201, `Quotation created through API: ${response.status()} ${quote.message ?? ""}`);
    quotes.push(quote.quoteId);
    await page.getByText("Frete para este endereço", { exact: true }).waitFor();
    check(quote.feeCents === 675 && quote.distanceMeters === 3750, "3.75km outbound route costs R$6.75");
    return quote;
  }
  await calculate();
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, "frete-celular");
  await page.getByLabel("Endereço de entrega", { exact: true }).fill("Rua do Cliente, 456, Centro, São Paulo, SP");
  check(await blocked.isDisabled(), "Address change immediately revokes quote");
  const validQuote = await calculate();
  const submit = page.getByRole("button", { name: /Confirmar pedido.*36,75/ });
  await submit.scrollIntoViewIfNeeded();
  await page.getByLabel("Troco para quanto? (opcional)", { exact: true }).fill("30");
  await submit.click();
  await page.getByRole("alert").filter({ hasText: "troco" }).waitFor();
  check(!(await pool.query("SELECT id FROM orders WHERE customer_name='Cliente Teste Frete Visual'")).rowCount, "Insufficient cash blocks submission before API");
  await page.getByLabel("Troco para quanto? (opcional)", { exact: true }).fill("50");
  await page.getByRole("alert").filter({ hasText: "troco" }).waitFor({ state: "hidden" });
  await submit.scrollIntoViewIfNeeded();
  await shot(page, "frete-resumo-pagamento");
  const sent = page.waitForResponse(r => r.url().endsWith("/api/orders") && r.request().method() === "POST");
  await submit.click();
  const response = await sent;
  check(response.status() === 201, "Freight checkout sends real order");
  const order = await response.json(); orderId = order.orderId;
  check(response.request().postDataJSON().deliveryQuoteId === validQuote.quoteId, "Checkout sends the reviewed quote");
  const saved = (await pool.query("SELECT * FROM orders WHERE id=$1", [orderId])).rows[0];
  check(saved.delivery_fee_cents === 675 && saved.total_cents === 3675 && saved.change_for_cents === 5000, "Order stores fee and canonical total");
  check(saved.delivery_route.google.includes("destination=") && saved.delivery_route.apple.includes("daddr=") && saved.delivery_route.osm.includes("route="), "Navigation links persist with the order");
  await page.getByRole("heading", { name: /Pedido recebido!/ }).waitFor();
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, "frete-pedido-confirmado");
  check(errors.length === 0, `No browser exceptions: ${errors.join("; ")}`);
  console.log(`PASS: ${checks} real freight checkout/admin visual checks; 4 screenshots.`);
} finally {
  await browser.close();
  if (orderId) { await pool.query("DELETE FROM kitchen_print_jobs WHERE order_id=$1", [orderId]); await pool.query("DELETE FROM orders WHERE id=$1", [orderId]); }
  await pool.query("DELETE FROM customers WHERE phone='11987650091' AND NOT EXISTS(SELECT 1 FROM orders WHERE customer_id=customers.id)");
  if (quotes.length) await pool.query("DELETE FROM delivery_quotes WHERE id=ANY($1::uuid[])", [quotes]);
  if (productId) await pool.query("DELETE FROM products WHERE id=$1", [productId]);
  if (categoryId) await pool.query("DELETE FROM categories WHERE id=$1", [categoryId]);
  await pool.query("DELETE FROM delivery_settings WHERE id=1");
  if (previousSettings) await pool.query("INSERT INTO delivery_settings SELECT * FROM json_populate_record(NULL::delivery_settings,$1::json)", [JSON.stringify(previousSettings)]);
  await pool.query("DELETE FROM store_settings WHERE id=1");
  if (previousStore) await pool.query("INSERT INTO store_settings SELECT * FROM json_populate_record(NULL::store_settings,$1::json)", [JSON.stringify(previousStore)]);
  await resetFake();
  await pool.end();
}
