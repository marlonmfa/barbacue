// Visual integration test for the /beta app-tester signup page.
// Boots headless Chromium against a running dev server, fills the form
// end-to-end (name, whatsapp, email, platform radio), submits, asserts the
// success state, and writes screenshots to test-screenshots/.
//
//   BASE=http://localhost:3000 node tests/beta.visual.mjs
//
// Exits non-zero if any assertion fails. NOTE: inserts/updates one row in
// beta_signups (whatsapp 5511999990002) — idempotent thanks to the upsert.
import pw from "../../../node_modules/playwright/index.js";
const { chromium } = pw;
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.BASE || "http://localhost:3000";
const REPO = path.resolve(import.meta.dirname, "../../..");
const SHOTS = path.join(REPO, "test-screenshots");
fs.mkdirSync(SHOTS, { recursive: true });
const STAMP = process.env.STAMP || "2026-07-02";

const failures = [];
const check = (cond, msg) => { if (!cond) failures.push(msg); };

const browser = await chromium.launch();
// iPhone-ish viewport: this page's audience is on a phone by definition.
const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const consoleErrors = [];
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 200)); });
page.on("pageerror", (e) => consoleErrors.push("PAGEERROR: " + e.message));

await page.goto(BASE + "/beta", { waitUntil: "networkidle", timeout: 60000 });

// 1. Page renders the beta pitch + all four fields.
check((await page.locator("h1", { hasText: /teste o app/i }).count()) > 0, "headline not found");
check((await page.locator("#beta-name").count()) === 1, "name input missing");
check((await page.locator("#beta-whatsapp").count()) === 1, "whatsapp input missing");
check((await page.locator("#beta-email").count()) === 1, "email input missing");
check((await page.locator('input[type="radio"][name="platform"]').count()) === 2, "expected exactly 2 platform radios");

// 2. Invalid whatsapp is rejected server-side with a pt-BR message.
await page.fill("#beta-name", "Tester Beta E2E");
await page.fill("#beta-whatsapp", "123");
await page.fill("#beta-email", "tester.beta@example.com");
await page.locator("label", { hasText: "Android" }).click();
await page.click('button[type="submit"]');
// Wait on the message itself (not just the alert container) — the container
// can be observed before React commits its text.
const gotError = await page
  .waitForSelector("text=/WhatsApp inválido/i", { timeout: 10000 })
  .then(() => true)
  .catch(() => false);
check(gotError, "expected pt-BR 'WhatsApp inválido' validation error after bad submit");

// 3. Valid submission — capture the filled form first (the committed artifact).
await page.fill("#beta-whatsapp", "(11) 99999-0002");
const shotForm = path.join(SHOTS, `beta-signup-form-${STAMP}.png`);
await page.screenshot({ path: shotForm, fullPage: false });

await page.click('button[type="submit"]');
await page.waitForSelector("text=Você está na lista!", { timeout: 15000 });
await page.waitForTimeout(700); // let the fade-in-up entrance animation finish
const shotDone = path.join(SHOTS, `beta-signup-success-${STAMP}.png`);
await page.screenshot({ path: shotDone, fullPage: false });

// 4. The row actually landed (public POST → DB → admin API is auth-gated,
//    so verify via a second idempotent POST returning 201).
const res = await page.evaluate(async () => {
  const r = await fetch("/api/beta", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Tester Beta E2E",
      whatsapp: "11999990002",
      email: "tester.beta@example.com",
      platform: "ios",
    }),
  });
  return { status: r.status, body: await r.json() };
});
check(res.status === 201 && res.body.ok === true, `upsert re-submit failed: ${JSON.stringify(res)}`);

// 5. Admin API stays locked without a session.
const admin = await page.evaluate(async () => (await fetch("/api/admin/beta")).status);
check(admin === 401, `expected 401 from /api/admin/beta without session, got ${admin}`);

// 6. No console / hydration errors. The test deliberately triggers one 400
// (invalid whatsapp) and one 401 (admin gate) — the browser's resulting
// "Failed to load resource" lines are expected, everything else is not.
const unexpected = consoleErrors.filter(
  (e) => !/Failed to load resource.*(400|401)/.test(e)
);
check(unexpected.length === 0, `console errors: ${JSON.stringify(unexpected)}`);

await browser.close();

console.log(JSON.stringify({ screenshots: [shotForm, shotDone], failures }, null, 2));
if (failures.length) { console.error("VISUAL TEST FAILED:\n - " + failures.join("\n - ")); process.exit(1); }
console.log("VISUAL TEST PASSED");
