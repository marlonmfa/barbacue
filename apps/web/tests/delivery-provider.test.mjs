import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { DeliveryProvider, deliveryProviderConfigured } from '../src/lib/delivery-provider.ts';
import { createFakeDeliveryProvider } from './fake-delivery-provider.mjs';

const origin = { latitude: -23.55, longitude: -46.63 };
const destination = { latitude: -23.56, longitude: -46.65 };
async function fixture(run) {
  const { server, received } = createFakeDeliveryProvider();
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  const env = { DELIVERY_NOMINATIM_URL: base, DELIVERY_OSRM_URL: base, DELIVERY_OSM_USER_AGENT: 'BarbacueDeliveryTest/1.0 (loopback)', DELIVERY_PROVIDER_TIMEOUT_MS: '3000', NODE_ENV: 'test' };
  const config = values => fetch(base + '/__test/config', { method: 'POST', headers: { Authorization: 'Bearer local-delivery-provider-test', 'Content-Type': 'application/json' }, body: JSON.stringify(values) });
  try { await run({ base, env, received, config }); }
  finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}

test('OSM requires explicit endpoints and production does not accept public demos', () => {
  assert.equal(deliveryProviderConfigured('osm', {}), false);
  assert.equal(deliveryProviderConfigured('google', {}), false);
  assert.equal(deliveryProviderConfigured('google', { GOOGLE_MAPS_API_KEY: 'local-fake-key' }), false);
  assert.equal(deliveryProviderConfigured('osm', { NODE_ENV: 'production', DELIVERY_NOMINATIM_URL: 'https://nominatim.openstreetmap.org', DELIVERY_OSRM_URL: 'https://router.project-osrm.org', DELIVERY_OSM_USER_AGENT: 'ConfiguredUserAgent/1.0' }), false);
});

test('Nominatim caches/coalesces geocoding, identifies itself and OSRM uses longitude,latitude', async () => {
  await fixture(async ({ env, received }) => {
    const provider = new DeliveryProvider('osm', { env });
    const geocodes = await Promise.all([provider.geocode('Rua Teste, 123, São Paulo'), provider.geocode('Rua Teste, 123, São Paulo')]);
    assert.deepEqual(geocodes[0], geocodes[1]);
    await provider.geocode('rua teste, 123, sao paulo');
    assert.equal(received.filter(value => value.path === '/search').length, 1);
    assert.equal(received[0].headers['user-agent'], env.DELIVERY_OSM_USER_AGENT);
    assert.equal(received[0].query.format, 'jsonv2');
    assert.deepEqual(await provider.route(origin, destination), { distanceMeters: 3750, durationSeconds: 660 });
    assert(received[1].path.endsWith('/route/v1/driving/-46.63,-23.55;-46.65,-23.56'));
    assert.equal(received[1].query.overview, 'false');
  });
});

test('unmapped addresses, no route, upstream errors and timeouts never become zero-cost routes', async () => {
  await fixture(async ({ env, config }) => {
    const provider = new DeliveryProvider('osm', { env });
    await assert.rejects(provider.geocode('Rua inexistente, 123, São Paulo'), error => error.code === 'delivery_address_not_found');
    await config({ routeCode: 'NoRoute' });
    await assert.rejects(provider.route(origin, destination), error => error.code === 'delivery_route_not_found');
    await config({ status: 503 });
    await assert.rejects(provider.route(origin, destination), error => error.code === 'delivery_provider_unavailable');
    await config({ status: 200, routeCode: 'Ok', distanceMeters: -1 });
    await assert.rejects(provider.route(origin, destination), error => error.code === 'delivery_provider_unavailable');
    await config({ distanceMeters: 3750, delayMs: 400 });
    const shortDeadline = new DeliveryProvider('osm', { env: { ...env, DELIVERY_PROVIDER_TIMEOUT_MS: '100' } });
    await assert.rejects(shortDeadline.route(origin, destination), error => error.code === 'delivery_provider_unavailable');
  });
});

test('geocoding rejects city-level results instead of quoting from a city center', async () => {
  const provider = new DeliveryProvider('osm', { env: { DELIVERY_NOMINATIM_URL: 'http://127.0.0.1:1', DELIVERY_OSRM_URL: 'http://127.0.0.1:1', DELIVERY_OSM_USER_AGENT: 'BarbacueDeliveryTest/1.0' }, fetch: async () => Response.json([{ lat: '-23.55', lon: '-46.63', addresstype: 'city', display_name: 'São Paulo' }]) });
  await assert.rejects(provider.geocode('São Paulo, Estado de São Paulo'), error => error.code === 'delivery_address_not_found');
  const blankCoordinates = new DeliveryProvider('osm', { env: { DELIVERY_NOMINATIM_URL: 'http://127.0.0.1:1', DELIVERY_OSRM_URL: 'http://127.0.0.1:1', DELIVERY_OSM_USER_AGENT: 'BarbacueDeliveryTest/1.0' }, fetch: async () => Response.json([{ lat: ' ', lon: '', addresstype: 'house' }]) });
  await assert.rejects(blankCoordinates.geocode('Rua Teste, 123, São Paulo'), error => error.code === 'delivery_address_not_found');
});
