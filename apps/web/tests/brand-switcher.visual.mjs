// Visual integration test for the header brand switcher on each domain.
// Simulates each restaurant domain via the x-forwarded-host header (that is
// how the app resolves the brand behind the proxy) and screenshots the top.
//
//   BASE=http://localhost:3100 node tests/brand-switcher.visual.mjs
//
import pw from "../../../node_modules/playwright/index.js";
const { chromium } = pw;
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.BASE || "http://localhost:3000";
const REPO = path.resolve(import.meta.dirname, "../../..");
const SHOTS = path.join(REPO, "test-screenshots");
fs.mkdirSync(SHOTS, { recursive: true });
const STAMP = process.env.STAMP || new Date().toISOString().slice(0, 10);

const cases = [
  { brand: "Barbacue", host: "barbacue.cog.ia.br", others: ["Chelas", "Barbadog"] },
  { brand: "Chelas", host: "chelas.cog.ia.br", others: ["Barbacue", "Barbadog"] },
  { brand: "Barbadog", host: "barbadog.cog.ia.br", others: ["Barbacue", "Chelas"] },
];
const failures = [];
const browser = await chromium.launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {});
for (const viewport of [{ width: 1280, height: 800, tag: "desktop" }, { width: 390, height: 844, tag: "mobile" }]) {
  for (const c of cases) {
    const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, extraHTTPHeaders: { "x-forwarded-host": c.host } });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(BASE + "/", { waitUntil: "networkidle", timeout: 90000 });
    const nav = page.getByTestId("brand-switcher");
    const current = await nav.locator('[aria-current="page"]').innerText();
    if (!current.includes(c.brand)) failures.push(`${c.host}: featured "${current}"`);
    for (const o of c.others) if ((await nav.getByLabel(o).count()) !== 1) failures.push(`${c.host}: missing ${o}`);
    const order = await nav.locator("a[aria-current], a[aria-label]").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label") || e.textContent));
    const names = order.map((t) => ["Chelas", "Barbacue", "Barbadog"].find((n) => t.includes(n)));
    if (names.join() !== "Chelas,Barbacue,Barbadog") failures.push(`${c.host}: order ${names.join()}`);
    const big = await nav.locator('[aria-current="page"] img').boundingBox();
    const small = await nav.getByLabel(c.others[0]).locator("img").boundingBox();
    if (!(big && small && big.width > small.width * 1.6)) failures.push(`${c.host}: current logo not larger`);
    const imgsOk = await nav.locator("img").evaluateAll((els) => els.every((i) => i.complete && i.naturalWidth > 0));
    if (!imgsOk) failures.push(`${c.host}: broken logo`);
    const welcome = await page.getByText(/^Bem-vindo ao /).first().innerText().catch(() => "");
    if (welcome && !welcome.includes(c.brand)) failures.push(`${c.host}: welcome says "${welcome}"`);
    if (errors.length) failures.push(`${c.host}: ${errors.join("; ")}`);
    await page.screenshot({ path: path.join(SHOTS, `brand-switcher-${c.brand.toLowerCase()}-${viewport.tag}-${STAMP}.png`), clip: { x: 0, y: 0, width: viewport.width, height: Math.min(viewport.height, 520) } });
    await ctx.close();
  }
}
await browser.close();
if (failures.length) { console.error("FAIL\n" + failures.join("\n")); process.exit(1); }
console.log("PASS brand switcher on 3 domains × 2 viewports");
