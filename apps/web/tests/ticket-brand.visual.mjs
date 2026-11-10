// Visual integration test: comandas das 3 lojas na mesma impressora.
//  1. Renders the Windows app's ticket HTML (same function the desktop prints)
//     for Barbacue, Chelas and Barbadog side by side.
//  2. Opens each brand's order in /admin/orders with print media emulated
//     (browser printing) and checks the restaurant banner.
// Needs the server/DB used by orders-brand-backgrounds.visual.mjs (run it first
// to seed the orders and the test staff account).
//
//   DATABASE_URL=postgresql://localhost:5432/<db_with__test_> BASE=http://localhost:3100 node tests/ticket-brand.visual.mjs
//
import pw from "../../../node_modules/playwright/index.js";
import pg from "../../../node_modules/pg/lib/index.js";
import fs from "node:fs";
import path from "node:path";
import { scryptSync, randomBytes } from "node:crypto";
import { formatTicket } from "../../print-agent/src/ticket.mjs";
import { ticketHtml } from "../../desktop/src/printing.mjs";

const { chromium } = pw;
const BASE = process.env.BASE || "http://localhost:3000";
const DB = process.env.DATABASE_URL || "";
if (!/_test_/.test(DB)) throw new Error("Use a throwaway database whose name contains _test_");
const REPO = path.resolve(import.meta.dirname, "../../..");
const SHOTS = path.join(REPO, "test-screenshots");
const STAMP = process.env.STAMP || new Date().toISOString().slice(0, 10);
const BRANDS = [["barbacue", "BARBACUE"], ["chelas", "CHELAS"], ["barbadog", "BARBADOG"]];
const failures = [];
const browser = await chromium.launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {});

// 1. Desktop (Windows) ticket HTML, 80 mm.
const tickets = BRANDS.map(([brand], i) => ticketHtml(formatTicket({ version: 2, brand, orderNumber: `TEST000${i}`, channel: "anotaai", orderType: "delivery",
  customerName: "Cliente Teste", deliveryAddress: "Rua das Flores, 100", items: [{ name: "Combo da casa", qty: 2, notes: "Sem cebola" }],
  createdAt: "2026-11-10T13:00:00Z", subtotalCents: 9180, deliveryFeeCents: 700, totalCents: 9880, payment: { status: "paid", method: "pix" } }), 80));
const sheet = await browser.newPage({ viewport: { width: 1200, height: 900 } });
await sheet.setContent(`<body style="margin:0;display:flex;gap:24px;padding:24px;background:#ddd">${tickets.map((t) => `<iframe style="width:302px;height:820px;border:0;background:#fff" srcdoc="${t.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}"></iframe>`).join("")}</body>`);
for (const [i, [, name]] of BRANDS.entries()) {
  const banner = await sheet.frames()[i + 1].locator("pre.banner").innerText();
  if (!banner.includes(name)) failures.push(`desktop ${name}: banner "${banner.slice(0, 40)}"`);
}
await sheet.screenshot({ path: path.join(SHOTS, `ticket-brand-windows-${STAMP}.png`) });

// 2. Browser printing from the orders panel.
const db = new pg.Client({ connectionString: DB });
await db.connect();
const PASSWORD = "visual-test-pw-" + randomBytes(4).toString("hex");
const salt = randomBytes(16);
await db.query(`insert into staff_users (name, username, password_hash, role) values ('Teste Visual', 'visual-test', $1, 'admin')
  on conflict (username) do update set password_hash = excluded.password_hash, active = true`, [`${salt.toString("hex")}:${scryptSync(PASSWORD, salt, 64).toString("hex")}`]);
await db.end();
const page = await (await browser.newContext({ viewport: { width: 900, height: 1100 }, deviceScaleFactor: 2 })).newPage();
await page.goto(BASE + "/admin/login", { waitUntil: "networkidle", timeout: 90000 });
await page.fill("#user", "visual-test");
await page.fill("#pw", PASSWORD);
await page.keyboard.press("Enter");
await page.waitForURL((u) => !u.pathname.endsWith("/admin/login"), { timeout: 30000 });
await page.goto(BASE + "/admin/orders", { waitUntil: "networkidle", timeout: 90000 });
for (const [brand, name] of BRANDS) {
  await page.emulateMedia({ media: "screen" });
  await page.locator(".order-card", { hasText: name[0] + name.slice(1).toLowerCase() }).first().click();
  await page.emulateMedia({ media: "print" });
  const banner = page.locator(".order-print-brand");
  if (!(await banner.isVisible())) failures.push(`browser ${brand}: banner hidden in print`);
  else if (!(await banner.innerText()).toUpperCase().includes(name)) failures.push(`browser ${brand}: wrong banner`);
  await page.locator(".order-ticket").screenshot({ path: path.join(SHOTS, `ticket-brand-browser-${brand}-${STAMP}.png`) });
  await page.emulateMedia({ media: "screen" });
  await page.getByRole("button", { name: "Fechar" }).click();
}
await browser.close();
if (failures.length) { console.error("FAIL\n" + failures.join("\n")); process.exit(1); }
console.log("PASS restaurant banner on Windows and browser tickets for 3 brands");
