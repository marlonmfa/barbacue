// Visual integration test for the v3 storefront redesign.
// Boots a headless Chromium against a running dev server (default :3000),
// asserts the redesign's guarantees, and writes a screenshot to test-screenshots/.
//
//   BASE=http://localhost:3000 node tests/redesign.visual.mjs
//
// Exits non-zero if any assertion fails.
import pw from "../../../node_modules/playwright/index.js";
const { chromium } = pw;
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.BASE || "http://localhost:3000";
const REPO = path.resolve(import.meta.dirname, "../../..");
const SHOTS = path.join(REPO, "test-screenshots");
fs.mkdirSync(SHOTS, { recursive: true });
const STAMP = process.env.STAMP || "2026-06-24"; // pass STAMP to date the file

const failures = [];
const check = (cond, msg) => { if (!cond) failures.push(msg); };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const consoleErrors = [];
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 200)); });
page.on("pageerror", (e) => consoleErrors.push("PAGEERROR: " + e.message));

await page.goto(BASE + "/", { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(1500);

// 1. The flame-grill hero wordmark is present.
const wordmark = await page.locator("header h1", { hasText: /barbacue/i }).count();
check(wordmark > 0, "hero wordmark BARBACUE not found");

// 2. Sticky category nav rendered.
check((await page.locator("nav button").count()) > 0, "category nav buttons not found");

// 3. No product renders the bare SVG placeholder (no "missing images").
const svgPlaceholders = await page.evaluate(() => document.querySelectorAll('.ember-bg[role="img"]').length);
check(svgPlaceholders === 0, `found ${svgPlaceholders} bare SVG placeholders (expected 0)`);

// 4. No broken <img> tags.
const broken = await page.evaluate(() =>
  Array.from(document.querySelectorAll("img")).filter((i) => i.complete && i.naturalWidth === 0).length
);
check(broken === 0, `found ${broken} broken images (expected 0)`);

// 5. No console / hydration errors.
check(consoleErrors.length === 0, `console errors: ${JSON.stringify(consoleErrors)}`);

// Screenshot artifact (committed per repo workflow).
const shot = path.join(SHOTS, `redesign-storefront-${STAMP}.png`);
await page.screenshot({ path: shot, fullPage: false });

await browser.close();

console.log(JSON.stringify({ svgPlaceholders, broken, consoleErrors, screenshot: shot, failures }, null, 2));
if (failures.length) { console.error("VISUAL TEST FAILED:\n - " + failures.join("\n - ")); process.exit(1); }
console.log("VISUAL TEST PASSED");
