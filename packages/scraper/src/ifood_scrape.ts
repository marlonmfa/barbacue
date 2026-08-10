import { chromium } from "playwright-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import * as fs from "fs";
import * as path from "path";

/**
 * Scrape the iFood catalog for "Barbacue - Centro".
 *
 * The legacy catalog endpoint `wsloja.ifood.com.br/ifood-ws-v3/v1/merchants/
 * {uuid}/catalog` returns the full menu but is fronted by Cloudflare, which 403s
 * a bare Node fetch. We pass Cloudflare using the stealth plugin: warm up on the
 * wsloja origin (so Cloudflare issues a cf_clearance cookie to the browser),
 * then fetch the catalog from the page context — first-party, cookie-bearing.
 */
chromium.use(StealthPlugin());

const MERCHANT_UUID = "403af0c6-176b-4021-a6cd-3e09dca09cbf";
const LAT = -26.4851;
const LON = -49.0714;
const CATALOG_URL = `https://wsloja.ifood.com.br/ifood-ws-v3/v1/merchants/${MERCHANT_UUID}/catalog?latitude=${LAT}&longitude=${LON}&channel=IFOOD`;
const OUT_FILE = path.join(__dirname, "../data/ifood.json");
const RAW_FILE = path.join(__dirname, "../data/ifood_raw.json");

const IMG_BASE = "https://static-images.ifood.com.br/image/upload/t_high/pratos";

interface IFoodItem {
  id: string;
  name: string;
  description: string;
  price_cents: number;
  original_price_cents: number | null;
  category_name: string;
  image_url: string | null;
  is_promo: boolean;
}

function resolveImage(logoUrl: unknown): string | null {
  if (!logoUrl || typeof logoUrl !== "string" || logoUrl.length === 0) return null;
  if (logoUrl.startsWith("http")) return logoUrl;
  const clean = logoUrl.startsWith("/") ? logoUrl.slice(1) : logoUrl;
  return `${IMG_BASE}/${clean}`;
}

function toCents(value: unknown): number {
  const n = Number(value);
  if (isNaN(n) || n <= 0) return 0;
  return n > 1000 ? Math.round(n) : Math.round(n * 100);
}

function collectCategories(node: unknown, acc: Array<Record<string, unknown>>, depth = 0): void {
  if (depth > 10 || !node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const el of node) collectCategories(el, acc, depth + 1);
    return;
  }
  const obj = node as Record<string, unknown>;
  const items = obj["itens"] ?? obj["items"];
  const name = obj["name"] ?? obj["title"];
  if (Array.isArray(items) && typeof name === "string" && items.length > 0) {
    const first = items[0] as Record<string, unknown> | undefined;
    if (first && (("unitPrice" in first) || ("price" in first) || ("description" in first))) {
      acc.push(obj);
    }
  }
  for (const v of Object.values(obj)) collectCategories(v, acc, depth + 1);
}

function parseFromApi(body: unknown): IFoodItem[] {
  const cats: Array<Record<string, unknown>> = [];
  collectCategories(body, cats);
  const items: IFoodItem[] = [];
  const seen = new Set<string>();
  for (const c of cats) {
    const catName = String(c["name"] ?? c["title"] ?? "").trim();
    const list = (c["itens"] ?? c["items"] ?? []) as unknown[];
    for (const it of list) {
      if (!it || typeof it !== "object") continue;
      const p = it as Record<string, unknown>;
      const name = String(p["description"] ?? p["name"] ?? p["title"] ?? "").trim();
      if (!name) continue;
      const id = String(p["code"] ?? p["id"] ?? p["_id"] ?? `${catName}:${name}`);
      if (seen.has(id)) continue;
      seen.add(id);
      const price = toCents(p["unitPrice"] ?? p["price"] ?? p["unitMinPrice"]);
      const original = toCents(p["unitOriginalPrice"] ?? p["originalPrice"]);
      const isPromo = original > 0 && original > price;
      const longDesc = String(p["details"] ?? p["longDescription"] ?? "").trim();
      items.push({
        id,
        name,
        description: longDesc,
        price_cents: price,
        original_price_cents: isPromo ? original : null,
        category_name: catName,
        image_url: resolveImage(p["logoUrl"] ?? p["imagePath"] ?? p["image"]),
        is_promo: isPromo,
      });
    }
  }
  return items;
}

async function main() {
  console.log("Launching stealth browser...");
  const browser = await chromium.launch({
    headless: true,
    args: ["--disable-blink-features=AutomationControlled", "--no-sandbox"],
  });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    locale: "pt-BR",
    viewport: { width: 1366, height: 900 },
  });
  const page = await context.newPage();

  // 1) Warm up on the wsloja origin so Cloudflare hands us cf_clearance.
  console.log("Warming up Cloudflare on wsloja.ifood.com.br ...");
  try {
    await page.goto("https://wsloja.ifood.com.br/", { waitUntil: "domcontentloaded", timeout: 45_000 });
  } catch {
    console.warn("warmup nav timeout, continuing");
  }
  // Give Cloudflare's JS challenge time to run and set the clearance cookie.
  await page.waitForTimeout(8_000);

  // 2) Fetch the catalog from the page context (same-origin, cookie-bearing).
  console.log("Fetching catalog...");
  const result = await page.evaluate(
    async ({ url }) => {
      try {
        const res = await fetch(url, {
          headers: {
            accept: "application/json, text/plain, */*",
            app_version: "9.95.5",
            platform: "Desktop",
            access_key: "69f181d5-0046-4221-b7b2-deef62bd60d5",
            secret_key: "9ef4fb4f-7a1d-4e0d-a9b1-9b82873297d8",
          },
          credentials: "include",
        });
        const text = await res.text();
        return { status: res.status, text };
      } catch (e: any) {
        return { status: -1, text: String(e?.message ?? e) };
      }
    },
    { url: CATALOG_URL }
  );

  await browser.close();

  console.log(`Catalog fetch status: ${result.status}, body length: ${result.text.length}`);
  let body: unknown = null;
  try {
    body = JSON.parse(result.text);
  } catch {
    console.warn("Response was not JSON. First 300 chars:\n" + result.text.slice(0, 300));
  }

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(RAW_FILE, JSON.stringify({ status: result.status, body: body ?? result.text.slice(0, 2000) }, null, 2));

  const items = body ? parseFromApi(body) : [];
  const categories = [...new Set(items.map((i) => i.category_name))].filter(Boolean);
  const promotions = items.filter((i) => i.is_promo);
  fs.writeFileSync(
    OUT_FILE,
    JSON.stringify(
      { merchant: "Barbacue - Centro", source: "wsloja", categories, items, promotions, scraped_at: new Date().toISOString() },
      null,
      2
    )
  );
  console.log(`\nSaved ${items.length} items, ${categories.length} categories, ${promotions.length} promos -> ${OUT_FILE}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
