import { normalizeOrigin } from './settings.mjs';

export const localOrigin = 'barbacue-app://desktop';
export const maxRequestBytes = 24 * 1024 * 1024;
const routes = [
  [/^\/api\/admin\/auth$/, ['GET', 'POST', 'DELETE']],
  [/^\/api\/admin\/(dashboard|customers|beta|system)$/, ['GET']],
  [/^\/api\/admin\/change-password$/, ['POST']],
  [/^\/api\/admin\/(products|categories|coupons|tables|staff|employees|closed-days|catalogs)$/, ['GET', 'POST']],
  [/^\/api\/admin\/(products|categories|coupons|tables|staff|employees|closed-days)\/[A-Za-z0-9_-]+$/, ['PATCH', 'DELETE']],
  [/^\/api\/admin\/catalogs\/(barbacue|barbadog|chelas)\/[A-Za-z0-9_-]+$/, ['PATCH', 'DELETE']],
  [/^\/api\/admin\/(orders|kitchen|waiter|delivery|settings|delivery-settings|erp|ifood)$/, ['GET', 'POST', 'PUT', 'PATCH']],
  [/^\/api\/admin\/orders\/[A-Za-z0-9_-]+$/, ['PATCH']],
  [/^\/api\/admin\/orders\/import$/, ['POST']],
  [/^\/api\/admin\/kitchen\/(printing|printers)$/, ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']],
  [/^\/api\/admin\/delivery-settings\/geocode$/, ['POST']],
  [/^\/api\/admin\/ifood\/(orders|stores)\/[A-Za-z0-9_-]+$/, ['GET', 'POST', 'PATCH', 'DELETE']],
  [/^\/api\/admin\/whatsapp\/(accounts|chats|messages|read|pair|pair-cancel|disconnect)$/, ['GET', 'POST']],
  [/^\/api\/admin\/whatsapp(?:\/media(?:\/[A-Za-z0-9_%.-]+)*)?$/, ['GET', 'HEAD']],
  [/^\/api\/admin\/(upload|impersonate)$/, ['POST']],
  [/^\/api\/admin\/downloads\/windows$/, ['GET', 'HEAD']],
  [/^\/api\/(products|settings|store-status|account)$/, ['GET']],
  [/^\/api\/(orders|chat|transcribe)$/, ['POST']],
  [/^\/api\/delivery\/quote$/, ['GET', 'POST']],
  [/^\/api\/tables\/resolve$/, ['GET']],
  [/^\/api\/self-service\/orders$/, ['POST']],
  [/^\/api\/media\/[A-Za-z0-9_-]+$/, ['GET', 'HEAD']],
  [/^\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+\.(?:png|jpe?g|webp|gif|avif)$/i, ['GET', 'HEAD']],
];
export function isLocalUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'barbacue-app:' && url.hostname === 'desktop' && !url.port && !url.username && !url.password;
  } catch { return false; }
}
export function canRequestLocalAudio(permission, details, pageUrl) {
  return permission === 'media' && details?.isMainFrame === true && isLocalUrl(pageUrl) && isLocalUrl(details.requestingUrl)
    && Array.isArray(details.mediaTypes) && details.mediaTypes.length === 1 && details.mediaTypes[0] === 'audio';
}
export function apiTarget(value, method, origin) {
  if (!isLocalUrl(value)) throw new Error('Origem local inválida.');
  const url = new URL(value);
  if (/%2f|%5c|%2e|\\/i.test(url.pathname) || !routes.some(([pattern, methods]) => pattern.test(url.pathname) && methods.includes(method))) throw new Error('Operação de API não permitida.');
  return `${normalizeOrigin(origin)}${url.pathname}${url.search}`;
}
async function requestBody(request) {
  if (!request.body || ['GET', 'HEAD'].includes(request.method)) return undefined;
  const reader = request.body.getReader(), chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maxRequestBytes) { await reader.cancel(); throw new Error('Arquivo ou solicitação muito grande.'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks, size);
}
export function createOnlineApi({ origin, fetch, onResponse = () => {} }) {
  const onlineOrigin = normalizeOrigin(origin);
  return async request => {
    let target;
    try { target = apiTarget(request.url, request.method, onlineOrigin); }
    catch { return Response.json({ error: 'Operação de API não permitida.' }, { status: 403 }); }
    try {
      const body = await requestBody(request);
      const headers = new Headers({ Accept: request.headers.get('accept') || 'application/json' });
      const contentType = request.headers.get('content-type');
      if (contentType) headers.set('Content-Type', contentType);
      const response = await fetch(target, { method: request.method, headers, body,
        credentials: 'include', redirect: 'manual', cache: 'no-store',
        signal: AbortSignal.any([request.signal, AbortSignal.timeout(70_000)]),
      });
      // Never follow a redirect with online session credentials or load HTML
      // from the server as application code.
      if (response.status >= 300 && response.status < 400) {
        await response.body?.cancel();
        return Response.json({ error: 'A API redirecionou a solicitação. Confira o endereço da loja.' }, { status: 502 });
      }
      if (/text\/html|javascript/i.test(response.headers.get('content-type') || '')) {
        await response.body?.cancel();
        return Response.json({ error: 'O servidor não respondeu como API. Confira o endereço e a versão publicada.' }, { status: 502 });
      }
      await onResponse({ path: new URL(target).pathname, status: response.status });
      const output = new Headers({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox" });
      for (const key of ['content-type', 'content-disposition', 'retry-after', 'accept-ranges']) {
        if (response.headers.has(key)) output.set(key, response.headers.get(key));
      }
      return new Response(['HEAD'].includes(request.method) || [204, 205, 304].includes(response.status) ? null : response.body, { status: response.status, headers: output });
    } catch (error) {
      onResponse({ path: new URL(target).pathname, status: 503 });
      return Response.json({ error: error?.message === 'Arquivo ou solicitação muito grande.' ? error.message : 'Não foi possível acessar a API online. Confira a conexão antes de tentar novamente.' }, { status: error?.message === 'Arquivo ou solicitação muito grande.' ? 413 : 503 });
    }
  };
}
