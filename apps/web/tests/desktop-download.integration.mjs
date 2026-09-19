import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const base = process.env.DESKTOP_TEST_URL || 'http://127.0.0.1:3099';
const database = process.env.DATABASE_URL || 'postgresql://127.0.0.1/barbacue_desktop_test_20260910';
for (const url of [new URL(base), new URL(database)]) assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname));
assert.match(new URL(database).pathname, /desktop_test/);
const secret = process.env.DESKTOP_TEST_COOKIE_SECRET || 'desktop-test-cookie-secret-20260910';
const manifest = JSON.parse(await readFile(new URL('../private-downloads/windows.json', import.meta.url), 'utf8'));
const pool = new pg.Pool({ connectionString: database });
const suffix = `${Date.now()}`;
let staffId;
const memberEmail = `download-${suffix}@example.test`;
const request = (path, cookie = '', method = 'GET') => fetch(`${base}${path}`, { method, redirect: 'manual', headers: { Cookie: cookie } });
const token = (id, role, expiry = Date.now() + 60000) => {
  const payload = `${id}|${role}|${expiry}`;
  return `barbacue_admin=${payload}.${createHmac('sha256', secret).update(payload).digest('base64url')}`;
};
const path = '/api/admin/downloads/windows';
try {
  for (const method of ['GET', 'HEAD']) assert.equal((await request(path, '', method)).status, 401);
  const redirect = await request('/admin/downloads');
  assert.equal(redirect.status, 307); assert.match(redirect.headers.get('location'), /admin\/login/);
  assert.equal((await request(path, 'barbacue_admin=forged')).status, 401);
  assert.equal((await request(path, token(0, 'admin', Date.now() - 1000))).status, 401);
  const register = await fetch(`${base}/api/account`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'register', name: 'Cliente teste download', email: memberEmail, password: 'test-download-2026' }) });
  assert.equal(register.status, 200);
  const member = register.headers.get('set-cookie').split(';')[0];
  assert.equal((await request(path, member)).status, 401);
  assert.equal((await request('/admin/downloads', member)).status, 307);
  staffId = (await pool.query("INSERT INTO staff_users(name,username,password_hash,role,active) VALUES('Download Teste',$1,'not-a-real-password','cashier',true) RETURNING id", [`download-${suffix}`])).rows[0].id;
  const cashier = token(staffId, 'cashier');
  assert.equal((await request(path, cashier)).status, 403);
  const cashierPage = await request('/admin/orders', cashier);
  assert.equal(cashierPage.status, 200);
  assert.ok(!(await cashierPage.text()).includes('href="/admin/downloads"'));
  const login = await fetch(`${base}/api/admin/auth`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: process.env.DESKTOP_TEST_PASSWORD || 'Desktop-test-20260910' }) });
  assert.equal(login.status, 200);
  const admin = login.headers.get('set-cookie').split(';')[0];
  const page = await request('/admin/downloads', admin); assert.equal(page.status, 200);
  const html = await page.text(); assert.ok(html.includes('Baixar programa para Windows')); assert.ok(html.includes('href="/admin/downloads"')); assert.ok(html.includes(`href="${path}"`));
  const head = await request(path, admin, 'HEAD');
  assert.equal(head.status, 200); assert.equal(head.headers.get('content-length'), String(manifest.size)); assert.equal((await head.arrayBuffer()).byteLength, 0);
  const download = await request(path, admin);
  assert.equal(download.status, 200); assert.match(download.headers.get('cache-control'), /private, no-store/);
  assert.ok(download.headers.get('content-disposition').includes(manifest.filename));
  const hash = createHash('sha256'); let bytes = 0;
  for await (const chunk of download.body) { bytes += chunk.length; hash.update(chunk); }
  assert.equal(bytes, manifest.size); assert.equal(hash.digest('hex'), manifest.sha256);
  for (const publicPath of [`/${manifest.filename}`, `/private-downloads/${manifest.filename}`, `/downloads/${manifest.filename}`]) assert.equal((await request(publicPath)).status, 404);
  console.log('PASS: anonymous, customer, cashier, forged/expired sessions blocked; admin-only navigation; authorized GET/HEAD; complete installer SHA-256; no public file route.');
} finally {
  if (staffId) await pool.query('DELETE FROM staff_users WHERE id=$1', [staffId]);
  await pool.query('DELETE FROM customer_accounts WHERE email=$1', [memberEmail]);
  await pool.end();
}
