// Teste visual de ponta a ponta do painel DRE e fluxo de caixa (/admin/financeiro).
// Uso (só banco local): DATABASE_URL=... ADMIN_COOKIE_SECRET=... FIN_TEST_URL=http://127.0.0.1:3000 \
//   node tests/financeiro.visual.mjs
// Semeia pedidos e lançamentos fictícios marcados com "fin-visual", abre a tela logado
// como admin, confere valores na tabela e salva screenshots em test-screenshots/.
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mkdir } from "node:fs/promises";
import pg from "pg";
import { chromium } from "playwright";

const base = process.env.FIN_TEST_URL;
assert(base && ["localhost", "127.0.0.1"].includes(new URL(base).hostname), "use um servidor local");
assert(/@(127\.0\.0\.1|localhost)[:/]/.test(process.env.DATABASE_URL ?? ""), "use um banco local");
const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const month = day.slice(0, 7);
const shift = (m, d) => {
  const [y, mo] = m.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1 + d, 1)).toISOString().slice(0, 7);
};
const months = [shift(month, -2), shift(month, -1), month];
const out = new URL("../../../test-screenshots/", import.meta.url);
await mkdir(out, { recursive: true });

// ─── Dados fictícios ─────────────────────────────────────────────────────────
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
await client.query("DELETE FROM orders WHERE notes = 'fin-visual'");
await client.query("DELETE FROM erp_finance WHERE source_key LIKE 'fin-visual:%'");
const { rows: [staff] } = await client.query(
  `INSERT INTO staff_users (name, username, password_hash, role, active)
   VALUES ('Teste Financeiro', 'fin-visual@example.test', 'x', 'admin', true)
   ON CONFLICT (username) DO UPDATE SET role = 'admin', active = true RETURNING id`,
);
const brands = { barbacue: 1, chelas: 0.45, barbadog: 0.12 };
let expectedBarbacueThisMonth = 0;
for (const [mi, m] of months.entries()) {
  const lastDay = m === month ? Number(day.slice(8, 10)) : 28;
  for (const [brand, scale] of Object.entries(brands)) {
    for (let d = 1; d <= lastDay; d += 1) {
      const n = Math.max(1, Math.round((6 + (d % 5) + mi) * scale));
      for (let i = 0; i < n; i += 1) {
        const ifood = i % 3 !== 0;
        const items = 4500 + ((d * 37 + i * 211) % 5000);
        const fee = ifood ? 0 : 700;
        const disc = i % 7 === 0 ? 500 : 0;
        const total = items - disc + fee;
        if (brand === "barbacue" && m === month) expectedBarbacueThisMonth += items;
        await client.query(
          `INSERT INTO orders (brand, customer_name, customer_phone, items, subtotal_cents, discount_cents,
             delivery_fee_cents, total_cents, status, payment_method, payment_status, channel, notes, created_at)
           VALUES ($1, 'Cliente teste', '5547900000000', '[]', $2, $3, $4, $5, 'delivered', $6, 'paid', $7, 'fin-visual',
                   ($8::date + time '20:00') AT TIME ZONE 'America/Sao_Paulo')`,
          [brand, items, disc, fee, total, ifood ? null : ["pix", "cash", "card_on_delivery"][i % 3], ifood ? "ifood" : "click",
           `${m}-${String(d).padStart(2, "0")}`],
        );
      }
    }
  }
  // Despesas do mês por loja (proporcionais ao porte), já pagas no dia 10.
  const plan = [
    ["purchase", "Insumos Segala's", 0.33],
    ["packaging", "Embalagens", 0.04],
    ["payroll", "Folha do mês", 0.22],
    ["rent", "Aluguel", 0.08],
    ["utilities", "Energia e gás", 0.035],
    ["tax", "PGDAS", 0.06],
    ["marketing", "Impulsionamento", 0.02],
    ["admin", "Contador", 0.012],
    ["fees", "Taxas maquininha", 0.008],
  ];
  for (const [brand, scale] of Object.entries(brands)) {
    const base = Math.round(1_500_000 * scale);
    for (const [cat, desc, share] of plan) {
      const settled = m !== month || cat === "rent";
      await client.query(
        `INSERT INTO erp_finance (brand, kind, category, description, amount_cents, due_date, competence, document,
            source_key, status, settled_date, payment_method, receipt)
         VALUES ($1, 'payable', $2, $3, $4, $5::date, $6, $7, $8, $9, $10::date, $11, $12)`,
        [brand, cat, desc, Math.round(base * share), `${m}-10`, m, cat === "tax" ? "guia" : "",
         `fin-visual:${m}:${brand}:${cat}`, settled ? "settled" : "open", settled ? `${m}-10` : null,
         settled ? "pix" : null, settled ? "comprovante teste" : null],
      );
    }
  }
}
await client.end();

// ─── Navegador ───────────────────────────────────────────────────────────────
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
const payload = `${staff.id}|admin|${Date.now() + 600000}|full`;
await context.addCookies([
  {
    name: "barbacue_admin",
    value: `${payload}.${createHmac("sha256", process.env.ADMIN_COOKIE_SECRET).update(payload).digest("base64url")}`,
    url: base,
  },
]);
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto(`${base}/admin/financeiro`);
  await page.getByRole("heading", { name: "DRE e fluxo de caixa" }).waitFor();
  await page.getByText("Receita bruta", { exact: true }).first().waitFor();
  await page.getByRole("button", { name: "Últimos 3 meses" }).click();
  await page.screenshot({ path: new URL(`financeiro-visao-geral-${day}.png`, out).pathname, fullPage: true });

  await page.getByRole("tab", { name: "DRE" }).click();
  await page.getByRole("button", { name: "Este mês" }).click();
  const rb = page.locator('tr[data-row="rb_propria"] td').first();
  const ifoodRow = page.locator('tr[data-row="rb_ifood"] td').first();
  const brl = (s) => Number(s.replace(/[^\d,-]/g, "").replace(",", "."));
  const shown = Math.round((brl(await rb.innerText()) + brl(await ifoodRow.innerText())) * 100);
  assert.equal(shown, expectedBarbacueThisMonth, "vendas próprias + iFood do Barbacue batem com os pedidos semeados");
  assert.match(await page.locator('tr[data-row="ded_ifood"] td').first().innerText(), /≈/);
  await page.getByRole("button", { name: "Últimos 3 meses" }).click();
  await page.screenshot({ path: new URL(`financeiro-dre-por-loja-${day}.png`, out).pathname, fullPage: true });

  // Drill-down de uma despesa fixa.
  await page.locator('tr[data-row="fix_ocupacao"] td').last().getByRole("button").click();
  await page.getByRole("complementary", { name: "Lançamentos da linha" }).getByText("Aluguel").first().waitFor();
  await page.getByRole("button", { name: "Fechar" }).click();

  await page.getByRole("combobox", { name: "Colunas" }).selectOption("months");
  await page.locator("thead th", { hasText: "Total" }).waitFor();
  await page.screenshot({ path: new URL(`financeiro-dre-mensal-${day}.png`, out).pathname, fullPage: true });

  await page.getByRole("tab", { name: "Fluxo de caixa (DFC)" }).click();
  await page.getByRole("combobox", { name: "Colunas" }).selectOption("brands");
  await page.locator('tr[data-row="saldo_final"]').waitFor();
  const saldo = await page.locator('tr[data-row="saldo_final"] td').last().innerText();
  assert.ok(brl(saldo) !== 0, "saldo final calculado");
  await page.screenshot({ path: new URL(`financeiro-dfc-${day}.png`, out).pathname, fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/admin/financeiro`);
  await page.getByRole("button", { name: "Últimos 3 meses" }).click();
  assert.equal(await page.evaluate(() => document.scrollingElement.scrollWidth), 390, "sem rolagem lateral no celular");
  await page.screenshot({ path: new URL(`financeiro-mobile-${day}.png`, out).pathname, fullPage: true });
  assert.deepEqual(errors, [], "sem erros de JavaScript na página");
  console.log("financeiro.visual: ok");
} finally {
  await browser.close();
}
