/**
 * Fetch the iFood catalog directly from its public marketplace API instead of
 * driving the SPA (which is gated behind PerimeterX bot detection and never
 * fires the catalog request under a headless browser).
 *
 * The two endpoints that matter:
 *   - merchant-info  → merchant metadata + lat/long
 *   - catalog        → full menu (categories → items, with images & prices)
 *
 * iFood requires a handful of client headers (app_version / platform /
 * access_key / secret_key are the public web-client constants) or it returns 403.
 */
import * as fs from "fs";
import * as path from "path";

const MERCHANT_UUID = "403af0c6-176b-4021-a6cd-3e09dca09cbf";
// Jaraguá do Sul – Centro (approx). iFood requires a coordinate to resolve the
// catalog for a delivery region.
const LAT = -26.4851;
const LON = -49.0714;

const OUT_FILE = path.join(__dirname, "../data/ifood.json");
const RAW_FILE = path.join(__dirname, "../data/ifood_raw.json");

const IMG_BASE = "https://static-images.ifood.com.br/image/upload/t_high/pratos";

// Public iFood web-client constants (visible in their front-end bundle).
const HEADERS: Record<string, string> = {
  accept: "application/json, text/plain, */*",
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  app_version: "9.95.5",
  platform: "Desktop",
  "access_key": "69f181d5-0046-4221-b7b2-deef62bd60d5",
  "secret_key": "9ef4fb4f-7a1d-4e0d-a9b1-9b82873297d8",
  "x-ifood-session-id": "00000000-0000-0000-0000-000000000000",
  "cache-control": "no-cache",
  origin: "https://www.ifood.com.br",
  referer: "https://www.ifood.com.br/",
};

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

async function getJSON(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: HEADERS });
  const text = await res.text();
  if (!res.ok) {
    console.warn(`  [http ${res.status}] ${url.slice(0, 90)} :: ${text.slice(0, 120)}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    return { __status: res.status, __body: text.slice(0, 500) };
  }
}

function parseCatalog(body: unknown): IFoodItem[] {
  const items: IFoodItem[] = [];
  if (!body || typeof body !== "object") return items;
  const obj = body as Record<string, unknown>;

  // catalog shape: { data: { menu: [ { name, itens: [ {...} ] } ] } }
  const data = (obj["data"] ?? obj) as Record<string, unknown>;
  const menu = (data["menu"] ?? data["catalog"] ?? data["categories"]) as unknown[] | undefined;
  if (!Array.isArray(menu)) return items;

  const seen = new Set<string>();
  for (const cat of menu) {
    if (!cat || typeof cat !== "object") continue;
    const c = cat as Record<string, unknown>;
    const catName = String(c["name"] ?? c["title"] ?? "").trim();
    const list = (c["itens"] ?? c["items"] ?? c["products"] ?? []) as unknown[];
    if (!Array.isArray(list)) continue;

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
  const raw: Record<string, unknown> = {};

  const endpoints = [
    ["catalog_v1", `https://marketplace.ifood.com.br/v1/merchants/${MERCHANT_UUID}/catalog?latitude=${LAT}&longitude=${LON}`],
    ["merchant_info", `https://marketplace.ifood.com.br/v1/merchant-info/graphql?latitude=${LAT}&longitude=${LON}&channel=IFOOD&items=MENU,MERCHANT_LIST_ITEMS,MENU_ITEM`],
    ["merchant", `https://marketplace.ifood.com.br/v1/merchants/${MERCHANT_UUID}?latitude=${LAT}&longitude=${LON}`],
  ] as const;

  let items: IFoodItem[] = [];
  for (const [key, url] of endpoints) {
    console.log(`Fetching ${key} ...`);
    const body = await getJSON(url);
    raw[key] = body;
    const parsed = parseCatalog(body);
    if (parsed.length > 0) {
      items = parsed;
      console.log(`  -> ${parsed.length} items from ${key}`);
    }
  }

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(RAW_FILE, JSON.stringify(raw, null, 2));

  const categories = [...new Set(items.map((i) => i.category_name))].filter(Boolean);
  const promotions = items.filter((i) => i.is_promo);
  fs.writeFileSync(
    OUT_FILE,
    JSON.stringify(
      { merchant: "Barbacue - Centro", categories, items, promotions, scraped_at: new Date().toISOString() },
      null,
      2
    )
  );
  console.log(`\nSaved ${items.length} items, ${categories.length} categories, ${promotions.length} promos`);
  if (items.length === 0) console.warn("No items — inspect data/ifood_raw.json for shapes/status.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
