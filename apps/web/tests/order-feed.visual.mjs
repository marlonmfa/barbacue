// Visual integration test: /admin/orders/feed lists orders of the three
// restaurants with platform + restaurant tags, a direct link to the order and
// one PDF per kitchen part (same ticket the Elgin would print).
//
//   DATABASE_URL=postgresql://localhost:5432/<db_with__test_> BASE=http://localhost:3100 node tests/order-feed.visual.mjs
//
import pw from "../../../node_modules/playwright/index.js";
import pg from "../../../node_modules/pg/lib/index.js";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { scryptSync, randomBytes } from "node:crypto";

const { chromium } = pw;
const BASE = process.env.BASE || "http://localhost:3000";
const DB = process.env.DATABASE_URL || "";
if (!/_test_/.test(DB)) throw new Error("Use a throwaway database whose name contains _test_");
const REPO = path.resolve(import.meta.dirname, "../../..");
const SHOTS = path.join(REPO, "test-screenshots");
const STAMP = process.env.STAMP || new Date().toISOString().slice(0, 10);

const db = new pg.Client({ connectionString: DB });
await db.connect();
await db.query("delete from kitchen_print_jobs where order_id in (select id from orders where customer_phone like '5547999100%'); delete from orders where customer_phone like '5547999100%'");
const seed = [
  ["barbacue", "anotaai", "Ana Souza", [{ name: "Burrito", qty: 1, priceCents: 3000, restaurant: "Chelas" }, { name: "Smash", qty: 2, priceCents: 3000, restaurant: "Barbacue" }, { name: "Dog", qty: 1, priceCents: 2500, restaurant: "Barbadog" }]],
  ["chelas", "ifood", "Bruno Lima", [{ name: "Quesadilla", qty: 1, priceCents: 4200 }]],
  ["barbadog", "chat", "Carla Dias", [{ name: "Dog duplo", qty: 2, priceCents: 2800 }]],
];
const ids = [];
for (const [i, [brand, channel, name, items]] of seed.entries()) {
  const total = items.reduce((s, it) => s + it.qty * it.priceCents, 0);
  const { rows } = await db.query(`insert into orders (customer_name, customer_phone, items, subtotal_cents, total_cents, brand, channel, status, order_type, delivery_address, created_at)
    values ($1, $2, $3, $4, $4, $5, $6, 'confirmed', 'delivery', 'Rua das Flores, 100', now() - ($7 || ' seconds')::interval) returning id`,
    [name, `5547999100${i}`, JSON.stringify(items), total, brand, channel, String(i)]);
  ids.push(rows[0].id);
}
const { rows: jobs } = await db.query("select count(*)::int n from kitchen_print_jobs where order_id = any($1)", [ids]);
const PASSWORD = "visual-test-pw-" + randomBytes(4).toString("hex");
const salt = randomBytes(16);
await db.query(`insert into staff_users (name, username, password_hash, role) values ('Teste Visual', 'visual-test', $1, 'admin')
  on conflict (username) do update set password_hash = excluded.password_hash, active = true`, [`${salt.toString("hex")}:${scryptSync(PASSWORD, salt, 64).toString("hex")}`]);
await db.end();

const failures = [];
if (jobs[0].n !== 3) failures.push(`expected print jobs for the 3 orders, got ${jobs[0].n}`);
const browser = await chromium.launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.goto(BASE + "/admin/login", { waitUntil: "networkidle", timeout: 90000 });
await page.fill("#user", "visual-test"); await page.fill("#pw", PASSWORD); await page.keyboard.press("Enter");
await page.waitForURL((u) => !u.pathname.endsWith("/admin/login"), { timeout: 30000 });
await page.goto(BASE + "/admin/orders/feed", { waitUntil: "networkidle", timeout: 90000 });

const first = page.getByTestId("feed-order").first();
if (!(await first.innerText()).includes("Ana Souza")) failures.push("newest order should be first");
const pdfLinks = await first.getByTestId("feed-pdf").allInnerTexts();
if (pdfLinks.length !== 3 || !pdfLinks[0].includes("1/3") || !pdfLinks[0].includes("Chelas")) failures.push(`3 PDFs expected, got ${pdfLinks.join(" | ")}`);
const tags = await first.locator(".order-tag").allInnerTexts();
if (tags.join() !== "Anota AI,Barbacue") failures.push(`tags ${tags}`);
await page.screenshot({ path: path.join(SHOTS, `order-feed-${STAMP}.png`) });

// PDF da parte 1 (Chelas): resposta PDF de verdade.
const href = await first.getByTestId("feed-pdf").first().getAttribute("href");
const res = await ctx.request.get(BASE + href);
const body = await res.body();
if (res.headers()["content-type"] !== "application/pdf" || !body.subarray(0, 8).toString().startsWith("%PDF")) failures.push("PDF route did not return a PDF");
if (!body.toString("latin1").includes("PARTE 1 DE 3 - CHELAS")) failures.push("PDF part 1 is not the Chelas kitchen");
const pdfPath = path.join(SHOTS, `order-feed-pdf-${STAMP}.pdf`);
fs.writeFileSync(pdfPath, body);
try { execFileSync("sips", ["-s", "format", "png", "--resampleWidth", "600", pdfPath, "--out", pdfPath.replace(/\.pdf$/, ".png")]); } catch {}
fs.rmSync(pdfPath);

// Link direto abre o pedido no painel.
await first.locator(".order-feed-open").click();
await page.waitForURL(/\/admin\/orders\?pedido=/, { timeout: 90000 });
await page.locator(".order-ticket").waitFor({ timeout: 90000 });
if (!(await page.locator(".order-ticket").innerText()).includes("Ana Souza")) failures.push("order link did not open the order");
await browser.close();
if (failures.length) { console.error("FAIL\n" + failures.join("\n")); process.exit(1); }
console.log("PASS order feed with tags, direct link and per-kitchen PDFs");
