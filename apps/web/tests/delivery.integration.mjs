// Disposable local server/database + fake-delivery-provider.mjs only.
import assert from 'node:assert/strict';
import pg from 'pg';
const base = process.env.DELIVERY_TEST_URL;
const database = process.env.DATABASE_URL;
const fake = process.env.DELIVERY_FAKE_URL || 'http://127.0.0.1:3199';
assert(base && ['127.0.0.1', 'localhost'].includes(new URL(base).hostname), 'Local web server required');
assert(database && ['127.0.0.1', 'localhost'].includes(new URL(database).hostname) && new URL(database).pathname.includes('delivery_test'), 'Disposable delivery_test database required');
assert(['127.0.0.1', 'localhost'].includes(new URL(fake).hostname), 'Local fake provider required');
const pool = new pg.Pool({ connectionString: database });
const marker = `delivery-${Date.now()}`;
const customerPhone = `5511${Date.now()}`;
const quotes = [];
let assertions = 0, productId, couponId, tableId;
let settingsBefore, storeBefore;
async function request(path, { method = 'GET', body, cookie, raw } = {}) {
  const response = await fetch(base + path, { method, redirect: 'manual', headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, ...(raw ? { body: raw } : body ? { body: JSON.stringify(body) } : {}) });
  return { response, data: await response.json() };
}
function status(result, expected) { assert.equal(result.response.status, expected, JSON.stringify(result.data)); assertions++; return result.data; }
async function configureFake(config) {
  const res = await fetch(fake + '/__test/config', { method: 'POST', headers: { Authorization: `Bearer ${process.env.FAKE_DELIVERY_SECRET || 'local-delivery-provider-test'}`, 'Content-Type': 'application/json' }, body: JSON.stringify(config) });
  assert.equal(res.status, 200);
}
async function quote(address = `Rua Teste, 123, São Paulo ${marker}`, brand = 'barbacue') {
  const result = await request('/api/delivery/quote', { method: 'POST', body: { address, brand } });
  if (result.data.quoteId) quotes.push(result.data.quoteId);
  return result;
}
const config = { enabled: true, provider: 'osm', originAddress: 'Rua da Loja, 100, São Paulo', originLatitude: -23.55, originLongitude: -46.63, baseFeeCents: 300, feePerKmCents: 120, minFeeCents: 500, maxDistanceMeters: 10_000 };
const order = extra => ({ customerName: 'Cliente teste frete', customerPhone, deliveryAddress: `Rua Teste, 123, São Paulo ${marker}`, brand: 'barbacue', paymentMethod: 'cash', items: [{ productId, qty: 1 }], ...extra });

try {
  settingsBefore = (await pool.query('SELECT * FROM delivery_settings WHERE id=1')).rows[0];
  storeBefore = (await pool.query('SELECT * FROM store_settings WHERE id=1')).rows[0];
  await pool.query("INSERT INTO store_settings(id,store_name,is_open,weekly_hours) VALUES(1,'Teste',true,null) ON CONFLICT(id) DO UPDATE SET is_open=true,weekly_hours=null");
  productId = (await pool.query('INSERT INTO products(name,price_cents,available) VALUES($1,3000,true) RETURNING id', [marker])).rows[0].id;
  couponId = (await pool.query("INSERT INTO coupons(code,discount_type,discount_value,active) VALUES($1,'flat',500,true) RETURNING id", [marker.toUpperCase()])).rows[0].id;
  const table = (await pool.query('INSERT INTO restaurant_tables(number,label) VALUES(9018,$1) RETURNING id,token', [marker])).rows[0]; tableId = table.id;
  await configureFake({ reset: true });
  status(await request('/api/admin/delivery-settings'), 401);
  status(await request('/api/admin/delivery-settings/geocode', { method: 'POST', body: { address: config.originAddress, provider: 'osm' } }), 401);
  const login = await request('/api/admin/auth', { method: 'POST', body: { password: process.env.ADMIN_PASSWORD } }); status(login, 200);
  const admin = login.response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
  const overview = status(await request('/api/admin/delivery-settings', { cookie: admin }), 200);
  assert(overview.providers.osm.configured); assert(!JSON.stringify(overview).includes('API_KEY')); assertions += 2;
  const save = input => request('/api/admin/delivery-settings', { method: 'PUT', cookie: admin, body: input });
  status(await save({ ...config, enabled: false }), 200);
  assert.deepEqual(status(await request('/api/delivery/quote'), 200), { enabled: false }); assertions++;
  assert.equal(status(await quote(), 409).error, 'delivery_disabled'); assertions++;
  const legacy = status(await request('/api/orders', { method: 'POST', body: order() }), 201);
  assert.equal(legacy.deliveryFeeCents, 0); assert.equal(legacy.totalCents, 3000); assertions += 2;
  status(await save({ ...config, originLatitude: null, originLongitude: null }), 422);
  status(await save({ ...config, baseFeeCents: 0, feePerKmCents: 0, minFeeCents: 0 }), 422);
  status(await save({ ...config, GOOGLE_MAPS_API_KEY: 'tamper' }), 422);
  status(await save({ ...config, provider: 'google' }), 422);
  const located = status(await request('/api/admin/delivery-settings/geocode', { method: 'POST', cookie: admin, body: { address: config.originAddress, provider: 'osm' } }), 200);
  assert.equal(located.latitude, -23.56); assert.equal(located.longitude, -46.65); assertions += 2;
  status(await save(config), 200);
  assert.deepEqual(status(await request('/api/delivery/quote'), 200), { enabled: true }); assertions++;
  status(await request('/api/delivery/quote', { method: 'POST', body: { address: 'São Paulo', brand: 'barbacue' } }), 422);
  status(await request('/api/delivery/quote', { method: 'POST', body: { address: config.originAddress, brand: 'barbacue', feeCents: 0 } }), 422);
  status(await request('/api/delivery/quote', { method: 'POST', raw: JSON.stringify({ address: 'a'.repeat(5000) }) }), 413);
  const quoted = status(await quote(), 201);
  assert.equal(quoted.feeCents, 750); assert.equal(quoted.distanceMeters, 3750); assert.equal(quoted.durationSeconds, 660); assertions += 3;
  assert(Object.values(quoted.routeLinks).every(link => link.startsWith('https://'))); assertions++;
  const expiresIn = new Date(quoted.expiresAt).getTime() - Date.now(); assert(expiresIn > 14 * 60_000 && expiresIn <= 15 * 60_000); assertions++;
  const storedQuote = (await pool.query('SELECT * FROM delivery_quotes WHERE id=$1', [quoted.quoteId])).rows[0];
  assert.equal(storedQuote.brand, 'barbacue'); assert.equal(storedQuote.origin_latitude, config.originLatitude); assert.equal(storedQuote.destination_longitude, -46.65); assertions += 3;
  assert.equal(status(await request('/api/orders', { method: 'POST', body: order() }), 422).code, 'delivery_quote_required'); assertions++;
  status(await request('/api/orders', { method: 'POST', body: order({ deliveryQuoteId: quoted.quoteId, deliveryAddress: 'Outro endereço, 321, São Paulo' }) }), 422);
  const otherBrand = status(await quote(undefined, 'chelas'), 201);
  status(await request('/api/orders', { method: 'POST', body: order({ deliveryQuoteId: otherBrand.quoteId }) }), 422);
  const expiring = status(await quote(), 201);
  await pool.query("UPDATE delivery_quotes SET expires_at=now()-interval '1 second' WHERE id=$1", [expiring.quoteId]);
  status(await request('/api/orders', { method: 'POST', body: order({ deliveryQuoteId: expiring.quoteId }) }), 422);
  status(await request('/api/orders', { method: 'POST', body: order({ deliveryQuoteId: quoted.quoteId, changeForCents: 3500 }) }), 422);
  const countBefore = (await pool.query('SELECT used_count FROM coupons WHERE id=$1', [couponId])).rows[0].used_count;
  status(await request('/api/orders', { method: 'POST', body: order({ deliveryQuoteId: quoted.quoteId, couponCode: marker, changeForCents: 3200 }) }), 422);
  assert.equal((await pool.query('SELECT used_count FROM coupons WHERE id=$1', [couponId])).rows[0].used_count, countBefore); assertions++;
  const accepted = status(await request('/api/orders', { method: 'POST', body: order({ deliveryQuoteId: quoted.quoteId, couponCode: marker, changeForCents: 3500, deliveryFeeCents: 0 }) }), 201);
  assert.equal(accepted.totalCents, 3250); assert.equal(accepted.discountCents, 500); assert.equal(accepted.deliveryFeeCents, 750); assertions += 3;
  const storedOrder = (await pool.query('SELECT * FROM orders WHERE id=$1', [accepted.orderId])).rows[0];
  assert.equal(storedOrder.delivery_quote_id, quoted.quoteId); assert.deepEqual(storedOrder.delivery_route, quoted.routeLinks); assert.equal(storedOrder.delivery_distance_meters, 3750); assertions += 3;
  status(await request('/api/orders', { method: 'POST', body: order({ orderType: 'dine_in', tableToken: table.token, deliveryQuoteId: quoted.quoteId }) }), 422);
  const dineIn = status(await request('/api/orders', { method: 'POST', body: order({ orderType: 'dine_in', tableToken: table.token, deliveryAddress: undefined }) }), 201);
  assert.equal(dineIn.deliveryFeeCents, 0); assertions++;
  status(await save({ ...config, feePerKmCents: 200 }), 200);
  const fresh = status(await quote(), 201); assert.equal(fresh.feeCents, 1050); assertions++;
  assert.equal((await pool.query('SELECT fee_cents FROM delivery_quotes WHERE id=$1', [quoted.quoteId])).rows[0].fee_cents, 750); assertions++;
  status(await save({ ...config, maxDistanceMeters: 3000 }), 200);
  assert.equal(status(await quote(), 422).error, 'outside_delivery_area'); assertions++;
  status(await save(config), 200);
  await configureFake({ routeCode: 'NoRoute' });
  assert.equal(status(await quote(), 422).error, 'delivery_route_not_found'); assertions++;
  await configureFake({ status: 503 });
  assert.equal(status(await quote(), 503).error, 'delivery_provider_unavailable'); assertions++;
  await configureFake({ status: 200, routeCode: 'Ok', delayMs: 1500 });
  assert.equal(status(await quote(), 503).error, 'delivery_provider_unavailable'); assertions++;
  await configureFake({ reset: true });
  assert.equal(status(await quote(`Rua inexistente, 123, São Paulo ${marker}`), 422).error, 'delivery_address_not_found'); assertions++;
  status(await save({ ...config, enabled: false }), 200);
  assert.equal(status(await request('/api/orders', { method: 'POST', body: order({ deliveryQuoteId: quoted.quoteId }) }), 422).code, 'delivery_disabled'); assertions++;
  console.log(`Passed ${assertions} delivery API assertions: config/auth, immutable road quote, expiry, range, provider failures, order binding, coupons, cash change and legacy/dine-in compatibility.`);
} finally {
  await configureFake({ reset: true });
  await pool.query('DELETE FROM orders WHERE customer_phone=$1', [customerPhone]);
  await pool.query('DELETE FROM customers WHERE phone=$1', [customerPhone]);
  if (quotes.length) await pool.query('DELETE FROM delivery_quotes WHERE id=ANY($1::uuid[])', [quotes]);
  if (productId) await pool.query('DELETE FROM products WHERE id=$1', [productId]);
  if (couponId) await pool.query('DELETE FROM coupons WHERE id=$1', [couponId]);
  if (tableId) await pool.query('DELETE FROM restaurant_tables WHERE id=$1', [tableId]);
  if (settingsBefore) {
    await pool.query('UPDATE delivery_settings SET enabled=$1,provider=$2,origin_address=$3,origin_latitude=$4,origin_longitude=$5,base_fee_cents=$6,fee_per_km_cents=$7,min_fee_cents=$8,max_distance_meters=$9,updated_at=$10 WHERE id=1', [settingsBefore.enabled, settingsBefore.provider, settingsBefore.origin_address, settingsBefore.origin_latitude, settingsBefore.origin_longitude, settingsBefore.base_fee_cents, settingsBefore.fee_per_km_cents, settingsBefore.min_fee_cents, settingsBefore.max_distance_meters, settingsBefore.updated_at]);
  } else await pool.query('DELETE FROM delivery_settings WHERE id=1');
  if (storeBefore) await pool.query('UPDATE store_settings SET is_open=$1,weekly_hours=$2 WHERE id=1', [storeBefore.is_open, JSON.stringify(storeBefore.weekly_hours)]);
  await pool.end();
}
