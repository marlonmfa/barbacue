// Visual + behavioral E2E for the admin product editor's new "easy edit" features:
//   1. image UPLOAD (drag/drop dropzone → /api/admin/upload → served from DB), and
//   2. INLINE price editing right in the product list.
// Boots headless Chromium against a running dev server, logs in with the master
// password, and drives the real UI. Writes screenshots to test-screenshots/.
//
//   ADMIN_PASSWORD=... BASE=http://localhost:3000 node tests/admin-products.visual.mjs
//
// Exits non-zero on any failed assertion. Inserts one media_assets row (harmless).
import pw from "../../../node_modules/playwright/index.js";
const { chromium } = pw;
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.BASE || "http://localhost:3000";
const PASSWORD = process.env.ADMIN_PASSWORD || "";
const REPO = path.resolve(import.meta.dirname, "../../..");
const SHOTS = path.join(REPO, "test-screenshots");
const STAMP = process.env.STAMP || "2026-07-09";
fs.mkdirSync(SHOTS, { recursive: true });

// A real image to upload (exercises the client-side canvas downscale → WebP path).
const SAMPLE = path.resolve(import.meta.dirname, "../public/generated/products/100.jpg");

const failures = [];
const check = (cond, msg) => { if (!cond) { failures.push(msg); console.error("✗", msg); } else console.log("✓", msg); };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const consoleErrors = [];
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 200)); });
page.on("pageerror", (e) => consoleErrors.push("PAGEERROR: " + e.message));

try {
  // ── 1. Log in with the master password ──────────────────────────────────────
  await page.goto(BASE + "/admin/login", { waitUntil: "networkidle", timeout: 60000 });
  await page.fill("#pw", PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/admin", { timeout: 15000 }).catch(() => {});
  check(!/\/admin\/login$/.test(page.url()), "login succeeded (left /admin/login)");

  // ── 2. Products list renders with the edit hint ──────────────────────────────
  await page.goto(BASE + "/admin/products", { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForSelector("table tbody tr", { timeout: 15000 });
  const rowCount = await page.locator("table tbody tr").count();
  check(rowCount > 0, `product rows rendered (${rowCount})`);
  check((await page.getByText(/clique na/i).count()) > 0, "inline-edit hint shown");
  await page.screenshot({ path: path.join(SHOTS, `admin-products-list-${STAMP}.png`), fullPage: false });

  // ── 3. Open the create modal → ImageUploader dropzone is present ──────────────
  await page.getByRole("button", { name: /novo produto/i }).click();
  await page.waitForSelector("text=Foto do produto", { timeout: 8000 });
  check((await page.getByText(/arraste uma foto/i).count()) > 0, "uploader dropzone present in modal");
  await page.screenshot({ path: path.join(SHOTS, `admin-image-uploader-${STAMP}.png`), fullPage: false });

  // ── 4. Upload a real image → assert it hits the API and previews from the DB ──
  const uploadResP = page.waitForResponse(
    (r) => r.url().includes("/api/admin/upload") && r.request().method() === "POST",
    { timeout: 30000 },
  );
  await page.setInputFiles('input[type="file"]', SAMPLE);
  const uploadRes = await uploadResP;
  check(uploadRes.status() === 201, `upload API returned 201 (got ${uploadRes.status()})`);
  const uploadJson = await uploadRes.json().catch(() => ({}));
  check(typeof uploadJson.url === "string" && uploadJson.url.startsWith("/api/media/"),
    `upload returned a /api/media URL (${uploadJson.url})`);

  // Preview <img> should now point at the served asset.
  await page.waitForFunction(
    () => {
      const img = document.querySelector('img[alt="Prévia"]');
      return img && img.getAttribute("src")?.startsWith("/api/media/");
    },
    { timeout: 10000 },
  ).catch(() => {});
  const previewSrc = await page.locator('img[alt="Prévia"]').getAttribute("src");
  check(!!previewSrc && previewSrc.startsWith("/api/media/"), `preview shows uploaded image (${previewSrc})`);
  await page.screenshot({ path: path.join(SHOTS, `admin-image-uploaded-${STAMP}.png`), fullPage: false });

  // ── 5. The served asset is fetchable as an image (DB round-trip works) ────────
  if (uploadJson.url) {
    const media = await ctx.request.get(BASE + uploadJson.url);
    check(media.status() === 200, `GET ${uploadJson.url} → 200 (got ${media.status()})`);
    const ctype = media.headers()["content-type"] || "";
    check(ctype.startsWith("image/"), `served asset is an image (${ctype})`);
    const cache = media.headers()["cache-control"] || "";
    check(cache.includes("immutable"), "served asset is cached immutable");
  }

  // Close modal.
  await page.getByRole("button", { name: /^cancelar$/i }).click();

  // Snapshot every price up front so we can restore whatever row we mutate — the
  // test must not leave the catalog corrupted (products with equal sortOrder tie-
  // break arbitrarily, so "the first row" is not a fixed product).
  const before = await ctx.request.get(BASE + "/api/admin/products").then((r) => r.json());
  const priceById = Object.fromEntries((before.products || []).map((p) => [p.id, p.priceCents]));

  // ── 6. Inline price edit: click a price, type a new value, Enter → PATCH ──────
  const firstPriceBtn = page.locator('button[title="Editar preço"]').first();
  await firstPriceBtn.click();
  const priceInput = page.locator('input[inputmode="decimal"]');
  await priceInput.waitFor({ timeout: 5000 });
  const patchP = page.waitForResponse(
    (r) => /\/api\/admin\/products\/\d+$/.test(r.url()) && r.request().method() === "PATCH",
    { timeout: 15000 },
  );
  await priceInput.fill("");
  await priceInput.type("77,77");
  await priceInput.press("Enter");
  const patchRes = await patchP;
  check(patchRes.ok(), `inline price PATCH ok (${patchRes.status()})`);
  const mutatedId = Number(patchRes.url().match(/\/products\/(\d+)$/)?.[1]); // for restore
  await page.waitForFunction(
    () => !!Array.from(document.querySelectorAll("td")).find((td) => td.textContent?.includes("R$77,77")),
    { timeout: 8000 },
  ).catch(() => {});
  check((await page.getByText(/R\$77,77/).count()) > 0, "inline price updated in the list");
  await page.screenshot({ path: path.join(SHOTS, `admin-inline-price-${STAMP}.png`), fullPage: false });

  // ── 6b. REGRESSION: reopen the (seeded "77,77") editor and press Enter with NO
  //        change. The old dot-stripping parser turned the seeded value into a
  //        100x-inflated price; assert it stays put and fires no PATCH.
  await firstPriceBtn.click();
  await priceInput.waitFor({ timeout: 5000 });
  let stalePatch = false;
  const onStale = (r) => {
    if (/\/api\/admin\/products\/\d+$/.test(r.url()) && r.request().method() === "PATCH") stalePatch = true;
  };
  page.on("response", onStale);
  await priceInput.press("Enter"); // no edit — must be a no-op
  await page.waitForTimeout(1200);
  page.off("response", onStale);
  check(!stalePatch, "no-op Enter fires no PATCH (no 100x inflation)");
  check((await page.getByText(/R\$77,77/).count()) > 0 && (await page.getByText(/R\$7\.777,00/).count()) === 0,
    "price unchanged after no-op Enter (not inflated)");

  check(consoleErrors.length === 0, `no console/page errors (saw ${consoleErrors.length}: ${consoleErrors.slice(0,3).join(" | ")})`);

  // ── Cleanup: restore the mutated product's original price so the catalog is
  //    left exactly as we found it. ─────────────────────────────────────────────
  if (Number.isFinite(mutatedId) && priceById[mutatedId] != null) {
    const restore = await ctx.request.patch(BASE + `/api/admin/products/${mutatedId}`, {
      data: { priceCents: priceById[mutatedId] },
    });
    check(restore.ok(), `restored product ${mutatedId} to ${priceById[mutatedId]} cents (${restore.status()})`);
  }
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(`\n${failures.length} FAILURE(S):\n- ` + failures.join("\n- "));
  process.exit(1);
}
console.log("\nAll admin-products visual checks passed.");
