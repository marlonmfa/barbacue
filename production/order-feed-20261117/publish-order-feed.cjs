// Publica o feed de pedidos (17/11/2026) sobre o build no ar Uzu3i5IkqaLwlx5b3GjSA.
// Mesmo método da publicação de 15/11: candidata na porta 3017, troca do server.js, reversão automática.
const fs = require('node:fs');
const cp = require('node:child_process');
const http = require('node:http');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const ROOT = '/root/deploy-backups/barbacue-order-feed-20261117';
const WEB = '/root/barbacue/apps/web';
const DIST = '.next-order-feed-20261117';
const PREVIOUS_DIST = '.next-external-accounts-v2';
const EXPECTED_BUILD = 'Uzu3i5IkqaLwlx5b3GjSA';
const NEW_ROUTES = ['/admin/orders/feed/page', '/api/admin/orders/[id]/comanda/route'];
const hash = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const processes = () => JSON.parse(cp.execFileSync('pm2', ['jlist'], { encoding: 'utf8' }));
const before = processes();
const app = before.find(p => p.name === 'barbacue');
const bot = before.find(p => p.name === 'barbacue-whatsapp');
assert.equal(cp.execFileSync('hostname', { encoding: 'utf8' }).trim(), 'otherpages');
assert.equal(app.pm2_env.status, 'online'); assert.equal(bot.pm2_env.status, 'online');
assert.equal(fs.readFileSync(WEB + '/' + PREVIOUS_DIST + '/BUILD_ID', 'utf8').trim(), EXPECTED_BUILD);
assert(fs.readFileSync(WEB + '/server.js', 'utf8').includes(PREVIOUS_DIST), 'server.js não aponta para o build esperado');
const oldManifest = JSON.parse(fs.readFileSync(WEB + '/' + PREVIOUS_DIST + '/server/app-paths-manifest.json'));
const newManifest = JSON.parse(fs.readFileSync(ROOT + '/candidate/apps/web/' + DIST + '/server/app-paths-manifest.json'));
assert(Object.keys(oldManifest).every(k => k in newManifest), 'candidata perdeu rotas');
for (const r of NEW_ROUTES) assert(r in newManifest, r);
const originalServerHash = hash(WEB + '/server.js');
if (!fs.existsSync(ROOT + '/pm2-before.private.json')) fs.writeFileSync(ROOT + '/pm2-before.private.json', JSON.stringify(app), { mode: 0o600, flag: 'wx' });
if (!fs.existsSync(ROOT + '/server.before.js')) fs.copyFileSync(WEB + '/server.js', ROOT + '/server.before.js', fs.constants.COPYFILE_EXCL);
assert.equal(hash(ROOT + '/server.before.js'), originalServerHash);
fs.cpSync(WEB + '/' + PREVIOUS_DIST + '/node_modules', ROOT + '/candidate/apps/web/' + DIST + '/node_modules', { recursive: true, verbatimSymlinks: true });
const env = Object.fromEntries(Object.entries(app.pm2_env).filter(([, v]) => typeof v === 'string'));
const log = fs.openSync(ROOT + '/candidate.log', 'a', 0o600);
const candidate = cp.spawn(process.execPath, [ROOT + '/candidate/apps/web/server.js'], { cwd: ROOT + '/candidate/apps/web', env: { ...env, PORT: '3017', HOSTNAME: '127.0.0.1' }, stdio: ['ignore', log, log] });
function get(port, p) { return new Promise((resolve, reject) => { const req = http.get({ host: '127.0.0.1', port, path: p, headers: { Host: 'barbacue.cog.ia.br' } }, res => { let body = ''; res.on('data', d => body += d); res.on('end', () => resolve({ status: res.statusCode, body, location: res.headers.location })); }); req.on('error', reject); req.setTimeout(15000, () => req.destroy(new Error('timeout'))); }); }
function restart(extra) { return new Promise((resolve, reject) => { const pm2 = require('/usr/lib/node_modules/pm2'); pm2.connect(e => { if (e) return reject(e); pm2.restart({ name: 'barbacue', updateEnv: true, env: extra }, err => { pm2.disconnect(); err ? reject(err) : resolve(); }); }); }); }
async function ready(port) { for (let i = 0; i < 40; i++) { try { const r = await get(port, '/api/store-status'); if (r.status === 200) return; } catch {} await new Promise(r => setTimeout(r, 500)); } throw Error('readiness failed on ' + port); }
async function checks(port) {
  const out = {};
  for (const p of ['/', '/api/store-status', '/admin/login']) { const r = await get(port, p); assert(r.status < 400, p + ' ' + r.status); out[p] = r.status; }
  const feed = await get(port, '/admin/orders/feed'); assert([307, 302, 401].includes(feed.status), 'feed sem login ' + feed.status); out.feed = feed.status;
  const pdf = await get(port, '/api/admin/orders/00000000-0000-0000-0000-000000000000/comanda?parte=1'); assert([401, 403, 307].includes(pdf.status), 'comanda sem login ' + pdf.status); out.comanda = pdf.status;
  const orders = await get(port, '/admin/orders'); assert([307, 302, 401].includes(orders.status)); out.orders = orders.status;
  return out;
}
(async () => {
  let swapped = false;
  try {
    await ready(3017);
    const candidateChecks = await checks(3017);
    const current = processes().find(p => p.name === 'barbacue');
    assert.equal(current.pid, app.pid); assert.equal(hash(WEB + '/server.js'), originalServerHash);
    fs.cpSync(ROOT + '/candidate/apps/web/' + DIST, WEB + '/' + DIST, { recursive: true, verbatimSymlinks: true });
    fs.cpSync(WEB + '/' + PREVIOUS_DIST + '/static', WEB + '/' + DIST + '/static', { recursive: true, force: false });
    fs.copyFileSync(ROOT + '/candidate/apps/web/server.js', WEB + '/server.order-feed.next.js');
    fs.renameSync(WEB + '/server.order-feed.next.js', WEB + '/server.js'); swapped = true;
    await restart(env);
    await ready(Number(env.PORT || 3007));
    const liveChecks = await checks(Number(env.PORT || 3007));
    const after = processes();
    for (const p of before.filter(p => p.name !== 'barbacue' && p.name !== 'barbacue-comparison-notifier')) assert.equal(after.find(x => x.pm_id === p.pm_id)?.pid, p.pid, 'outro processo reiniciou: ' + p.name);
    const validation = { published: true, previousBuild: EXPECTED_BUILD, build: fs.readFileSync(WEB + '/' + DIST + '/BUILD_ID', 'utf8').trim(), routesBefore: Object.keys(oldManifest).length, routesAfter: Object.keys(newManifest).length, candidateChecks, liveChecks, backup: ROOT, rollback: 'cp server.before.js /root/barbacue/apps/web/server.js && pm2 restart barbacue' };
    fs.writeFileSync(ROOT + '/publication.json', JSON.stringify(validation, null, 2)); console.log(JSON.stringify(validation));
  } catch (e) {
    if (swapped) { fs.copyFileSync(ROOT + '/server.before.js', WEB + '/server.js'); await restart(env); console.error('REVERTIDO'); }
    console.error(e.stack || e.message); process.exitCode = 1;
  } finally { candidate.kill('SIGTERM'); }
})();
