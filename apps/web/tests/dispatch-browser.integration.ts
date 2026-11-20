// Use a separate database with all migrations applied and a local web server.
import assert from "node:assert/strict";
import { randomBytes, scryptSync } from "node:crypto";
import { createServer } from "node:http";
import { chromium, type Locator } from "@playwright/test";
import { Pool } from "pg";
import { deliveryAddressKey } from "../src/lib/delivery";

async function assertWaiting(panel: Locator) {
  const line = panel.getByRole("list", { name: "Linha de entregas em espera" });
  const store = line.getByRole("listitem").first();
  await store.getByText("Loja", { exact: true }).waitFor();
  const motorcycle = store.getByRole("img", { name: /Moto/ });
  await motorcycle.waitFor();
  const name = motorcycle.getByText("Entregador", { exact: true });
  await name.waitFor();
  const bikeBox = await motorcycle.boundingBox();
  const nameBox = await name.boundingBox();
  assert(bikeBox && nameBox && nameBox.y + nameBox.height <= bikeBox.y);
  assert(Math.abs(nameBox.x + nameBox.width / 2 - (bikeBox.x + bikeBox.width / 2)) <= 1);
  assert.equal(await panel.getByRole("heading").count(), 0);
  assert.equal(await store.getAttribute("aria-current"), "step");
  assert.equal(await line.getByRole("img", { name: /Moto/ }).count(), 1);
  assert.equal(await panel.locator("time").count(), 0);
  assert.equal(await panel.getByText(/Chegada estimada|A receber/).count(), 0);
  assert(await line.getByRole("listitem").last().evaluate(el =>
    getComputedStyle(el.firstElementChild!, "::before").borderTopStyle === "dashed"));
  return store;
}

async function assertBikePosition(line: Locator, start: number, end: number, fraction: number) {
  const geometry = await line.evaluate((track, { start, end }) => {
    const points = Array.from(track.children, step => step.firstElementChild!.lastElementChild!);
    const [origin, destination, bike] = [points[start], points[end], track.querySelector('[role="img"]')!]
      .map(element => element.getBoundingClientRect()).map(box => box.x + box.width / 2);
    return { origin, destination, bike };
  }, { start, end });
  assert(geometry.destination > geometry.origin);
  assert(Math.abs(geometry.bike - (geometry.origin + (geometry.destination - geometry.origin) * fraction)) < 2, JSON.stringify(geometry));
}

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
  const whatsappPort = Number(process.env.DISPATCH_TEST_WHATSAPP_PORT);
  const messages: { account: string; jid: string; text: string }[] = [];
  const whatsapp = whatsappPort ? createServer(async (request, response) => {
    if (request.method !== "POST" || request.url !== "/messages" || request.headers["x-bot-token"] !== "dispatch-fixture") {
      response.writeHead(403).end();
      return;
    }
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(chunk);
    messages.push(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    response.writeHead(messages.length === 1 ? 503 : 201).end();
  }) : null;
  if (whatsapp) await new Promise<void>((resolve, reject) => {
    whatsapp.once("error", reject);
    whatsapp.listen(whatsappPort, "127.0.0.1", resolve);
  });

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
    await pool.query("update staff_users set vehicle_model='CG Fan 160', vehicle_color='Prata', whatsapp_phone='5547990000000' where id=$1", [driver.id]);
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
    const idleOverview = empty.getByRole("region", { name: "Rotas dos entregadores" });
    await idleOverview.getByRole("list", { name: "Linha de entregas em espera" }).last().waitFor();
    const rows = idleOverview.getByRole("region", { name: /^Rota de / });
    assert.equal(await rows.count(), 5);
    assert(await rows.evaluateAll(elements => elements.every((row, index) =>
      !index || elements[index - 1].getBoundingClientRect().bottom < row.getBoundingClientRect().top)));
    assert.equal(await idleOverview.locator("time").count(), 0);
    assert.equal(await idleOverview.getByText("Entregador", { exact: true }).count(), 5);
    assert.equal(await idleOverview.getByRole("heading").count(), 0);
    await assertWaiting(rows.first());
    assert.equal(await idleOverview.getByText("Fora de serviço", { exact: true }).count(), 5);
    if (process.env.DISPATCH_TEST_EMPTY_SCREENSHOT) {
      await empty.screenshot({ path: process.env.DISPATCH_TEST_EMPTY_SCREENSHOT, fullPage: true });
    }
    const pendingTab = empty.getByRole("button", { name: /^Pedidos pendentes/ });
    await pendingTab.click();
    await empty.getByText("Nenhum pedido pronto aguardando rota.").waitFor();
    const { rows: bulk } = await pool.query(`
      insert into orders(brand,customer_name,customer_phone,items,subtotal_cents,total_cents,channel,status)
      select 'barbacue','Volume de homologação','','[]',1000,1000,'click','ready'
      from generate_series(1,51) returning id`);
    const pendingList = empty.getByRole("list", { name: "Pedidos prontos sem rota" });
    await pendingList.getByRole("listitem").nth(50).waitFor();
    assert.equal(await pendingList.getByRole("listitem").count(), 51);
    assert.equal(await pendingList.getByText("Endereço ausente", { exact: true }).count(), 51);
    assert.equal((await pendingTab.innerText()).replace(/\s+/g, " "), "Pedidos pendentes 51");
    await pool.query("update orders set archived_at = now() where id = any($1::uuid[])", [bulk.map(order => order.id)]);
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
        values ('barbacue','Pedido de homologação','','[]',1000,1000,'click',$3,$1,$2)
      `, [stop.address, quote?.id ?? null, stop === stops[0] ? "preparing" : "ready"]);
    }

    await pool.query("update orders set payment_status='paid' where delivery_address=$1", [stops[0].address]);
    const page = await operator.newPage();
    await page.goto(new URL("/admin/dispatch", url).href);
    await page.getByRole("heading", { name: "Despacho de entregas" }).waitFor();
    const created = page.getByRole("button", { name: /^Rotas criadas/ });
    await created.click();
    await page.getByText(stops.length === 2 ? "1 pedido pronto sem rota" : `${stops.length - 1} pedidos prontos sem rota`, { exact: true }).waitFor();
    await page.getByRole("button", { name: /^\d+ pedidos? prontos? sem rota$/ }).click();
    const pending = page.getByRole("list", { name: "Pedidos prontos sem rota" });
    await pending.getByRole("listitem").nth(stops.length - 2).waitFor();
    assert.equal(await pending.getByRole("listitem").count(), stops.length - 1);
    const { rows: [preparing] } = await pool.query("select id from orders where status='preparing'");
    const ready = await operator.request.patch(new URL("/api/admin/kitchen", url).href, { data: { id: preparing.id, status: "ready" } });
    assert.equal(ready.status(), 200);
    const added = pending.getByRole("link", { name: `Pedido #${preparing.id.slice(0, 8).toUpperCase()}` });
    await added.waitFor();
    assert.equal(await added.getAttribute("href"), `/admin/orders?pedido=${preparing.id}`);
    assert.equal(await pending.getByRole("listitem").count(), stops.length);
    if (process.env.DISPATCH_TEST_PENDING_SCREENSHOT) {
      await page.screenshot({ path: process.env.DISPATCH_TEST_PENDING_SCREENSHOT, fullPage: true });
    }
    await created.click();
    await page.getByText(`${stops.length} pedidos prontos sem rota`, { exact: true }).waitFor();
    await page.getByRole("button", { name: "Gerar rotas" }).click();
    await page.getByText(/entrou na fila|entraram na fila/).waitFor();
    await page.getByRole("button", { name: "Rotas criadas 1", exact: true }).waitFor();
    await page.getByText("0 pedidos prontos sem rota", { exact: true }).waitFor();
    assert.equal(await created.getAttribute("aria-pressed"), "true");
    await page.getByRole("button", { name: "Pedidos pendentes 0", exact: true }).click();
    await page.getByText("Nenhum pedido pronto aguardando rota.").waitFor();
    await created.click();
    if (process.env.DISPATCH_TEST_CREATED_SCREENSHOT) {
      await page.screenshot({ path: process.env.DISPATCH_TEST_CREATED_SCREENSHOT, fullPage: true });
    }
    for (const stop of stops) await page.getByText(stop.address, { exact: true }).waitFor();
    await page.getByRole("link", { name: "OpenStreetMap" }).waitFor();
    await page.getByText(/Aguardando saída/).waitFor();
    await page.getByText("A motinha começa a avançar após registrar a saída.", { exact: true }).waitFor();
    const timeline = page.getByRole("list", { name: "Sequência de paradas da rota" });
    await timeline.getByText(/Chegada estimada · falt/).first().waitFor();
    assert.equal(await timeline.getByRole("listitem").count(), stops.length + 2);
    await timeline.getByRole("img", { name: "Moto do entregador" }).waitFor();
    await assertBikePosition(timeline, 0, 1, 0);
    await timeline.locator("time").first().waitFor();
    assert.equal(await page.getByLabel("Entregador disponível").first().locator("option").count(), 2);
    const dispatch = async () => (await operator.request.get(new URL("/api/admin/dispatch", url).href)).json();
    let referenceWithCode = "";
    if (whatsapp) {
      referenceWithCode = (await dispatch()).routes[0].stops[0].id.slice(0, 8).toUpperCase();
      await page.getByRole("button", { name: "Editar rota", exact: true }).click();
      const editor = page.getByRole("region", { name: "Editar paradas da rota" }).getByRole("listitem").first();
      await editor.getByLabel("Código de entrega").fill("2468");
      await editor.getByRole("button", { name: "Salvar código" }).click();
      await page.getByText("Código definido para a parada.", { exact: true }).waitFor();
      await page.getByRole("button", { name: "Fechar edição", exact: true }).click();
    }
    await page.getByLabel("Entregador disponível").first().selectOption(String(driver.id));
    await timeline.getByRole("img", { name: "Moto CG Fan 160, Prata" }).waitFor();
    await page.getByRole("button", { name: "Registrar saída da rota" }).first().click();
    await page.getByText(/^Saída registrada. As paradas estão em Minhas entregas./).waitFor();
    const assigned = await (await courier.request.get(new URL("/api/admin/delivery", url).href)).json();
    assert.equal(assigned.length, stops.length);
    assert.equal(new Set(assigned.map((order: { dispatchRouteId: string }) => order.dispatchRouteId)).size, 1);
    assert.deepEqual(assigned.map((order: { dispatchPosition: number }) => order.dispatchPosition), stops.map((_, index) => index + 1));
    const started = (await dispatch()).routes[0];
    if (whatsapp) {
      assert.equal(messages.length, 1);
      assert.equal(messages[0].account, "cogia");
      assert.equal(messages[0].jid, "5547990000000@s.whatsapp.net");
      const link = new URL(messages[0].text.split("\n").at(-1)!);
      assert.equal(link.origin, "https://barbacue.cog.ia.br");
      assert.equal(link.pathname, "/");
      assert.match(link.searchParams.get("confirma")!, /^[a-f0-9]{64}$/);
      assert(messages[0].text.includes("Google Maps · Rota completa"));
      assert(messages[0].text.includes(`ENTREGUE #${referenceWithCode} seguido do código`));
      for (const stop of started.stops) assert(messages[0].text.includes(`Pedido #${stop.id.slice(0, 8).toUpperCase()}`));
      assert.equal(started.whatsappStatus, "failed");
      await page.getByRole("button", { name: "Enviar link pelo WhatsApp" }).click();
      await page.getByText("Envio aceito pelo WhatsApp", { exact: true }).waitFor();
      assert.deepEqual(messages, [messages[0], messages[0]]);
      assert.equal((await operator.request.patch(new URL("/api/admin/dispatch", url).href,
        { data: { id: started.id, driverId: driver.id } })).status(), 409);
      const repeat = await operator.request.patch(new URL("/api/admin/dispatch", url).href,
        { data: { id: started.id, retryWhatsapp: true } });
      assert.equal((await repeat.json()).whatsappStatus, "sent");
      assert.equal(messages.length, 2);
      assert.equal((await operator.request.get(new URL(`/api/admin/delivery${link.search}`, url).href)).status(), 404);
      const fromLink = await browser.newPage();
      await fromLink.goto(new URL(link.pathname + link.search, url).href);
      await fromLink.waitForURL("**/admin/login?confirma=*");
      assert.equal(new URL(fromLink.url()).searchParams.get("confirma"), link.searchParams.get("confirma"));
      await fromLink.getByLabel("Usuário ou e-mail").fill(driver.username);
      await fromLink.getByLabel("Senha", { exact: true }).fill(password);
      await fromLink.getByRole("button", { name: "Entrar" }).click();
      await fromLink.getByRole("heading", { name: `Rota #${started.id.slice(0, 8).toUpperCase()}` }).waitFor();
      await fromLink.getByRole("heading", { name: /^Parada 1/ }).waitFor();
      await fromLink.close();
    }
    assert.equal(started.phase, "delivering");
    assert.equal(started.currentPosition, 1);
    assert.equal(started.remainingStops, stops.length);
    assert.equal(started.amountToCollectCents, assigned.reduce((sum: number, order: { amountToCollectCents: number }) => sum + order.amountToCollectCents, 0));
    assert(started.amountToCollectCents > 0);
    assert.equal((await courier.request.patch(new URL("/api/admin/delivery", url).href, { data: { returnRouteId: started.id } })).status(), 409);
    const overview = page.getByRole("region", { name: "Rotas dos entregadores" });
    const detail = overview.getByRole("region", { name: "Rota de Entregador de homologação 1" });
    await detail.getByText(`Entrega 1 de ${stops.length}`, { exact: true }).waitFor();
    assert.equal(await overview.getByRole("list", { name: "Linha de entregas em espera" }).count(), 4);
    assert.equal(await overview.getByRole("region", { name: /^Rota de / }).count(), 5);
    const amount = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(started.amountToCollectCents / 100);
    assert((await detail.locator("article header").innerText()).includes(amount));
    await detail.getByText(/Chegada estimada · falt/).first().waitFor();
    const marker = timeline.locator('[aria-current="step"]');
    await marker.getByText("Parada 1", { exact: true }).waitFor();
    const motorcycle = marker.getByRole("img", { name: "Moto CG Fan 160, Prata" });
    assert.equal(await motorcycle.getAttribute("data-silhouette"), "fan");
    await motorcycle.getByText("Entregador", { exact: true }).waitFor();
    assert.equal(await detail.getByText("Entregador de homologação 1", { exact: true }).count(), 0);
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
    const clockPosition = await motorcycle.evaluate(el => parseFloat(getComputedStyle(el).left));
    await page.waitForFunction(initial => {
      const bike = document.querySelector('[aria-current="step"] [style*="--bike-offset"] [role="img"]');
      return bike && parseFloat(getComputedStyle(bike).left) > initial + 0.15;
    }, clockPosition, { timeout: 8_000 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    for (const fraction of [0.25, 0.75, 1.25]) {
      await page.clock.setFixedTime(new Date(started.segment.from + duration * fraction));
      await page.waitForFunction(expected => {
        const target = document.querySelector('[aria-current="step"] [style*="--bike-offset"]') as HTMLElement;
        return target && Math.abs(Number.parseFloat(target.style.getPropertyValue("--bike-offset")) - expected) < 0.1;
      }, Math.min(fraction, 1) * 100 - 100);
      await assertBikePosition(timeline, 0, 1, Math.min(fraction, 1));
      assert.equal((await dispatch()).routes[0].currentPosition, 1);
      if (fraction === 0.75 && process.env.DISPATCH_TEST_ESTIMATE_SCREENSHOT) {
        await page.setViewportSize({ width: 1440, height: 980 });
        await page.screenshot({ path: process.env.DISPATCH_TEST_ESTIMATE_SCREENSHOT, fullPage: true, animations: "disabled" });
      }
    }
    await detail.getByText("Previsão atingida · aguardando confirmação da entrega", { exact: true }).waitFor();
    await page.clock.setFixedTime(new Date());
    assert.equal(navigation.searchParams.get("destination"), `${first.point.latitude},${first.point.longitude}`);
    const reference = stops.find(stop => stop.address === first.address);
    assert(reference && Math.hypot((reference.latitude - first.point.latitude) * 111_000, (reference.longitude - first.point.longitude) * 99_000) <= 40);
    assert(!navigation.searchParams.has("key"));
    const inbound = async (text: string, phone = "5547990000000") => courier.request.post(new URL("/api/whatsapp/inbound-role", url).href, {
      data: { phone, text }, headers: { "x-bot-token": "dispatch-fixture" },
    });
    for (let remaining = stops.length; remaining > 0; remaining--) {
      if (whatsapp && remaining === stops.length) {
        const command = `ENTREGUE #${referenceWithCode}`;
        const delivery = new URL("/api/admin/delivery", url).href;
        await courierPage.getByText(new RegExp(command)).waitFor();
        assert.equal((await courier.request.patch(delivery, { data: { id: started.stops[0].id, deliveryStatus: "delivered" } })).status(), 409);
        assert.match((await (await inbound(command)).json()).reply, /exige código/);
        assert.match((await (await inbound(`${command} 0000`)).json()).reply, /Código incorreto/);
        assert.equal((await (await inbound(`${command} 2468`, "5547991000000")).json()).role, "customer");
        assert.equal((await dispatch()).routes[0].remainingStops, remaining);
        assert.equal(messages.length, 2);
        assert.equal((await (await inbound("ROTA")).json()).reply, messages[0].text);
        assert.match((await (await inbound(`${command} 2468`)).json()).reply, /confirmada/);
        assert.match((await (await inbound(`${command} 2468`)).json()).reply, /não está entre/);
        await courierPage.getByText(new RegExp(command)).waitFor({ state: "hidden", timeout: 20_000 });
        assert.equal((await (await inbound("ROTA")).json()).reply, messages.at(-1)!.text);
      } else {
        await courierPage.getByRole("button", { name: "Concluir entrega" }).first().click();
        await courierPage.getByText(/Entrega #.*concluída/).waitFor();
      }
      if (whatsapp) {
        assert.equal(messages.length, 3 + stops.length - remaining);
        assert(!messages.at(-1)!.text.includes(`Pedido #${started.stops[stops.length - remaining].id.slice(0, 8).toUpperCase()}`));
        assert.equal(messages.at(-1)!.text.split("\n").at(-1), messages[0].text.split("\n").at(-1));
        if (remaining === 1) assert(messages.at(-1)!.text.includes("Google Maps · Retorno à loja"));
      }
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
    await detail.getByText("Retornando à loja", { exact: true }).waitFor();
    assert(returning.segment.to > returning.segment.from);
    await page.clock.setFixedTime(new Date((returning.segment.from + returning.segment.to) / 2));
    await page.waitForFunction(() => {
      const target = document.querySelector('[data-state="returning"] [style*="--bike-offset"]') as HTMLElement;
      return target && Math.abs(Number.parseFloat(target.style.getPropertyValue("--bike-offset")) + 50) < 0.1;
    });
    await assertBikePosition(timeline, stops.length, stops.length + 1, 0.5);
    if (process.env.DISPATCH_TEST_RETURN_SCREENSHOT) await page.screenshot({ path: process.env.DISPATCH_TEST_RETURN_SCREENSHOT, fullPage: true });
    await page.clock.setFixedTime(new Date());
    await courierPage.getByRole("button", { name: "Confirmar retorno" }).click();
    await courierPage.getByText("Retorno à loja confirmado.").waitFor();
    const returned = (await dispatch()).routes[0];
    assert.equal(returned.phase, "returned");
    assert(returned.returnedAt);
    assert.equal(returned.segment, null);
    await assertWaiting(detail);
    await detail.getByText(/Aguardando rota$/).waitFor();
    assert.equal(await overview.getByRole("list", { name: "Linha de entregas em espera" }).count(), 5);
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
    console.log("Navegador validado: avanço da motinha em pixels, retorno, tentativa imediata de WhatsApp, reenvio, confirmação por código, consulta por WhatsApp e link protegido.");
  } finally {
    await browser.close();
    whatsapp?.close();
    await pool.end();
  }
}

void main().catch(error => { console.error(error); process.exitCode = 1; });
