import { execFileSync, spawn } from 'node:child_process';
import { openSync, writeFileSync, readFileSync } from 'node:fs';
import { createHash, createHmac } from 'node:crypto';
import { createRequire } from 'node:module';
import net from 'node:net';
import assert from 'node:assert/strict';

const candidate = '/root/barbacue-next-20260910T142106Z';
const backup = '/root/deploy-backups/barbacue-20260910T142106Z';
const production = JSON.parse(execFileSync('pm2', ['jlist'], { encoding: 'utf8' })).find(p => p.name === 'barbacue');
assert(production?.pm2_env);
const env = { ...process.env, ...production.pm2_env.env, NODE_ENV: 'production', PORT: '43007', HOSTNAME: '127.0.0.1' };
for (const [key, value] of Object.entries(production.pm2_env)) {
  if (/^(DATABASE_URL|ADMIN_|OPENAI_|DOMAIN|PUBLIC_SITE_URL|BOT_|PRINT_|DELIVERY_)/.test(key) && typeof value === 'string') env[key] = value;
}
assert(env.DATABASE_URL && env.ADMIN_COOKIE_SECRET);
const probe = net.createServer();
await new Promise((resolve, reject) => { probe.once('error', reject); probe.listen(43007, '127.0.0.1', resolve); });
await new Promise(resolve => probe.close(resolve));
const fd = openSync(`${backup}/candidate.log`, 'a', 0o600);
const child = spawn(process.execPath, [`${candidate}/apps/web/server.js`], { cwd: candidate, env, detached: true, stdio: ['ignore', fd, fd] });
child.unref();
writeFileSync(`${backup}/candidate.pid`, String(child.pid));
const base = 'http://127.0.0.1:43007';
const results = [];
try {
  let ready = false;
  for (let i = 0; i < 30; i++) {
    try { const r = await fetch(`${base}/admin/login`, { signal: AbortSignal.timeout(1000) }); if (r.status === 200) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert(ready, 'Candidate did not become ready');
  const get = (path, cookie = '', method = 'GET', host = 'barbacue.cog.ia.br') => fetch(`${base}${path}`, { method, redirect: 'manual', headers: { Cookie: cookie, Host: host }, signal: AbortSignal.timeout(30000) });
  for (const host of ['barbacue.cog.ia.br', 'chelas.hirableaiagents.com', 'barbadog.hirableaiagents.com']) {
    for (const path of ['/', '/?loja=1', '/api/products', '/api/settings', '/api/store-status', '/privacy.html']) {
      const r = await get(path, '', 'GET', host);
      assert.equal(r.status, 200, `${host}${path}`);
      if (path === '/') assert.ok(!(await r.text()).includes('href="/admin/downloads"'));
      else await r.arrayBuffer();
    }
  }
  results.push('Three storefronts and catalog/settings/status endpoints healthy');
  for (const method of ['GET', 'HEAD']) assert.equal((await get('/api/admin/downloads/windows', '', method)).status, 401);
  assert.equal((await get('/admin/downloads')).status, 307);
  assert.equal((await get('/api/admin/downloads/windows', 'barbacue_customer_session=not-an-admin')).status, 401);
  results.push('Anonymous/customer-cookie direct download blocked');
  const payload = `0|admin|${Date.now() + 60000}`;
  const cookie = `barbacue_admin=${payload}.${createHmac('sha256', env.ADMIN_COOKIE_SECRET).update(payload).digest('base64url')}`;
  for (const path of ['/admin/downloads', '/admin', '/api/admin/orders', '/api/admin/staff', '/api/admin/system', '/api/admin/kitchen']) {
    const r = await get(path, cookie); assert.equal(r.status, 200, path);
    const body = await r.text();
    if (path === '/admin/downloads') assert.ok(body.includes('Baixar programa para Windows'));
  }
  results.push('Authenticated administration and operations healthy');
  const manifest = JSON.parse(readFileSync(`${candidate}/apps/web/private-downloads/windows.json`));
  const download = await get('/api/admin/downloads/windows', cookie);
  assert.equal(download.status, 200); assert.match(download.headers.get('cache-control'), /private, no-store/);
  const hash = createHash('sha256'); let size = 0;
  for await (const chunk of download.body) { hash.update(chunk); size += chunk.length; }
  assert.equal(size, manifest.size); assert.equal(hash.digest('hex'), manifest.sha256);
  for (const path of [`/private-downloads/${manifest.filename}`, `/${manifest.filename}`]) assert.equal((await get(path)).status, 404);
  const require = createRequire(`${candidate}/apps/web/server.js`);
  const { Pool } = require('pg'); const pool = new Pool({ connectionString: env.DATABASE_URL });
  try {
    const { rows } = await pool.query("SELECT id, role FROM staff_users WHERE active=true AND role <> 'admin' LIMIT 1");
    if (rows[0]) {
      const p = `${rows[0].id}|${rows[0].role}|${Date.now() + 60000}`;
      const staff = `barbacue_admin=${p}.${createHmac('sha256', env.ADMIN_COOKIE_SECRET).update(p).digest('base64url')}`;
      assert.equal((await get('/api/admin/downloads/windows', staff)).status, 403);
      results.push('Existing non-admin staff denied');
    }
  } finally { await pool.end(); }
  results.push(`Installer verified: ${size} bytes; SHA-256 matches`);
  writeFileSync(`${backup}/preflight.json`, JSON.stringify({ success: true, results }, null, 2));
  console.log(JSON.stringify({ success: true, results }));
} catch (error) {
  process.kill(child.pid, 'SIGTERM');
  console.error(error.message);
  process.exitCode = 1;
}
