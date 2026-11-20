// Use a separate database with all migrations applied and a local web server.
import assert from "node:assert/strict";
import { randomBytes, scryptSync } from "node:crypto";
import { chromium } from "@playwright/test";
import { Pool } from "pg";
import { deliveryAddressKey } from "../src/lib/delivery";

async function main() {
  const database = new URL(process.env.DATABASE_URL ?? "");
  const url = new URL(process.env.DISPATCH_TEST_URL ?? "");
  assert(["127.0.0.1", "localhost"].includes(database.hostname) && database.pathname.startsWith("/barbacue_dispatch_test_"));
  assert(url.hostname === "127.0.0.1");
  const pool = new Pool({ connectionString: database.href });
  const browser = await chromium.launch({ headless: true });
  const operator = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const courier = await browser.newContext({ viewport: { width: 430, height: 900 } });
  const password = randomBytes(16).toString("hex");
  const suffix = randomBytes(4).toString("hex");
  const salt = randomBytes(16);
  const hash = `${salt.toString("hex")}:${scryptSync(password, salt, 64).toString("hex")}`;
  const origin = [-26.48585, -49.06648];
  const stops: { address: string; latitude: number; longitude: number; regional?: boolean }[] = [
    { address: "Parque Malwee, Jaraguá do Sul", latitude: -26.51755, longitude: -49.11665 },
    { address: "Centro Cultural de Jaraguá do Sul", latitude: -26.48733, longitude: -49.08019 },
  ];
  const screenshot = process.env.DISPATCH_TEST_SCREENSHOT;

  async function user(role: "admin" | "driver") {
    const username = `roteamento-${role}-${suffix}`;
    const { rows } = await pool.query(
      "insert into staff_users(name,username,password_hash,role) values($1,$2,$3,$4) returning id",
      [role === "admin" ? "Caixa de homologação" : "Entregador de homologação", username, hash, role],
    );
    return { username, id: rows[0].id };
  }

  try {
    const [admin, driver] = await Promise.all([user("admin"), user("driver")]);
    assert.equal((await operator.request.get(new URL("/api/admin/dispatch", url).href)).status(), 401);
    for (const [context, account] of [[operator, admin], [courier, driver]] as const) {
      const login = await context.request.post(new URL("/api/admin/auth", url).href, { data: { username: account.username, password } });
      assert.equal(login.status(), 200);
    }
    assert.equal((await courier.request.get(new URL("/api/admin/dispatch", url).href)).status(), 403);
    const settings = await operator.request.put(new URL("/api/admin/delivery-settings", url).href, { data: {
      enabled: true, provider: "osm", originAddress: "Centro de Jaraguá do Sul, SC",
      originLatitude: origin[0], originLongitude: origin[1], baseFeeCents: 300, feePerKmCents: 125, minFeeCents: 400, maxDistanceMeters: 20000,
    } });
    assert.equal(settings.status(), 200);
    const geocodable = process.env.DISPATCH_TEST_GEOCODABLE_ADDRESS;
    if (geocodable) {
      const quote = await operator.request.post(new URL("/api/delivery/quote", url).href, { data: {
        address: geocodable, brand: "barbacue",
      } });
      assert.equal(quote.status(), 201, (await quote.json()).error);
      const result = await quote.json();
      assert(result.distanceMeters > 0 && result.durationSeconds > 0 && result.feeCents >= 400);
      assert.equal(new URL(result.routeLinks.google).hostname, "www.google.com");
      assert.equal(new URL(result.routeLinks.google).searchParams.has("key"), false);
      const [latitude, longitude] = new URL(result.routeLinks.google).searchParams.get("destination")!.split(",").map(Number);
      await pool.query("insert into store_settings(id,store_name,is_open,weekly_hours) values(1,'Homologação',true,null) on conflict(id) do update set is_open=true,weekly_hours=null");
      const { rows: [product] } = await pool.query("insert into products(name,price_cents,available) values('Produto de homologação',1500,true) returning id");
      const order = await operator.request.post(new URL("/api/orders", url).href, { data: {
        brand: "barbacue", customerName: "Cliente de homologação", customerPhone: "47999999999",
        deliveryAddress: geocodable, deliveryQuoteId: result.quoteId, paymentMethod: "cash", items: [{ productId: product.id, qty: 1 }],
      } });
      assert.equal(order.status(), 201, JSON.stringify(await order.json()));
      const saved = await order.json();
      assert.equal(saved.deliveryFeeCents, result.feeCents);
      assert.equal((await pool.query("update orders set status='ready' where id=$1 and delivery_quote_id=$2", [saved.orderId, result.quoteId])).rowCount, 1);
      stops.push({ address: geocodable, latitude, longitude });
      const regional = geocodable.split(",").slice(0, 2).join(",");
      stops.push({ address: regional, latitude, longitude, regional: true });
    }

    assert.equal((await courier.request.patch(new URL("/api/admin/delivery/presence", url).href, { data: { available: true } })).status(), 200);
    for (const stop of stops) {
      if (stop.address === geocodable) continue;
      const { rows: [quote] } = stop.regional ? { rows: [null] } : await pool.query(`
        insert into delivery_quotes(brand,address,address_key,provider,distance_meters,duration_seconds,fee_cents,origin_latitude,origin_longitude,destination_latitude,destination_longitude,route_links,expires_at)
        values ('barbacue',$1,$2,'osm',1000,100,400,$3,$4,$5,$6,'{}',now()+interval '15 minutes') returning id
      `, [stop.address, deliveryAddressKey(stop.address), ...origin, stop.latitude, stop.longitude]);
      await pool.query(`
        insert into orders(brand,customer_name,customer_phone,items,subtotal_cents,total_cents,channel,status,delivery_address,delivery_quote_id)
        values ('barbacue','Pedido de homologação','','[]',1000,1000,'click','ready',$1,$2)
      `, [stop.address, quote?.id ?? null]);
    }

    const page = await operator.newPage();
    await page.goto(new URL("/admin/dispatch", url).href);
    await page.getByRole("heading", { name: "Despacho de entregas" }).waitFor();
    await page.getByRole("button", { name: "Gerar rotas" }).click();
    await page.getByText(/entrou na fila|entraram na fila/).waitFor();
    for (const stop of stops) await page.getByText(stop.address, { exact: true }).waitFor();
    await page.getByRole("link", { name: "OpenStreetMap" }).waitFor();
    if (screenshot) await page.screenshot({ path: screenshot, fullPage: true });
    await page.getByLabel("Entregador disponível").first().selectOption(String(driver.id));
    await page.getByRole("button", { name: "Registrar saída da rota" }).first().click();
    await page.getByText("Saída registrada. As paradas estão em Minhas entregas.", { exact: true }).waitFor();
    const assigned = await (await courier.request.get(new URL("/api/admin/delivery", url).href)).json();
    assert.equal(assigned.length, stops.length);
    assert.equal(new Set(assigned.map((order: { dispatchRouteId: string }) => order.dispatchRouteId)).size, 1);
    assert.deepEqual(assigned.map((order: { dispatchPosition: number }) => order.dispatchPosition), stops.map((_, index) => index + 1));
    const courierPage = await courier.newPage();
    await courierPage.goto(new URL("/admin/delivery", url).href);
    const map = courierPage.getByRole("link", { name: "Google Maps" }).first();
    await map.waitFor();
    const navigation = new URL((await map.getAttribute("href"))!);
    assert.equal(navigation.hostname, "www.google.com");
    assert.equal(navigation.searchParams.get("api"), "1");
    assert.equal(navigation.searchParams.get("dir_action"), "navigate");
    const { rows: [snapshot] } = await pool.query("select plan from dispatch_routes where id=$1", [assigned[0].dispatchRouteId]);
    const first = snapshot.plan.stops[0];
    assert.equal(navigation.searchParams.get("destination"), `${first.point.latitude},${first.point.longitude}`);
    const reference = stops.find(stop => stop.address === first.address);
    assert(reference && Math.hypot((reference.latitude - first.point.latitude) * 111_000, (reference.longitude - first.point.longitude) * 99_000) <= 40);
    assert(!navigation.searchParams.has("key"));
    for (let remaining = stops.length; remaining > 0; remaining--) {
      await courierPage.getByRole("button", { name: "Concluir entrega" }).first().click();
      await courierPage.getByText(/Entrega #.*concluída/).waitFor();
    }
    const complete = await (await courier.request.get(new URL("/api/admin/delivery", url).href)).json();
    assert.equal(complete.length, stops.length);
    assert(complete.every((order: { deliveryStatus: string }) => order.deliveryStatus === "delivered"));
    console.log("Navegador validado: permissões, cotação, matriz real, fila, saída, Google Maps por link e conclusão.");
  } finally {
    await browser.close();
    await pool.end();
  }
}

void main().catch(error => { console.error(error); process.exitCode = 1; });
