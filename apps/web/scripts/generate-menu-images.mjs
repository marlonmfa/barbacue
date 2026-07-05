#!/usr/bin/env node
/**
 * Fill in missing product photos for the menu.
 *
 * Strategy (per the owner's call):
 *   - Flagship house items (artisan burgers + house combos) are UNIQUE to Barba,
 *     so there is no real-world photo of them → generate with OpenAI gpt-image-1.
 *   - Everything else (drinks, add-ons, sauces, sides, desserts) already exists in
 *     the real world → fetch a real photo from a free stock source and host it locally.
 *
 * Both paths download the bytes into public/generated/products/<id>.png (or .jpg)
 * and UPDATE products.image_url to the local path, so the store is self-hosted and
 * never depends on a hotlinked URL that can rot. ProductImage renders remote/local
 * `src` with `unoptimized`, so a local path needs no next.config change.
 *
 * Stock source: Unsplash if UNSPLASH_ACCESS_KEY is set, else keyless Openverse
 * (CC-licensed). Idempotent: products that already have a non-empty image_url are
 * skipped, and re-runs only touch the ones still missing.
 *
 * Usage:
 *   node scripts/generate-menu-images.mjs            # do everything
 *   node scripts/generate-menu-images.mjs --dry-run  # print plan, touch nothing
 *   node scripts/generate-menu-images.mjs --only=web # only stock photos
 *   node scripts/generate-menu-images.mjs --only=ai  # only OpenAI flagship
 *   node scripts/generate-menu-images.mjs --limit=5  # cap number processed
 */

import { readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";
import OpenAI from "openai";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT_DIR = join(ROOT, "public", "generated", "products");

// ── args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const ONLY = (args.find((a) => a.startsWith("--only=")) || "").split("=")[1] || "all";
const LIMIT = Number((args.find((a) => a.startsWith("--limit=")) || "").split("=")[1] || 0);

// ── env (load ../../.env then apps/web/.env if present) ─────────────────────
loadEnv(join(ROOT, "..", "..", ".env"));
loadEnv(join(ROOT, ".env"));

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) fail("DATABASE_URL not set");

// Categories whose items are house-unique → generate with OpenAI. Everything
// else is a real-world product → stock photo. Matches the slug taxonomy in
// src/lib/category-art.ts.
const FLAGSHIP_SLUG = /^(combos|combos-individuais|combos-para-compartilhar|hamburgueres|hamburguer-vegetariano)$/;

// ── stock search query: PT product name → EN food keywords ──────────────────
// Ordered, most-specific-first. First hit wins; falls back to a cleaned name.
const QUERY_RULES = [
  [/gin\s*t[oô]nica/i, "gin tonic cocktail"],
  [/gin/i, "gin cocktail drink"],
  [/mojito/i, "mojito cocktail"],
  [/caipir|lim[aã]o|morango|abacaxi|hortel/i, "caipirinha cocktail"],
  [/vinho\s*branco|branco/i, "white wine glass"],
  [/vinho|tinto/i, "red wine glass"],
  [/cervej|chopp|beer/i, "beer glass"],
  [/coca|refri|refrigerante/i, "cola soft drink can"],
  [/suco|sabor\s*(manga|maracuj|p[eê]ssego|uva)/i, "fruit juice can"],
  [/g[aá]s|sem\s*g[aá]s|[aá]gua/i, "water bottle"],
  [/bacon/i, "crispy bacon"],
  [/batata.*(waffle)/i, "waffle fries"],
  [/batata.*(crinkle|crinkles)/i, "crinkle cut fries"],
  [/batata|fritas|palito/i, "french fries"],
  [/anel|onion/i, "onion rings"],
  [/queijo\s*brie|brie/i, "brie cheese"],
  [/gouda/i, "gouda cheese"],
  [/cheddar/i, "cheddar cheese slice"],
  [/catupiry|creme\s*de\s*queij|queijo/i, "melted cheese"],
  [/gorgonzola/i, "gorgonzola cheese"],
  [/costela|desfiad/i, "pulled beef brisket"],
  [/entrecot|steak/i, "grilled steak"],
  [/hamburguer|h[aâ]mburguer|burger/i, "hamburger patty"],
  [/chimichurri/i, "chimichurri sauce"],
  [/farofa/i, "farofa brazilian"],
  [/barbecue|barbacue/i, "barbecue sauce"],
  [/chipotle/i, "chipotle sauce"],
  [/sweet\s*chilli|chilli/i, "sweet chilli sauce"],
  [/maionese/i, "aioli mayonnaise dip"],
  [/geleia\s*de\s*tomate/i, "tomato jam"],
  [/chutney/i, "onion chutney"],
  [/jalape/i, "jalapeno peppers"],
  [/pimenta/i, "chili pepper"],
  [/picles/i, "pickles"],
  [/alface/i, "lettuce"],
  [/r[uú]cula/i, "arugula rocket"],
  [/cebola\s*roxa|cebola/i, "red onion"],
  [/cogumelo/i, "mushrooms"],
  [/couve|alho/i, "cauliflower"],
  [/cevad/i, "barley grains"],
  [/nutella/i, "nutella chocolate spread"],
  [/ovomaltine|ovomalt/i, "chocolate malt dessert"],
  [/negresco|oreo/i, "cookies and cream dessert"],
  [/brigadeiro/i, "brigadeiro chocolate"],
  [/doce\s*de\s*leite/i, "dulce de leche"],
  [/prest[ií]gio/i, "coconut chocolate dessert"],
  [/maracuj/i, "passion fruit mousse"],
  [/morango/i, "strawberry dessert"],
  [/uva/i, "grape dessert"],
  [/strogonoff|nozes/i, "walnut dessert"],
  [/churros/i, "churros"],
  [/quesadilha/i, "quesadilla"],
  [/gelad|sobremesa/i, "ice cream dessert"],
  [/salada/i, "green salad bowl"],
  [/tortilh|nachos|milho/i, "tortilla chips nachos"],
  [/beef\s*melt|fries/i, "loaded cheese fries"],
];

function stockQuery(name) {
  // Match accent-insensitively so "Hambúrguer" hits the /hamburguer/ rule etc.
  const flat = name.normalize("NFD").replace(/[̀-ͯ]/g, "");
  for (const [re, q] of QUERY_RULES) if (re.test(name) || re.test(flat)) return q;
  // fallback: strip "adicional/adicione/extra/de/+numbers" noise, romanize
  return (
    name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/adicion\w*|adicione|extra|\+?\s*\d+\s*(und|g|ml|fatias|mini)?/gi, "")
      .replace(/[^a-zA-Z ]/g, " ")
      .trim() || "food"
  ) + " food";
}

// ── AI prompt for house flagship items ──────────────────────────────────────
function aiPrompt(name, categoryName) {
  return (
    `Professional overhead food photography of "${name}", a gourmet artisan ` +
    `${/combo/i.test(categoryName) ? "burger combo meal with sides" : "smash burger"} ` +
    `from a Brazilian barbecue burger joint. Juicy, appetizing, sesame brioche bun, ` +
    `melted cheese, fresh toppings, on a dark slate board, warm moody restaurant ` +
    `lighting, shallow depth of field, no text, no watermark, photorealistic, 4k.`
  );
}

// ── fetch helpers ───────────────────────────────────────────────────────────
// Magic-byte sniffers — a 200 response is no guarantee the body is an image.
const isJpeg = (b) => b.length > 2 && b[0] === 0xff && b[1] === 0xd8;
const isPng = (b) => b.length > 7 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
const isWebp = (b) => b.length > 11 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP";
const isGif = (b) => b.length > 3 && b.toString("ascii", 0, 3) === "GIF";
const isImage = (b) => isJpeg(b) || isPng(b) || isWebp(b) || isGif(b);

async function getBytes(url, timeoutMs = 30000) {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { "User-Agent": "barbacue-menu-image-bot" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

// Returns an ORDERED list of candidate image URLs. Stock hosts (esp. Openverse's
// CC aggregation) frequently point at rotted origins, so the caller tries each in
// turn and keeps the first that actually downloads.
async function findStockUrls(query) {
  const out = [];
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (key) {
    try {
      const u = `https://api.unsplash.com/search/photos?per_page=5&orientation=squarish&query=${encodeURIComponent(query)}`;
      const res = await fetch(u, {
        headers: { Authorization: `Client-ID ${key}` },
        signal: AbortSignal.timeout(20000),
      });
      if (res.ok) {
        const j = await res.json();
        for (const r of j.results ?? []) if (r.urls?.regular) out.push(r.urls.regular);
      }
    } catch {}
  }
  // Keyless fallback: Openverse (CC-licensed aggregator). Ask for many so we can
  // skip dead hosts. `thumbnail` is Openverse's own proxied/cached copy — far more
  // reliable than the original `url`, so prefer it.
  try {
    const ov = `https://api.openverse.org/v1/images/?page_size=12&license_type=commercial&mature=false&q=${encodeURIComponent(query)}`;
    const res = await fetch(ov, {
      headers: { "User-Agent": "barbacue-menu-image-bot" },
      signal: AbortSignal.timeout(20000),
    });
    if (res.ok) {
      const j = await res.json();
      for (const r of j.results ?? []) {
        if (r.thumbnail) out.push(r.thumbnail);
        if (r.url) out.push(r.url);
      }
    }
  } catch {}
  if (!out.length) throw new Error(`no stock candidates for "${query}"`);
  return out;
}

// ── main ─────────────────────────────────────────────────────────────────
const pool = new pg.Pool({ connectionString: DATABASE_URL });

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const { rows } = await pool.query(
    `select p.id, p.name, c.slug as cat_slug, c.name as cat_name
       from products p join categories c on c.id = p.category_id
      where p.image_url is null or p.image_url = ''
      order by c.slug, p.name`
  );

  const plan = rows
    .map((r) => ({ ...r, mode: FLAGSHIP_SLUG.test(r.cat_slug) ? "ai" : "web" }))
    .filter((r) => ONLY === "all" || r.mode === ONLY);
  const work = LIMIT > 0 ? plan.slice(0, LIMIT) : plan;

  console.log(
    `${rows.length} products missing images → ${plan.filter((r) => r.mode === "ai").length} AI, ` +
      `${plan.filter((r) => r.mode === "web").length} web. Processing ${work.length}.\n`
  );

  const openai = plan.some((r) => r.mode === "ai") && !DRY
    ? new OpenAI({ apiKey: mustEnv("OPENAI_API_KEY") })
    : null;

  let ok = 0,
    failed = 0;
  for (const p of work) {
    const label = `[${p.mode}] #${p.id} ${p.name} (${p.cat_name})`;
    try {
      if (DRY) {
        console.log(
          p.mode === "ai" ? `${label}\n    → AI generate` : `${label}\n    → stock "${stockQuery(p.name)}"`
        );
        continue;
      }

      let buf, ext;
      if (p.mode === "ai") {
        const r = await openai.images.generate({
          model: "gpt-image-1",
          prompt: aiPrompt(p.name, p.cat_name),
          size: "1024x1024",
          quality: "medium",
        });
        buf = Buffer.from(r.data[0].b64_json, "base64");
        ext = "png";
      } else {
        const candidates = await findStockUrls(stockQuery(p.name));
        let lastErr;
        for (const url of candidates) {
          try {
            const b = await getBytes(url);
            // Guard against 1x1 trackers / HTML error pages returned with 200.
            if (b.length < 3000 || !isImage(b)) throw new Error(`not a usable image (${b.length}B)`);
            buf = b;
            ext = isJpeg(b) ? "jpg" : isWebp(b) ? "webp" : "png";
            break;
          } catch (e) {
            lastErr = e;
          }
        }
        if (!buf) throw new Error(`all ${candidates.length} candidates failed (${lastErr?.message})`);
      }

      const file = `${p.id}.${ext}`;
      writeFileSync(join(OUT_DIR, file), buf);
      const publicPath = `/generated/products/${file}`;
      await pool.query(`update products set image_url = $1 where id = $2`, [publicPath, p.id]);
      ok++;
      console.log(`✓ ${label} → ${publicPath} (${(buf.length / 1024) | 0} KB)`);
    } catch (err) {
      failed++;
      console.error(`✗ ${label}\n    ${err.message}`);
    }
  }

  console.log(`\nDone. ${ok} ok, ${failed} failed${DRY ? " (dry-run)" : ""}.`);
  await pool.end();
}

// ── tiny env loader (avoids a dotenv import mismatch across workspaces) ──────
function loadEnv(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const [, k, v] = m;
    if (process.env[k] === undefined) process.env[k] = v.replace(/^["']|["']$/g, "");
  }
}
function mustEnv(k) {
  const v = process.env[k];
  if (!v) fail(`${k} not set`);
  return v;
}
function fail(msg) {
  console.error(`ERROR: ${msg}`);
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
