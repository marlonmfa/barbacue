// Visual integration test: comanda do Windows com convite + QR (Anota AI/iFood)
// e pedido de 3 restaurantes dividido em 3 partes (mesmo código, "parte i de 3").
// Uses the same ticketHtml the desktop app prints; no server needed.
//
//   node tests/ticket-invite-split.visual.mjs
//
import pw from "../../../node_modules/playwright/index.js";
import path from "node:path";
import { formatTicket } from "../../print-agent/src/ticket.mjs";
import { ticketHtml } from "../../desktop/src/printing.mjs";

const { chromium } = pw;
const REPO = path.resolve(import.meta.dirname, "../../..");
const STAMP = process.env.STAMP || new Date().toISOString().slice(0, 10);
const html = ticketHtml(formatTicket({ version: 2, brand: "barbacue", orderNumber: "AB12CD34", channel: "anotaai", orderType: "delivery",
  customerName: "Ana Souza", deliveryAddress: "Rua das Flores, 100", createdAt: "2026-11-10T22:00:00Z",
  items: [{ name: "Burrito de carne", qty: 1, restaurant: "Chelas" }, { name: "Smash duplo", qty: 2, restaurant: "Barbacue" },
    { name: "Dog completo", qty: 1, restaurant: "Barbadog" }, { name: "Coca-Cola lata", qty: 2 }],
  subtotalCents: 12900, deliveryFeeCents: 700, totalCents: 13600, payment: { status: "paid", method: "pix" } }), 80);
const browser = await chromium.launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {});
const page = await browser.newPage({ viewport: { width: 1100, height: 1000 }, deviceScaleFactor: 2 });
// The three parts side by side, as they come off the printer.
const head = html.slice(0, html.indexOf("</style>") + 8);
const parts = html.slice(head.length).split('<pre class="cut">').map((p, i) => head + (i ? '<pre class="cut">' : "") + p.replace("</html>", "") + "</html>");
await page.setContent(`<body style="margin:0;display:flex;gap:20px;padding:20px;background:#ddd;align-items:flex-start">${parts.map((p) =>
  `<iframe style="width:302px;height:940px;border:0;background:#fff" srcdoc="${p.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}"></iframe>`).join("")}</body>`);
const failures = [];
if (parts.length !== 3) failures.push(`expected 3 parts, got ${parts.length}`);
for (const [i, frame] of page.frames().slice(1).entries()) {
  if ((await frame.locator(".qr svg").count()) !== 1) failures.push(`part ${i + 1}: QR missing`);
  if (!(await frame.locator("body").innerText()).includes(`PARTE ${i + 1} DE 3`)) failures.push(`part ${i + 1}: label missing`);
}
await page.screenshot({ path: path.join(REPO, "test-screenshots", `ticket-invite-split-${STAMP}.png`), fullPage: true });
await browser.close();
if (failures.length) { console.error("FAIL\n" + failures.join("\n")); process.exit(1); }
console.log("PASS invite QR + 3-part ticket");
