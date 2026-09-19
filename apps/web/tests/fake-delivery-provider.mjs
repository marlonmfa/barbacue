// Local-only HTTP fixture. Does not contact Google, OSM or any real provider.
import http from 'node:http';
import { pathToFileURL } from 'node:url';

export function createFakeDeliveryProvider({ secret = 'local-delivery-provider-test' } = {}) {
  let config = { distanceMeters: 3750, durationSeconds: 660, routeCode: 'Ok', geocodeEmpty: false, delayMs: 0, status: 200 };
  const received = [];
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const respond = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
    if (url.pathname === '/__test/config') {
      if (req.headers.authorization !== `Bearer ${secret}`) return respond(401, { error: 'unauthorized' });
      if (req.method === 'GET') return respond(200, { config, received });
      let raw = ''; for await (const chunk of req) { raw += chunk; if (raw.length > 4096) return respond(413, {}); }
      let body; try { body = JSON.parse(raw); } catch { return respond(400, {}); }
      config = { ...config, ...body };
      if (body.reset) { config = { distanceMeters: 3750, durationSeconds: 660, routeCode: 'Ok', geocodeEmpty: false, delayMs: 0, status: 200 }; received.length = 0; }
      return respond(200, { config });
    }
    let raw = ''; for await (const chunk of req) raw += chunk;
    received.push({ path: url.pathname, query: Object.fromEntries(url.searchParams), headers: req.headers, body: raw ? JSON.parse(raw) : null });
    if (config.delayMs) await new Promise(resolve => setTimeout(resolve, Math.min(20_000, config.delayMs)));
    if (config.status !== 200) return respond(config.status, { error: 'fixture provider failure' });
    if (url.pathname.endsWith('/search')) {
      if (config.geocodeEmpty || /inexistente/i.test(url.searchParams.get('q') ?? '')) return respond(200, []);
      return respond(200, [{ lat: '-23.5600', lon: '-46.6500', display_name: 'Rua de Teste, 123, São Paulo, Brasil', addresstype: 'house', address: { house_number: '123', road: 'Rua de Teste' } }]);
    }
    if (url.pathname.includes('/route/v1/driving/')) return respond(200, { code: config.routeCode, routes: config.routeCode === 'Ok' ? [{ distance: config.distanceMeters, duration: config.durationSeconds }] : [] });
    return respond(404, { error: 'unknown fixture endpoint' });
  });
  return { server, received };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.FAKE_DELIVERY_PORT || 3199);
  const { server } = createFakeDeliveryProvider({ secret: process.env.FAKE_DELIVERY_SECRET || 'local-delivery-provider-test' });
  server.listen(port, '127.0.0.1', () => console.log(`Fake delivery provider on http://127.0.0.1:${port}; loopback fixtures only.`));
  process.on('SIGTERM', () => server.close());
}
