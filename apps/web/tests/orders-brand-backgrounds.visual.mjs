// Visual integration test: the unified /admin/orders board shows the three
// restaurants' orders together, each card on its restaurant's background.
// Seeds 6 Anota AI orders into a *throwaway* database (name must contain
// "_test_"), creates a test staff account, logs in and screenshots the board.
//
//   DATABASE_URL=postgresql://localhost:5432/barbacue_orders_brand_test_20261109 \
//   BASE=http://localhost:3100 node tests/orders-brand-backgrounds.visual.mjs
//
import pw from "../../../node_modules/playwright/index.js";
import pg from "../../../node_modules/pg/lib/index.js";
import fs from "node:fs";
import path from "node:path";
import { scryptSync, randomBytes } from "node:crypto";

const { chromium } = pw;
const BASE = process.env.BASE || "http://localhost:3000";
const DB = process.env.DATABASE_URL || "";
if (!/_test_/.test(DB)) throw new Error("Use a throwaway database whose name contains _test_");
const REPO = path.resolve(import.meta.dirname, "../../..");
const SHOTS = path.join(REPO, "test-screenshots");
fs.mkdirSync(SHOTS, { recursive: true });
const STAMP = process.env.STAMP || new Date().toISOString().slice(0, 10);

const db = new pg.Client({ connectionString: DB });
await db.connect();
await db.query("delete from kitchen_print_jobs; delete from orders where customer_phone like '5547999000%'");
const seed = [
  ["barbacue", "confirmed", "Ana Souza"], ["chelas", "confirmed", "Bruno Lima"], ["barbadog", "preparing", "Carla Dias"],
  ["chelas", "preparing", "Diego Reis"], ["barbacue", "ready", "Cliente Anota AI"], ["barbadog", "confirmed", "Fábio Melo"],
];
for (const [i, [brand, status, name]] of seed.entries()) {
  await db.query(
    `insert into orders (customer_name, customer_phone, items, subtotal_cents, total_cents, brand, channel, status, order_type, notes, created_at)
     values ($1, $2, $3, 4590, 4590, $4, 'anotaai', $5, $6, $7, now() - ($8 || ' minutes')::interval)`,
    [name, `5547999000${i}`, JSON.stringify([{ name: "Combo da casa", priceCents: 4590, qty: 1 }]), brand, status,
     name === "Cliente Anota AI" ? "dine_in" : "delivery",
     name === "Cliente Anota AI" ? "Anota AI #12829\nLoja Anota AI: Barbacue\nMesa: Mesa 16\nPagamento: A definir · Garçom: Caroline" : null, String(i * 4)]);
}
// Test-only staff account (scrypt "salt:hash", same format as staff-auth.ts).
const PASSWORD = "visual-test-pw-" + randomBytes(4).toString("hex");
const salt = randomBytes(16);
await db.query(
  `insert into staff_users (name, username, password_hash, role) values ('Teste Visual', 'visual-test', $1, 'admin')
   on conflict (username) do update set password_hash = excluded.password_hash, active = true`,
  [`${salt.toString("hex")}:${scryptSync(PASSWORD, salt, 64).toString("hex")}`]);
await db.end();

const failures = [];
const browser = await chromium.launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {});
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })).newPage();
await page.goto(BASE + "/admin/login", { waitUntil: "networkidle", timeout: 90000 });
await page.fill("#user", "visual-test");
await page.fill("#pw", PASSWORD);
await page.keyboard.press("Enter");
await page.waitForURL((u) => !u.pathname.endsWith("/admin/login"), { timeout: 30000 });
await page.goto(BASE + "/admin/orders", { waitUntil: "networkidle", timeout: 90000 });
await page.locator(".order-card").first().waitFor({ timeout: 30000 });

const cards = await page.locator(".order-card").evaluateAll((els) => els.map((e) => ({ brand: e.dataset.brand, bg: getComputedStyle(e).backgroundImage + getComputedStyle(e).backgroundColor })));
for (const brand of ["barbacue", "chelas", "barbadog"]) {
  const mine = cards.filter((c) => c.brand === brand);
  if (mine.length !== 2) failures.push(`${brand}: expected 2 cards, got ${mine.length}`);
}
const backgrounds = new Set(["barbacue", "chelas", "barbadog"].map((b) => cards.find((c) => c.brand === b)?.bg));
if (backgrounds.size !== 3) failures.push("brand backgrounds are not distinct");
// Title shows who the order belongs to; two fixed-color tags (origin, restaurant).
const titles = await page.locator(".order-card h3").allInnerTexts();
if (titles.includes("Cliente Anota AI")) failures.push("generic 'Cliente Anota AI' still used as title");
if (!titles.includes("Mesa 16")) failures.push(`salão order should be titled by table, got ${titles.join(", ")}`);
const tags = await page.locator(".order-card").evaluateAll((els) => els.map((e) => [...e.querySelectorAll(".order-tag")].map((t) => `${t.textContent}|${getComputedStyle(t).backgroundColor}`)));
if (!tags.every((t) => t.length === 2 && t[0].startsWith("Anota AI|"))) failures.push("each card needs origin + restaurant tags");
if (new Set(tags.map((t) => t[0])).size !== 1) failures.push("Anota AI tag color varies between cards");
for (const b of ["Barbacue", "Chelas", "Barbadog"]) if (new Set(tags.map((t) => t[1]).filter((x) => x.startsWith(b))).size !== 1) failures.push(`${b} tag color varies`);
await page.screenshot({ path: path.join(SHOTS, `orders-brand-backgrounds-${STAMP}.png`), fullPage: false });
await browser.close();
if (failures.length) { console.error("FAIL\n" + failures.join("\n")); process.exit(1); }
console.log("PASS unified board with 3 brand backgrounds");
