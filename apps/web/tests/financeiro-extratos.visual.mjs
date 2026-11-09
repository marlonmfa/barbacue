// Ponta a ponta da importação de extrato: OFX fictício → regras → conciliação com conta
// em aberto → revisão com "lembrar favorecido" → valores no DRE/DFC.
// Uso (só local): DATABASE_URL=... ADMIN_COOKIE_SECRET=... FIN_TEST_URL=http://127.0.0.1:3311 \
//   node tests/financeiro-extratos.visual.mjs
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import { chromium } from "playwright";

const base = process.env.FIN_TEST_URL;
assert(base && ["localhost", "127.0.0.1"].includes(new URL(base).hostname), "use um servidor local");
assert(/@(127\.0\.0\.1|localhost)[:/]/.test(process.env.DATABASE_URL ?? ""), "use um banco local");
const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const month = day.slice(0, 7);
const d = (n) => `${month}-${String(n).padStart(2, "0")}`;
const ymd = (n) => d(n).replaceAll("-", "");
const out = new URL("../../../test-screenshots/", import.meta.url);
await mkdir(out, { recursive: true });

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
await client.query("DELETE FROM bank_transactions WHERE bank = 'Banco Teste'");
await client.query("DELETE FROM bank_rules WHERE pattern LIKE 'nome:MOTOBOY TESTE%'");
await client.query("DELETE FROM erp_finance WHERE source_key LIKE 'bank:%' OR source_key = 'fin-extrato:folha'");
const { rows: [staff] } = await client.query(
  `INSERT INTO staff_users (name, username, password_hash, role, active)
   VALUES ('Teste Financeiro', 'fin-visual@example.test', 'x', 'admin', true)
   ON CONFLICT (username) DO UPDATE SET role = 'admin', active = true RETURNING id`,
);
// Conta em aberto do ERP que o extrato deve baixar (mesmo valor, data próxima).
const { rows: [folha] } = await client.query(
  `INSERT INTO erp_finance (brand, kind, category, description, amount_cents, due_date, competence, source_key)
   VALUES ('barbacue', 'payable', 'payroll', 'Folha teste', 345600, $1::date, $2, 'fin-extrato:folha') RETURNING id`,
  [d(5), month],
);

const ofx = `OFXHEADER:100
DATA:OFXSGML
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>BRL
<BANKACCTFROM><BANKID>336<ACCTID>99887766<ACCTTYPE>CHECKING</BANKACCTFROM>
<BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>${ymd(2)}<TRNAMT>-2850.40<FITID>T1<MEMO>PIX ENVIADO SEGALAS ALIMENTOS LTDA</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>${ymd(3)}<TRNAMT>-612.33<FITID>T2<MEMO>PAGAMENTO DAS SIMPLES NACIONAL</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>${ymd(4)}<TRNAMT>-3456.00<FITID>T3<MEMO>PIX ENVIADO FOLHA FUNCIONARIOS</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>${ymd(4)}<TRNAMT>4100.00<FITID>T4<NAME>IFOOD.COM AGENCIA DE RESTAURANTES</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>${ymd(5)}<TRNAMT>980.00<FITID>T5<MEMO>REDECARD VENDAS CREDITO</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>${ymd(5)}<TRNAMT>-120.00<FITID>T6<MEMO>PIX ENVIADO MOTOBOY TESTE A</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>${ymd(6)}<TRNAMT>-130.00<FITID>T7<MEMO>PIX ENVIADO MOTOBOY TESTE A</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>${ymd(6)}<TRNAMT>-45.90<FITID>T8<MEMO>TARIFA PACOTE SERVICOS</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
const file = join(tmpdir(), `extrato-teste-${Date.now()}.ofx`);
await writeFile(file, ofx);

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
const payload = `${staff.id}|admin|${Date.now() + 600000}|full`;
await context.addCookies([
  { name: "barbacue_admin", value: `${payload}.${createHmac("sha256", process.env.ADMIN_COOKIE_SECRET).update(payload).digest("base64url")}`, url: base },
]);
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto(`${base}/admin/financeiro`);
  await page.getByRole("tab", { name: "Extratos bancários" }).click();
  await page.getByLabel("Banco").fill("Banco Teste");
  await page.getByLabel("Arquivo OFX").setInputFiles(file);
  await page.getByRole("button", { name: "Importar extrato" }).click();
  const status = page.getByRole("status");
  await status.waitFor();
  // T1 compra, T2 imposto, T3 folha (concilia), T4 iFood, T8 tarifa = 5 lançados; T5 ignorado; T6/T7 revisar.
  assert.match(await status.innerText(), /8 lançamento\(s\) novos de 8 .*5 lançados, 1 ignorados, 2 para revisar/);

  const { rows: [f] } = await client.query("SELECT status, settled_date::text FROM erp_finance WHERE id = $1", [folha.id]);
  assert.deepEqual([f.status, f.settled_date], ["settled", d(4)], "folha em aberto foi baixada pelo extrato, sem duplicar");
  const { rows: [{ n }] } = await client.query("SELECT count(*)::int n FROM erp_finance WHERE source_key LIKE 'bank:%' AND category = 'payroll'");
  assert.equal(n, 0);

  await page.screenshot({ path: new URL(`financeiro-extratos-revisar-${day}.png`, out).pathname, fullPage: true });
  // Classifica um Pix do motoboy lembrando o favorecido: o outro também é lançado.
  await page.getByRole("combobox", { name: /Categoria de PIX ENVIADO MOTOBOY TESTE A/ }).first().selectOption("delivery");
  await page.getByText(/a regra valeu para mais 1 lançamento/).waitFor();
  const { rows: [{ m }] } = await client.query("SELECT count(*)::int m FROM bank_transactions WHERE bank = 'Banco Teste' AND status = 'pending'");
  assert.equal(m, 0);

  // Reimportar o mesmo arquivo não duplica.
  await page.getByLabel("Banco").fill("Banco Teste");
  await page.getByLabel("Arquivo OFX").setInputFiles(file);
  await page.getByRole("button", { name: "Importar extrato" }).click();
  await page.getByText(/0 lançamento\(s\) novos de 8 \(8 já importados\)/).waitFor();

  await page.getByRole("tab", { name: "Lançados" }).click();
  await page.locator("[data-bank-row]").first().waitFor();
  await page.screenshot({ path: new URL(`financeiro-extratos-lancados-${day}.png`, out).pathname, fullPage: true });

  // O DRE do mês passa a ter imposto, CMV e entregas vindos do extrato.
  await page.getByRole("tab", { name: "DRE" }).click();
  await page.getByRole("button", { name: "Este mês" }).click();
  const total = async (id) => page.locator(`tr[data-row="${id}"] td`).last().innerText();
  assert.match(await total("var_entregas"), /-?250,00|−250,00/);
  assert.notEqual(await total("cmv"), "0,00");
  assert.deepEqual(errors, []);
  console.log("financeiro-extratos.visual: ok");
} finally {
  await browser.close();
  await client.end();
}
