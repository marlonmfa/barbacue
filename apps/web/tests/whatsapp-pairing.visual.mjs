// Visual + behavioral E2E for the WhatsApp pairing panel.
//
// Covers the two things that were invisible during the failed production
// pairing: (1) the QR actually renders inside the modal, and (2) a pairing
// failure is now reported *inside* the modal instead of behind its backdrop.
// Runs against a stubbed bot (tests/fake-bot-server.mjs), never real WhatsApp.
//
//   ADMIN_PASSWORD=... BASE=http://localhost:3000 node tests/whatsapp-pairing.visual.mjs
//
// Exits non-zero on any failed assertion.
import pw from "../../../node_modules/playwright/index.js";
const { chromium } = pw;
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.BASE || "http://localhost:3000";
const PASSWORD = process.env.ADMIN_PASSWORD || "";
const REPO = path.resolve(import.meta.dirname, "../../..");
const SHOTS = path.join(REPO, "test-screenshots");
const STAMP = process.env.STAMP || "2026-08-23";
fs.mkdirSync(SHOTS, { recursive: true });

const failures = [];
const check = (cond, msg) => { if (!cond) { failures.push(msg); console.error("✗", msg); } else console.log("✓", msg); };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const consoleErrors = [];
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 200)); });
page.on("pageerror", (e) => consoleErrors.push("PAGEERROR: " + e.message));

try {
  // ── 1. Log in; /whatsapp is behind the same staff guard as /admin ───────────
  // networkidle matters: the form is a client component, and clicking before
  // hydration triggers a native submit that silently no-ops.
  await page.goto(BASE + "/admin/login", { waitUntil: "networkidle", timeout: 60000 });
  await page.fill("#pw", PASSWORD);
  const auth = page.waitForResponse((r) => r.url().includes("/api/admin/auth") && r.request().method() === "POST", { timeout: 20000 });
  await page.click('button[type="submit"]');
  check((await auth).status() === 200, "auth endpoint accepted the master password");
  await page.waitForTimeout(800); // let the client router settle after the push

  await page.goto(BASE + "/whatsapp", { waitUntil: "networkidle", timeout: 60000 });
  check(!page.url().includes("/admin/login"), "/whatsapp is reachable for a logged-in staff user");
  await page.waitForSelector('button:has-text("Parear número")', { timeout: 20000 });
  await page.waitForTimeout(1200); // let the 5s account poll land once

  // ── 2. The header reflects the stub: exactly one of three accounts online ───
  const summary = (await page.locator("header").innerText()).replace(/\s+/g, " ");
  check(/1 \/ 3 online/.test(summary), `header shows "1 / 3 online" (got: ${summary.slice(0, 120)})`);

  // ── 3. The QR renders inside the pairing modal ──────────────────────────────
  await page.click('button:has-text("Parear número")');
  await page.waitForSelector('[role="dialog"]', { timeout: 10000 });
  const qr = page.locator('[role="dialog"] img[alt="QR code de pareamento"]');
  await qr.waitFor({ timeout: 10000 });
  const box = await qr.boundingBox();
  check(Boolean(box) && box.width > 150 && box.height > 150, `QR image rendered at a scannable size (${box?.width}x${box?.height})`);
  check(await page.locator('[role="dialog"] >> text=Aparelhos conectados').count() > 0, "scan instructions present");
  await page.screenshot({ path: path.join(SHOTS, `whatsapp-pairing-qr-${STAMP}.png`) });

  // ── 4. A pairing failure is surfaced INSIDE the modal ───────────────────────
  // Previously the only error slot was the page-level bar, which the modal
  // backdrop covers — so a failed pair looked like nothing had happened.
  await page.click('[role="dialog"] button[class*="modalClose"]');
  await page.waitForTimeout(300);
  // The header brand tabs also say "Chelas"; target the welcome-list entry,
  // which is the one that opens the pairing modal for an offline account.
  await page.click('button:has-text("Chelas"):has-text("Parear número")');
  await page.waitForSelector('[role="dialog"]', { timeout: 10000 });
  const alert = page.locator('[role="dialog"] [role="alert"]');
  await alert.waitFor({ timeout: 10000 });
  const alertText = await alert.innerText();
  check(/Tempo de pareamento esgotado/.test(alertText), `modal reports why pairing failed (got: ${alertText})`);
  const alertBox = await alert.boundingBox();
  check(Boolean(alertBox) && alertBox.width > 100, "error banner is visible, not behind the backdrop");
  await page.screenshot({ path: path.join(SHOTS, `whatsapp-pairing-error-${STAMP}.png`) });

  check(consoleErrors.length === 0, `no console errors (${consoleErrors.slice(0, 3).join(" | ")})`);
} catch (error) {
  failures.push(`threw: ${error.message}`);
  console.error(error);
  await page.screenshot({ path: path.join(SHOTS, `whatsapp-pairing-FAILURE-${STAMP}.png`) }).catch(() => {});
} finally {
  await browser.close();
}

console.log(failures.length ? `\n${failures.length} failure(s)` : "\nall checks passed");
process.exit(failures.length ? 1 : 0);
