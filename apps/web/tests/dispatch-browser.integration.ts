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

  async function user(role: "admin" | "driver", index = 0) {
    const username = `roteamento-${role}-${suffix}-${index}`;
    const { rows } = await pool.query(
      "insert into staff_users(name,username,password_hash,role) values($1,$2,$3,$4) returning id",
      [role === "admin" ? "Caixa de homologação" : `Entregador de homologação ${index + 1}`, username, hash, role],
    );
    return { username, id: rows[0].id };
  }

  try {
    const [admin, driver] = await Promise.all([user("admin"), user("driver")]);
    await Promise.all([1, 2, 3, 4].map(index => user("driver", index)));
    await pool.query("update staff_users set vehicle_model='CG Fan 160', vehicle_color='Prata' where id=$1", [driver.id]);
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
    const empty = await operator.newPage();
    await empty.goto(new URL("/admin/dispatch", url).href);
    await empty.getByRole("list", { name: "Exemplo da linha de entregas" }).waitFor();
    const idleRoster = empty.getByRole("list", { name: "Entregadores cadastrados" });
    assert.equal(await idleRoster.getByRole("listitem").count(), 5);
    assert.equal(await idleRoster.getByText("Fora de serviço", { exact: true }).count(), 5);
    if (process.env.DISPATCH_TEST_EMPTY_SCREENSHOT) {
      await empty.screenshot({ path: process.env.DISPATCH_TEST_EMPTY_SCREENSHOT, fullPage: true });
    }
    await empty.close();
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

    await pool.query("update orders set payment_status='paid' where delivery_address=$1", [stops[0].address]);
    const page = await operator.newPage();
    await page.goto(new URL("/admin/dispatch", url).href);
    await page.getByRole("heading", { name: "Despacho de entregas" }).waitFor();
    await page.getByRole("button", { name: "Gerar rotas" }).click();
    await page.getByText(/entrou na fila|entraram na fila/).waitFor();
    for (const stop of stops) await page.getByText(stop.address, { exact: true }).waitFor();
    await page.getByRole("link", { name: "OpenStreetMap" }).waitFor();
    await page.getByText(/Aguardando saída/).waitFor();
    const timeline = page.getByRole("list", { name: "Sequência de paradas da rota" });
    await timeline.getByText(/Chegada estimada · falt/).first().waitFor();
    assert.equal(await timeline.getByRole("listitem").count(), stops.length + 2);
    await timeline.getByRole("img", { name: "Moto do entregador" }).waitFor();
    await timeline.locator("time").first().waitFor();
    assert.equal(await page.getByLabel("Entregador disponível").first().locator("option").count(), 2);
    await page.getByLabel("Entregador disponível").first().selectOption(String(driver.id));
    await timeline.getByRole("img", { name: "Moto CG Fan 160, Prata" }).waitFor();
    await page.getByRole("button", { name: "Registrar saída da rota" }).first().click();
    await page.getByText("Saída registrada. As paradas estão em Minhas entregas.", { exact: true }).waitFor();
    const assigned = await (await courier.request.get(new URL("/api/admin/delivery", url).href)).json();
    assert.equal(assigned.length, stops.length);
    assert.equal(new Set(assigned.map((order: { dispatchRouteId: string }) => order.dispatchRouteId)).size, 1);
    assert.deepEqual(assigned.map((order: { dispatchPosition: number }) => order.dispatchPosition), stops.map((_, index) => index + 1));
    const dispatch = async () => (await operator.request.get(new URL("/api/admin/dispatch", url).href)).json();
    const started = (await dispatch()).routes[0];
    assert.equal(started.phase, "delivering");
    assert.equal(started.currentPosition, 1);
    assert.equal(started.remainingStops, stops.length);
    assert.equal(started.amountToCollectCents, assigned.reduce((sum: number, order: { amountToCollectCents: number }) => sum + order.amountToCollectCents, 0));
    assert(started.amountToCollectCents > 0);
    assert.equal((await courier.request.patch(new URL("/api/admin/delivery", url).href, { data: { returnRouteId: started.id } })).status(), 409);
    const roster = page.getByRole("list", { name: "Entregadores cadastrados" });
    await roster.getByText(`Entrega 1 de ${stops.length}`, { exact: true }).waitFor();
    assert.equal(await roster.getByText("Fora de serviço", { exact: true }).count(), 4);
    await page.getByText("Posição estimada pelo tempo da etapa").waitFor();
    const marker = timeline.locator('[aria-current="step"]');
    await marker.getByText("Parada 1", { exact: true }).waitFor();
    const motorcycle = marker.getByRole("img", { name: "Moto CG Fan 160, Prata" });
    assert.equal(await motorcycle.getAttribute("data-silhouette"), "fan");
    if (screenshot) await page.screenshot({ path: screenshot, fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert(await timeline.evaluate(el => el.scrollWidth > el.clientWidth));
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    if (process.env.DISPATCH_TEST_MOBILE_SCREENSHOT) {
      await page.screenshot({ path: process.env.DISPATCH_TEST_MOBILE_SCREENSHOT, fullPage: true });
    }
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
    assert.equal(await courierPage.getByRole("button", { name: "Compartilhar localização" }).count(), 0);
    assert.equal(started.segment.from, Date.parse(started.startedAt));
    assert.equal(started.segment.to, Date.parse(started.stops[0].estimatedArrival));
    const duration = started.segment.to - started.segment.from;
    assert(duration > 0);
    for (const fraction of [0.25, 0.75, 1.25]) {
      await page.clock.setFixedTime(new Date(started.segment.from + duration * fraction));
      await page.waitForFunction(expected => {
        const target = document.querySelector('[aria-current="step"] [style*="--bike-left"]') as HTMLElement;
        return target && Math.abs(Number.parseFloat(target.style.getPropertyValue("--bike-left")) - expected) < 0.1;
      }, Math.min(fraction, 1) * 100 - 50);
      assert.equal((await dispatch()).routes[0].currentPosition, 1);
      if (fraction === 0.75 && process.env.DISPATCH_TEST_ESTIMATE_SCREENSHOT) {
        await page.setViewportSize({ width: 1440, height: 980 });
        await page.screenshot({ path: process.env.DISPATCH_TEST_ESTIMATE_SCREENSHOT, fullPage: true, animations: "disabled" });
      }
    }
    await page.clock.setFixedTime(new Date());
    assert.equal(navigation.searchParams.get("destination"), `${first.point.latitude},${first.point.longitude}`);
    const reference = stops.find(stop => stop.address === first.address);
    assert(reference && Math.hypot((reference.latitude - first.point.latitude) * 111_000, (reference.longitude - first.point.longitude) * 99_000) <= 40);
    assert(!navigation.searchParams.has("key"));
    for (let remaining = stops.length; remaining > 0; remaining--) {
      await courierPage.getByRole("button", { name: "Concluir entrega" }).first().click();
      await courierPage.getByText(/Entrega #.*concluída/).waitFor();
      const route = (await dispatch()).routes[0];
      assert.equal(route.remainingStops, remaining - 1);
      const confirmed = route.stops[stops.length - remaining];
      assert(confirmed.deliveredAt);
      assert.equal(route.segment.from, Date.parse(confirmed.deliveredAt));
      if (remaining > 1) {
        assert.equal(route.currentPosition, stops.length - remaining + 2);
        assert.equal(route.segment.to, Date.parse(route.stops[stops.length - remaining + 1].estimatedArrival));
      }
    }
    const complete = await (await courier.request.get(new URL("/api/admin/delivery", url).href)).json();
    assert.equal(complete.length, stops.length);
    assert(complete.every((order: { deliveryStatus: string }) => order.deliveryStatus === "delivered"));
    const returning = (await dispatch()).routes[0];
    assert.equal(returning.phase, "returning");
    assert.equal(returning.amountToCollectCents, 0);
    assert(returning.returnEstimate);
    const back = timeline.locator('[data-state="returning"]');
    await back.getByRole("img", { name: "Moto CG Fan 160, Prata" }).waitFor();
    await back.locator("time").waitFor();
    assert.equal((await operator.request.patch(new URL("/api/admin/delivery", url).href, { data: { returnRouteId: started.id } })).status(), 409);
    assert.equal(returning.segment.to, Date.parse(returning.returnEstimate));
    await roster.getByText("Retornando à loja", { exact: true }).waitFor();
    await courierPage.getByRole("button", { name: "Confirmar retorno" }).click();
    await courierPage.getByText("Retorno à loja confirmado.").waitFor();
    const returned = (await dispatch()).routes[0];
    assert.equal(returned.phase, "returned");
    assert(returned.returnedAt);
    assert.equal(returned.segment, null);
    for (const [model, color, silhouette, paint] of [
      ["Twister", "Cinza", "twister", "#68778f"],
      ["Fan", "Vermelha", "fan", "#df3e47"],
    ]) {
      await pool.query("update staff_users set vehicle_model=$1, vehicle_color=$2 where id=$3", [model, color, driver.id]);
      await page.reload();
      await page.getByRole("button", { name: /Rotas e retornos/ }).click();
      const bike = timeline.getByRole("img", { name: `Moto ${model}, ${color}` });
      await bike.waitFor();
      assert.equal(await bike.getAttribute("data-silhouette"), silhouette);
      assert.equal(await bike.evaluate(el => getComputedStyle(el).getPropertyValue("--bike-paint").trim()), paint);
    }
    console.log("Navegador validado: cinco entregadores, seleção por disponibilidade, avanço estimado pelo tempo, paradas e retorno.");
  } finally {
    await browser.close();
    await pool.end();
  }
}

void main().catch(error => { console.error(error); process.exitCode = 1; });
