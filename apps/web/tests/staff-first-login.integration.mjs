import assert from "node:assert/strict";
import { Pool } from "pg";
import { scryptSync, randomBytes, createHmac } from "node:crypto";

const base = process.env.LOGIN_TEST_URL ?? "http://127.0.0.1:43123";
const database = new URL(process.env.DATABASE_URL);
assert(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
assert(["localhost", "127.0.0.1"].includes(database.hostname) && database.pathname.includes("test"));
const pool = new Pool({ connectionString: database.href });
const initial = "Initial-test-2026";
const replacement = "Personal-test-2026";
const suffix = randomBytes(6).toString("hex");
const usernames = [`first-${suffix}@example.test`, `second-${suffix}@example.test`];
const salt = randomBytes(16);
const hash = `${salt.toString("hex")}:${scryptSync(initial, salt, 64).toString("hex")}`;
let count = 0;
async function request(path, { cookie = "", body, status = 200 } = {}) {
  const response = await fetch(base + path, { method: body ? "POST" : "GET", redirect: "manual", headers: { "content-type": "application/json", cookie, "x-forwarded-for": `127.0.1.${++count}` }, body: body ? JSON.stringify(body) : undefined });
  const text = await response.text();
  assert.equal(response.status, status, `${path}: ${text.slice(0, 200)}`);
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { response, data, cookie: response.headers.get("set-cookie")?.split(";")[0] };
}
try {
  for (const username of usernames) await pool.query("INSERT INTO staff_users(name,username,password_hash,role,must_change_password) VALUES('First access test',$1,$2,'admin',true)", [username, hash]);
  const loginPage = await request("/admin/login");
  assert(!loginPage.data.includes("deixe vazio"));
  assert(/<input[^>]*id="user"[^>]*required/.test(loginPage.data));
  for (const body of [{ password: "legacy-test-master-2026" }, { username: "", password: initial }, { username: "   ", password: initial }, { username: null, password: initial }, { username: {}, password: initial }, { username: usernames[0] }, { username: usernames[0], password: "" }]) {
    const denied = await request("/api/admin/auth", { body, status: 422 });
    assert(!denied.cookie);
  }
  const signingKey = process.env.LOGIN_TEST_COOKIE_SECRET;
  assert(signingKey, "Supply the isolated test server's signing key.");
  for (const scope of ["", "|full"]) {
    const payload = `0|admin|${Date.now() + 60000}${scope}`;
    const cookie = `barbacue_admin=${payload}.${createHmac("sha256", signingKey).update(payload).digest("base64url")}`;
    await request("/api/admin/staff", { cookie, status: 401 });
    await request("/admin", { cookie, status: 307 });
  }
  await request("/api/admin/change-password", { body: { currentPassword: initial, password: replacement, confirmation: replacement }, status: 401 });
  for (const username of usernames) {
    const login = await request("/api/admin/auth", { body: { username: username.toUpperCase(), password: initial } });
    assert.equal(login.data.mustChangePassword, true);
    const cookie = login.cookie;
    await request("/api/admin/staff", { cookie, status: 403 });
    await request("/api/admin/orders", { cookie, status: 403 });
    const redirect = await request("/admin/orders", { cookie, status: 307 });
    assert(new URL(redirect.response.headers.get("location"), base).pathname === "/admin/change-password");
    const form = await request("/admin/change-password", { cookie });
    assert(form.data.includes("Crie sua nova senha"));
    await request("/api/admin/change-password", { cookie, body: { currentPassword: "wrong", password: replacement, confirmation: replacement }, status: 400 });
    await request("/api/admin/change-password", { cookie, body: { currentPassword: initial, password: "short", confirmation: "short" }, status: 422 });
    await request("/api/admin/change-password", { cookie, body: { currentPassword: initial, password: replacement, confirmation: "different" }, status: 422 });
    await request("/api/admin/change-password", { cookie, body: { currentPassword: initial, password: initial, confirmation: initial }, status: 422 });
    const changed = await request("/api/admin/change-password", { cookie, body: { currentPassword: initial, password: replacement, confirmation: replacement } });
    await request("/api/admin/staff", { cookie: changed.cookie });
    const health = await request("/api/admin/system", { cookie: changed.cookie });
    assert(!("masterPassword" in health.data));
    await request("/api/admin/impersonate", { cookie: changed.cookie, body: { customerId: 1, masterPassword: "legacy-test-master-2026" }, status: 401 });
    await request("/api/admin/impersonate", { cookie: changed.cookie, body: { customerId: 0, currentPassword: replacement }, status: 400 });
    await request("/api/admin/staff", { cookie, status: 401 });
    await request("/api/admin/auth", { body: { username, password: initial }, status: 401 });
    const personal = await request("/api/admin/auth", { body: { username, password: replacement } });
    assert.equal(personal.data.mustChangePassword, false);
    await request("/api/admin/staff", { cookie: personal.cookie });
    await pool.query("UPDATE staff_users SET active=false WHERE username=$1", [username]);
    await request("/api/admin/staff", { cookie: personal.cookie, status: 401 });
  }
  console.log(`Passed ${count} first-login integration requests.`);
} finally {
  await pool.query("DELETE FROM staff_users WHERE username = ANY($1)", [usernames]);
  await pool.end();
}
