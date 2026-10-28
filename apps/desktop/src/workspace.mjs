import { BrowserWindow, session, shell } from 'electron';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { moduleGroups, modules, moduleForUrl, homePath } from './modules.mjs';
import { createOnlineApi, isLocalUrl, localOrigin } from './api-client.mjs';

const routePaths = new Set([...modules.map(item => item.path), '/admin/login', '/admin/change-password', '/totem', '/']);
export function isLocalPage(value) {
  return isLocalUrl(value) && routePaths.has(new URL(value).pathname);
}
const mime = { '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
let protocolRegistered = false;
export function createWorkspace({ root, serverUrl, prefs, showSetup, isQuitting }) {
  const uiSession = session.fromPartition('persist:barbacue-desktop-ui');
  const onlineSession = session.fromPartition('persist:barbacue-store');
  let status = 'loading';
  const window = new BrowserWindow({ width: 1440, height: 1000, minWidth: 1000, minHeight: 720,
    title: 'Barbacue · Administração', icon: join(root, 'assets/icon.png'), backgroundColor: '#101416',
    webPreferences: { ...prefs, session: uiSession, preload: join(root, 'src/workspace-preload.cjs'),
      autoplayPolicy: 'no-user-gesture-required', backgroundThrottling: false } });
  const contents = window.webContents;
  const state = () => ({ server: serverUrl, status, moduleId: moduleForUrl(contents.getURL())?.id ?? '',
    canGoBack: contents.navigationHistory.canGoBack(), canGoForward: contents.navigationHistory.canGoForward(), groups: moduleGroups });
  function update(next = status) {
    status = next;
    if (!contents.isDestroyed()) contents.send('workspace:updated', state());
  }
  const forward = createOnlineApi({ origin: serverUrl, fetch: (url, init) => onlineSession.fetch(url, init),
    onResponse: async ({ path, status: code }) => {
      update(code >= 500 ? 'error' : 'ready');
      if (path === '/api/admin/auth' && code < 300) await onlineSession.cookies.flushStore();
      if (code === 401 && path.startsWith('/api/admin/') && path !== '/api/admin/auth' && !contents.isDestroyed()) contents.send('workspace:sessionExpired');
    },
  });
  if (protocolRegistered) uiSession.protocol.unhandle('barbacue-app');
  protocolRegistered = true;
  uiSession.protocol.handle('barbacue-app', async request => {
    if (!isLocalUrl(request.url)) return new Response('Origem inválida', { status: 403 });
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) return forward(request);
    if (request.method !== 'GET') return new Response('Método não permitido', { status: 405 });
    let path, type;
    if (routePaths.has(url.pathname)) { path = join(root, 'ui/workspace.html'); type = 'text/html; charset=utf-8'; }
    else if (/^\/desktop-assets\/(app\.js|app\.css|tailwind\.css)$/.test(url.pathname)) {
      path = join(root, 'ui/renderer', url.pathname.split('/').at(-1)); type = url.pathname.endsWith('.js') ? mime['.js'] : mime['.css'];
    } else if (/^\/brand\/[a-zA-Z0-9_-]+\.(png|jpg|webp|svg|ico)$/.test(url.pathname)) {
      path = join(root, 'ui/renderer', url.pathname); type = mime[url.pathname.slice(url.pathname.lastIndexOf('.'))];
    } else if (/^\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+\.(?:png|jpe?g|webp|gif|avif)$/i.test(url.pathname)) return forward(request);
    else return new Response('Arquivo local não encontrado', { status: 404 });
    try {
      return new Response(await readFile(path), { headers: { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data: blob:; media-src 'self' https: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-src 'none'; form-action 'self'",
      } });
    } catch { return new Response('Recompile as telas locais do aplicativo.', { status: 503 }); }
  });
  contents.setWindowOpenHandler(({ url }) => {
    if (isLocalPage(url)) { void contents.loadURL(url); return { action: 'deny' }; }
    try { if (new URL(url).protocol === 'https:') void shell.openExternal(url).catch(() => {}); } catch {}
    // Authenticated API attachments are downloaded by the same local session.
    if (isLocalUrl(url) && new URL(url).pathname.startsWith('/api/')) uiSession.downloadURL(url);
    return { action: 'deny' };
  });
  contents.on('will-navigate', (event, url) => {
    if (!isLocalPage(url)) {
      event.preventDefault();
      if (isLocalUrl(url) && new URL(url).pathname.startsWith('/api/')) uiSession.downloadURL(url);
      else { try { if (new URL(url).protocol === 'https:') void shell.openExternal(url).catch(() => {}); } catch {} }
    }
  });
  contents.on('will-redirect', (event, url) => { if (!isLocalPage(url)) event.preventDefault(); });
  contents.on('will-attach-webview', event => event.preventDefault());
  contents.on('did-finish-load', () => update());
  contents.on('did-navigate', () => update());
  contents.on('render-process-gone', () => { if (!window.isDestroyed()) void contents.loadURL(`${localOrigin}${homePath}`); });
  window.on('close', event => { if (!isQuitting()) { event.preventDefault(); window.hide(); } });
  async function open(path) {
    window.show(); window.focus();
    if (path !== undefined && !modules.some(item => item.path === path)) throw new Error('Função inválida.');
    if (path === undefined && contents.getURL()) return;
    await contents.loadURL(`${localOrigin}${path ?? homePath}`);
  }
  async function command(name) {
    if (name === 'setup') return showSetup();
    if (name === 'reload') { contents.reload(); return; }
    if (name === 'back') { if (contents.navigationHistory.canGoBack()) contents.navigationHistory.goBack(); return; }
    if (name === 'forward') { if (contents.navigationHistory.canGoForward()) contents.navigationHistory.goForward(); return; }
    if (name === 'print') { contents.print({ silent: false }); return; }
    throw new Error('Comando inválido.');
  }
  return { window, contents, state, open, command, localUrl: `${localOrigin}${homePath}`, isTrustedUrl: isLocalPage };
}
