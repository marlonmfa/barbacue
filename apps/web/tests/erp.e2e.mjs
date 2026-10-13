import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
const base = process.env.ERP_TEST_URL;
assert(base && ["localhost", "127.0.0.1"].includes(new URL(base).hostname));
const output = new URL("../../../tmp/erp-deploy-20260920/", import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  }),
  page = await context.newPage();
const payload = `0|admin|${Date.now() + 600000}`;
await context.addCookies([
  {
    name: "barbacue_admin",
    value: `${payload}.${createHmac("sha256", process.env.ADMIN_COOKIE_SECRET).update(payload).digest("base64url")}`,
    url: base,
  },
]);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("dialog", (d) => d.accept());
const prefix = `UI ${Date.now()}`;
let checks = 0;
const tab = async (name) => {
  await page.getByRole("tab", { name, exact: true }).click();
};
const form = () => page.locator("form");
const field = (name) =>
  form()
    .getByLabel(name, { exact: true })
    .or(form().getByRole("combobox", { name, exact: true }));
async function save(button = "Salvar") {
  const response = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/admin/erp") && r.request().method() === "POST",
  );
  await form().getByRole("button", { name: button, exact: true }).click();
  const r = await response;
  assert.equal(r.status(), 200, await r.text());
  checks++;
  await page.getByRole("status").waitFor();
  await page.locator("form").waitFor({ state: "detached" });
}
const search = async (text) => {
  await page.getByRole("textbox", { name: "Buscar registros" }).fill(text);
};
try {
  await page.goto(base + "/admin/erp");
  await page.getByRole("button", { name: "Exportar financeiro CSV" }).waitFor();
  await tab("Fornecedores");
  await page.getByRole("button", { name: "Cadastrar fornecedor" }).click();
  await field("Nome do fornecedor").fill(prefix + " fornecedor");
  await field("CPF/CNPJ").fill("123");
  await save();
  await search(prefix);
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  await field("Telefone / e-mail").fill("contact@example.test");
  await save();
  await tab("Estoque");
  await page.getByRole("button", { name: "Cadastrar insumo" }).click();
  await field("Nome do insumo").fill(prefix + " insumo");
  await field("Estoque mínimo").fill("1");
  await field("Custo por kg, litro ou unidade (R$)").fill("10");
  await save();
  await page.getByRole("button", { name: "Entrada, perda ou ajuste" }).click();
  await field("Insumo").selectOption({ label: prefix + " insumo (kg)" });
  await field("Quantidade (+ entrada / − perda ou saída)").fill("10");
  await field("Motivo do ajuste").fill("Saldo inicial teste");
  await save();
  await tab("Compras");
  await page.getByRole("button", { name: "Nova compra", exact: true }).click();
  await field("Fornecedor").selectOption({ label: prefix + " fornecedor" });
  await field("Número / referência da nota").fill(prefix);
  await form().getByRole("button", { name: "Adicionar insumo" }).click();
  await form()
    .getByRole("combobox", { name: "Insumo", exact: true })
    .selectOption({ label: prefix + " insumo (kg)" });
  await form()
    .getByRole("spinbutton", { name: "Quantidade do insumo 1" })
    .fill("2");
  await field("Custo por unidade (R$)").fill("15");
  await save();
  await search(prefix);
  await page.getByRole("button", { name: "Receber", exact: true }).click();
  await page.getByText("Recebida", { exact: true }).waitFor();
  checks++;
  await tab("Receitas");
  await page.getByRole("button", { name: "Nova receita" }).click();
  await field("Nome da receita").fill(prefix + " receita");
  await field("Preço de venda por porção (R$)").fill("30");
  await field("Modo de preparo confirmado pela cozinha").fill(
    "Preparar conforme ficha conferida",
  );
  await field("Revisão").selectOption("ready");
  await form().getByRole("button", { name: "Adicionar insumo" }).click();
  await field("Insumo").selectOption({ label: prefix + " insumo (kg)" });
  await form()
    .getByRole("spinbutton", { name: "Quantidade do insumo 1" })
    .fill(".250");
  await save();
  await search(prefix);
  await page.getByRole("button", { name: "Produzir", exact: true }).click();
  await save("Confirmar consumo de insumos");
  await tab("Impostos");
  await page.getByRole("button", { name: "Novo lançamento" }).click();
  await field("Descrição").fill(prefix + " imposto");
  await field("Valor (R$)").fill("123.45");
  await field("Guia, código de barras ou referência").fill("Guia teste 123");
  await save();
  await search(prefix);
  await page.getByRole("button", { name: "Registrar baixa" }).click();
  await field("Referência do comprovante ou link").fill("Comprovante teste");
  await save("Confirmar registro da baixa");
  await page.getByText("Baixado", { exact: true }).waitFor();
  checks++;
  await tab("Financeiro");
  await page.getByRole("button", { name: "Novo lançamento" }).click();
  await field("Descrição").fill(prefix + " receber");
  await field("Tipo").selectOption("receivable");
  await field("Valor (R$)").fill("20");
  await field("Competência").fill("");
  await save();
  await search(prefix + " receber");
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  await field("Valor (R$)").fill("25");
  await save();
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await page.getByText("Cancelado", { exact: true }).waitFor();
  checks++;
  const csvWait = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar financeiro CSV" }).click();
  const csv = await csvWait;
  await csv.saveAs(new URL("financeiro-test.csv", output).pathname);
  checks++;
  await tab("RH");
  await page.getByRole("button", { name: "Lançar folha" }).click();
  const employee = prefix + " funcionário";
  const employeeResponse = await page.request.post(base + "/api/admin/employees", { data: { name: employee, jobTitle: "Cozinheiro", brand: "barbacue", employmentType: "clt", salaryCents: 200000, weeklyHours: 44, workSchedule: {days: [1,2,3,4,5], start: "08:00", end: "17:00"} } });
  assert.equal(employeeResponse.status(), 201);
  await page.reload();
  await tab("RH");
  await page.getByRole("button", {name: "Lançar folha"}).click();
  assert(employee);
  await field("Funcionário").selectOption({ label: employee });
  await field("Competência").fill("2027-01");
  await field("Adicionais e benefícios (R$)").fill("100");
  await field("Descontos e retenções (R$)").fill("50");
  await save();
  await page.getByRole("button", { name: "Registrar ponto" }).click();
  await field("Funcionário").selectOption({ label: employee });
  await field("Entrada (horário deste dispositivo)").fill("2027-01-01T08:00");
  await field("Saída (horário deste dispositivo)").fill("2027-01-01T17:00");
  await field("Intervalo (minutos)").fill("60");
  await save();
  await page.getByRole("button", { name: "Férias ou afastamento" }).click();
  await field("Funcionário").selectOption({ label: employee });
  await field("Início").fill("2027-02-01");
  await field("Fim").fill("2027-02-10");
  await field("Situação").selectOption("approved");
  await save();
  await tab("Resumo");
  await page.screenshot({
    path: new URL("erp-desktop.png", output).pathname,
    fullPage: true,
  });
  for (const name of [
    "Resumo",
    "Financeiro",
    "Impostos",
    "Compras",
    "Estoque",
    "Receitas",
    "Fornecedores",
    "RH",
    "Histórico",
  ]) {
    await page.setViewportSize({ width: 390, height: 844 });
    await tab(name);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
      name + " mobile overflow",
    );
    checks++;
  }
  await tab("Receitas");
  await page.getByRole("button", { name: "Nova receita" }).click();
  await page.screenshot({
    path: new URL("erp-mobile.png", output).pathname,
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  checks++;
  assert.deepEqual(errors, []);
  checks++;
  console.log(
    `PASS ${checks} ERP browser checks: all nine modules, supplier edit, stock, receiving, recipe production, tax settlement, finance edit/cancel/CSV, payroll, attendance, leave and mobile forms.`,
  );
} finally {
  await browser.close();
}
