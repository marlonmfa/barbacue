import * as fs from "fs";
import * as path from "path";
import { Pool } from "pg";
import * as dotenv from "dotenv";

dotenv.config({ path: path.join(__dirname, "../../../.env") });

const DATA_FILE = path.join(__dirname, "../data/products.json");

interface ScrapedCategory {
  id: string;
  name: string;
  sort_order: number;
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

interface ScrapedData {
  categories: ScrapedCategory[];
  products: ScrapedProduct[];
}

async function main() {
  if (!fs.existsSync(DATA_FILE)) {
    console.error(`Missing data file: ${DATA_FILE}`);
    console.error("Run 'npm run scrape' first.");
    process.exit(1);
  }

  const data: ScrapedData = JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
  console.log(`Loaded: ${data.categories.length} categories, ${data.products.length} products`);

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  // Build slug from name
  const toSlug = (name: string) =>
    name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

  // Map external category id → internal DB id
  const catIdMap = new Map<string, number>();

  console.log("\nInserting categories...");
  for (const cat of data.categories) {
    const slug = toSlug(cat.name);
    const res = await pool.query(
      `INSERT INTO categories (name, slug, sort_order)
       VALUES ($1, $2, $3)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, sort_order = EXCLUDED.sort_order
       RETURNING id`,
      [cat.name, slug, cat.sort_order]
    );
    catIdMap.set(cat.id, res.rows[0].id as number);
    console.log(`  [cat] "${cat.name}" → id=${res.rows[0].id}`);
  }

  console.log("\nInserting products...");
  let inserted = 0;
  let skipped = 0;

  for (const prod of data.products) {
    const categoryId = catIdMap.get(prod.category_id);
    if (categoryId === undefined) {
      console.warn(`  [skip] product "${prod.name}" — unknown category_id=${prod.category_id}`);
      skipped++;
      continue;
    }

    await pool.query(
      `INSERT INTO products (external_id, category_id, name, description, price_cents, image_url, available, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (external_id) DO UPDATE
         SET name = EXCLUDED.name,
             description = EXCLUDED.description,
             price_cents = EXCLUDED.price_cents,
             image_url = EXCLUDED.image_url,
             available = EXCLUDED.available,
             sort_order = EXCLUDED.sort_order`,
      [
        prod.id,
        categoryId,
        prod.name,
        prod.description || null,
        prod.price_cents,
        prod.image_url,
        prod.available,
        prod.sort_order,
      ]
    );
    inserted++;
  }

  console.log(`\nDone. Inserted/updated: ${inserted}, skipped: ${skipped}`);

  const counts = await pool.query(
    "SELECT (SELECT count(*) FROM categories) AS cats, (SELECT count(*) FROM products) AS prods"
  );
  console.log(`DB totals — categories: ${counts.rows[0].cats}, products: ${counts.rows[0].prods}`);

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
