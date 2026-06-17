import { chromium } from "playwright";
import * as fs from "fs";
import * as path from "path";

const TARGET_URL = "https://pedido.anota.ai/loja/lanches-do-barba";
const OUT_FILE = path.join(__dirname, "../data/products.json");

interface RawCapture {
  url: string;
  status: number;
  body: unknown;
}

interface ScrapedProduct {
  id: string;
  name: string;
  description: string;
  price_cents: number;
  category_id: string;
  category_name: string;
  image_url: string | null;
  available: boolean;
  sort_order: number;
}

interface ScrapedCategory {
  id: string;
  name: string;
  sort_order: number;
}

interface ScrapedData {
  categories: ScrapedCategory[];
  products: ScrapedProduct[];
  raw_captures: RawCapture[];
  scraped_at: string;
}

function toCents(value: unknown): number {
  const n = Number(value);
  if (isNaN(n)) return 0;
  // Values may come as 14.90 (BRL) or 1490 (centavos) — normalize
  return n > 500 ? Math.round(n) : Math.round(n * 100);
}

// Recursively try to extract products from any response shape anota.ai might use
function extractFromResponse(
  body: unknown,
  captures: RawCapture[],
  url: string
): void {
  if (!body || typeof body !== "object") return;

  // Some platforms nest under data.data, data.items, data.products, etc.
  const obj = body as Record<string, unknown>;
  const candidateKeys = ["data", "items", "products", "catalog", "categories", "menu", "cardapio"];
  for (const key of candidateKeys) {
    if (obj[key]) {
      captures.push({ url, status: 200, body: obj[key] });
    }
  }
}

function parseAnotaAiMenu(body: Record<string, unknown>): {
  categories: ScrapedCategory[];
  products: ScrapedProduct[];
} {
  const categories: ScrapedCategory[] = [];
  const products: ScrapedProduct[] = [];

  // Shape: { success: true, data: { establishment: {...}, menu: { menu: [...], menu_aux: [...] } } }
  const data = body["data"] as Record<string, unknown> | undefined;
  if (!data) return { categories, products };

  const menuObj = data["menu"] as Record<string, unknown> | undefined;
  if (!menuObj) return { categories, products };

  // Primary menu categories
  const menuArr = (menuObj["menu"] ?? []) as unknown[];
  // menu_aux contains additional categories (drinks, sides, etc.)
  const menuAux = (menuObj["menu_aux"] ?? []) as unknown[];

  const allCats = [...menuArr, ...menuAux];

  allCats.forEach((cat: unknown, catIdx: number) => {
    if (!cat || typeof cat !== "object") return;
    const c = cat as Record<string, unknown>;
    const catId = String(c["_id"] ?? c["category_id"] ?? `cat_${catIdx}`);
    const catName = String(c["title"] ?? c["name"] ?? "Sem categoria").trim();

    // Skip categories with no items or only_pdv (point-of-sale only)
    const itens = (c["itens"] ?? []) as unknown[];
    if (itens.length === 0) return;
    if (c["only_pdv"] === true) return;

    categories.push({ id: catId, name: catName, sort_order: catIdx });

    itens.forEach((item: unknown, itemIdx: number) => {
      if (!item || typeof item !== "object") return;
      const p = item as Record<string, unknown>;
      const pid = String(p["_id"] ?? p["item_id"] ?? `${catIdx}_${itemIdx}`);

      // anota.ai prices are stored as integers in BRL (whole reais), not centavos
      // e.g. price=45 means R$45.00 → 4500 centavos
      const rawPrice = Number(p["price"] ?? p["simple_price"] ?? 0);
      const priceCents = Math.round(rawPrice * 100);

      // Image is a partial URL path from client-assets.anota.ai
      let imageUrl: string | null = null;
      const rawImage = p["image"];
      if (rawImage && typeof rawImage === "string" && rawImage.length > 0) {
        imageUrl = rawImage.startsWith("http")
          ? rawImage
          : `https://client-assets.anota.ai${rawImage.startsWith("/") ? "" : "/"}${rawImage}`;
      }

      const isAvailable = p["out"] !== true;

      products.push({
        id: pid,
        name: String(p["title"] ?? p["name"] ?? "").trim(),
        description: String(p["description"] ?? "").trim(),
        price_cents: priceCents,
        category_id: catId,
        category_name: catName,
        image_url: imageUrl,
        available: isAvailable,
        sort_order: itemIdx,
      });
    });
  });

  return { categories, products };
}

function parseProducts(captures: RawCapture[]): ScrapedData {
  let categories: ScrapedCategory[] = [];
  let products: ScrapedProduct[] = [];

  for (const { body, url } of captures) {
    if (!body || typeof body !== "object") continue;
    const obj = body as Record<string, unknown>;

    // anota.ai menu-merchant endpoint
    if (url.includes("nm-category") || url.includes("menu-merchant")) {
      const parsed = parseAnotaAiMenu(obj);
      if (parsed.products.length > 0) {
        categories = parsed.categories;
        products = parsed.products;
        console.log(`  [parser] menu-merchant: ${categories.length} cats, ${products.length} products`);
        break;
      }
    }
  }

  console.log(`\nParsed: ${categories.length} categories, ${products.length} products`);
  return {
    categories,
    products,
    raw_captures: captures,
    scraped_at: new Date().toISOString(),
  };
}

async function main() {
  console.log("Launching browser...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    locale: "pt-BR",
  });
  const page = await context.newPage();

  const captures: RawCapture[] = [];
  let menuResolved = false;

  // Intercept every JSON response the SPA makes
  page.on("response", async (response) => {
    const url = response.url();
    const ct = response.headers()["content-type"] ?? "";
    if (!ct.includes("json")) return;

    try {
      const json = await response.json();
      captures.push({ url, status: response.status(), body: json });

      if (json && typeof json === "object") {
        const keys = Object.keys(json as object);
        if (keys.length > 0) {
          console.log(`  [net] ${response.status()} ${url.slice(0, 120)}`);
          console.log(`        keys: ${keys.slice(0, 8).join(", ")}`);
        }
        // Mark menu as received when we see the menu-merchant endpoint
        if (url.includes("nm-category") || url.includes("menu-merchant")) {
          menuResolved = true;
        }
      }
    } catch {
      // binary or non-JSON body — ignore
    }
  });

  console.log(`\nNavigating to ${TARGET_URL} ...`);

  // Use "domcontentloaded" to avoid hanging on never-idle SPAs with polling connections
  try {
    await page.goto(TARGET_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
  } catch {
    console.warn("Navigation timeout on domcontentloaded, continuing anyway...");
  }

  // Wait up to 30s for the menu API response to arrive
  console.log("Waiting for menu API response...");
  const deadline = Date.now() + 30_000;
  while (!menuResolved && Date.now() < deadline) {
    await page.waitForTimeout(500);
  }

  if (!menuResolved) {
    // Scroll to trigger any lazy-loaded sections
    console.log("Menu not yet resolved, scrolling to trigger lazy loads...");
    for (let i = 0; i < 6; i++) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight));
      await page.waitForTimeout(800);
    }
  }

  // Extra wait for any additional category/page API calls
  await page.waitForTimeout(3_000);

  await browser.close();

  console.log(`\nTotal JSON responses captured: ${captures.length}`);

  // Also extract nested data from each capture
  const allCaptures = [...captures];
  for (const cap of captures) {
    extractFromResponse(cap.body, allCaptures, cap.url);
  }

  const data = parseProducts(allCaptures);

  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(data, null, 2));
  console.log(`\nSaved to ${OUT_FILE}`);
  console.log(`  Categories: ${data.categories.length}`);
  console.log(`  Products:   ${data.products.length}`);

  if (data.products.length === 0) {
    console.warn("\nWARNING: No products parsed. Check data/products.json raw_captures for API shape.");
    console.warn("Captured URLs:");
    captures.forEach((c) => console.warn(`  ${c.url}`));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
