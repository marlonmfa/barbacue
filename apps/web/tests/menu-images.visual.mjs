// Visual integration test for the backfilled menu images.
// Boots against a running dev server, asserts product cards now render real
// <img> photos (not the branded SVG fallback), and screenshots the menu.
//
//   BASE=http://localhost:3000 node tests/menu-images.visual.mjs
//
import pw from "../../../node_modules/playwright/index.js";
const { chromium } = pw;
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.BASE || "http://localhost:3000";
const REPO = path.resolve(import.meta.dirname, "../../..");
const SHOTS = path.join(REPO, "test-screenshots");
fs.mkdirSync(SHOTS, { recursive: true });
const STAMP = process.env.STAMP || "2026-07-04";

const failures = [];
const check = (cond, msg) => { if (!cond) failures.push(msg); };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1600 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();

await page.goto(BASE, { waitUntil: "networkidle", timeout: 60000 });
// Product images are lazy-loaded far below the fold (the menu is ~27k px tall).
// Force-eager every <img> so a full-page screenshot captures them all, then
// scroll through and wait until every image has decoded.
await page.evaluate(() => {
  for (const img of document.images) img.loading = "eager";
});
await page.evaluate(async () => {
  for (let y = 0; y < document.body.scrollHeight; y += 600) {
    window.scrollTo(0, y);
    await new Promise((r) => setTimeout(r, 90));
  }
  window.scrollTo(0, 0);
});
// Wait until all images report complete (or time out after 30s).
await page.waitForFunction(
  () => Array.from(document.images).every((i) => i.complete),
  { timeout: 30000 }
).catch(() => {});
await page.waitForTimeout(1500);

// Count <img> that point at our backfilled photos.
const backfilled = await page.evaluate(() =>
  Array.from(document.images).filter((i) => /\/generated\/products\//.test(i.currentSrc || i.src)).length
);
// And assert those images actually decoded (naturalWidth > 0), i.e. not broken.
const broken = await page.evaluate(() =>
  Array.from(document.images)
    .filter((i) => /\/generated\/(products|fallback)/.test(i.currentSrc || i.src))
    .filter((i) => i.complete && i.naturalWidth === 0).length
);

check(backfilled > 0, `expected backfilled product photos on the page, found ${backfilled}`);
check(broken === 0, `${broken} generated images failed to decode (broken)`);

const shot = path.join(SHOTS, `menu-images-${STAMP}.png`);
await page.screenshot({ path: shot, fullPage: true });
console.log(`backfilled photos on page: ${backfilled}, broken: ${broken}`);
console.log(`screenshot → ${shot}`);

await browser.close();
if (failures.length) {
  console.error("FAIL:\n  " + failures.join("\n  "));
  process.exit(1);
}
console.log("PASS");
