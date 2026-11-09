import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildDre,
  buildDfc,
  brandColumns,
  monthColumns,
  ifoodPayoutDate,
  lineEntries,
  type SaleFact,
  type EntryFact,
} from "../src/lib/financeiro/engine.ts";

const sale = (p: Partial<SaleFact>): SaleFact => ({
  date: "2026-10-10",
  brand: "barbacue",
  channel: "own",
  payment: "pix",
  orders: 1,
  itemsCents: 10000,
  discountCents: 0,
  deliveryFeeCents: 0,
  totalCents: 10000,
  ...p,
});
let nextId = 1;
const entry = (p: Partial<EntryFact>): EntryFact => ({
  id: nextId++,
  brand: "barbacue",
  kind: "payable",
  category: "purchase",
  description: "x",
  amountCents: 1000,
  competence: null,
  dueDate: "2026-10-15",
  settledDate: null,
  status: "open",
  ...p,
});
const value = (s: ReturnType<typeof buildDre>, id: string, col = 0) => s.rows.find((r) => r.id === id)!.values[col];

test("DRE soma receitas por canal, deduz descontos e estima a taxa do iFood", () => {
  const sales = [
    sale({ itemsCents: 10000, discountCents: 1000, deliveryFeeCents: 800, totalCents: 9800 }),
    sale({ channel: "ifood", payment: "online", itemsCents: 20000, totalCents: 20000 }),
  ];
  const s = buildDre(sales, [], brandColumns("2026-10-01", "2026-10-31"));
  // colunas: barbacue, chelas, barbadog, consolidado
  assert.equal(value(s, "rb_propria"), 10000);
  assert.equal(value(s, "rb_ifood"), 20000);
  assert.equal(value(s, "receita_bruta"), 30800);
  assert.equal(value(s, "ded_descontos"), -1000);
  assert.equal(value(s, "ded_ifood"), -3040); // 15,2% de 200,00
  assert.equal(value(s, "receita_liquida"), 30800 - 1000 - 3040);
  assert.equal(value(s, "receita_bruta", 1), 0); // Chelas sem venda
  assert.equal(value(s, "receita_bruta", 3), 30800); // consolidado
  assert.equal(value(s, "pedidos"), 2);
  assert.ok(s.rows.find((r) => r.id === "ded_ifood")!.estimated![0]);
});

test("lançamento real de marketplace substitui a estimativa do iFood no mês", () => {
  const sales = [sale({ channel: "ifood", payment: "online", itemsCents: 20000, totalCents: 20000 })];
  const entries = [entry({ category: "marketplace", amountCents: 2500, competence: "2026-10" })];
  const s = buildDre(sales, entries, brandColumns("2026-10-01", "2026-10-31"));
  assert.equal(value(s, "ded_ifood"), -2500);
  assert.equal(s.rows.find((r) => r.id === "ded_ifood")!.estimated, undefined);
});

test("DRE classifica despesas e calcula margens, EBITDA e ponto de equilíbrio", () => {
  const sales = [sale({ itemsCents: 100000, totalCents: 100000 })];
  const entries = [
    entry({ category: "purchase", amountCents: 30000 }),
    entry({ category: "packaging", amountCents: 5000 }),
    entry({ category: "payroll", amountCents: 20000 }),
    entry({ category: "rent", amountCents: 10000 }),
    entry({ category: "financial", amountCents: 1000 }),
    entry({ category: "investment", amountCents: 50000 }), // não é resultado
    entry({ category: "tax", amountCents: 6000, competence: "2026-10" }),
  ];
  const s = buildDre(sales, entries, brandColumns("2026-10-01", "2026-10-31"));
  assert.equal(value(s, "receita_liquida"), 94000);
  assert.equal(value(s, "lucro_bruto"), 64000);
  assert.equal(value(s, "margem_bruta"), 6400); // 64,00%
  assert.equal(value(s, "margem_contribuicao"), 59000);
  assert.equal(value(s, "ebitda"), 29000);
  assert.equal(value(s, "resultado_liquido"), 28000);
  // fixas 30.000 / (59.000/100.000) = 50.847,46
  assert.equal(value(s, "ponto_equilibrio"), 50847);
});

test("competência informada manda; sem ela vale o mês do vencimento", () => {
  const entries = [
    entry({ category: "rent", amountCents: 1000, competence: "2026-09", dueDate: "2026-10-05" }),
    entry({ category: "rent", amountCents: 2000, dueDate: "2026-10-05" }),
  ];
  const cols = monthColumns("2026-09-01", "2026-10-31", ["barbacue"]);
  const s = buildDre([], entries, cols);
  assert.deepEqual(s.columns.map((c) => c.label), ["set/26", "out/26", "Total"]);
  assert.equal(value(s, "fix_ocupacao", 0), -1000);
  assert.equal(value(s, "fix_ocupacao", 1), -2000);
  assert.equal(value(s, "fix_ocupacao", 2), -3000);
});

test("repasse iFood estimado cai na quarta-feira após o domingo da semana", () => {
  assert.equal(ifoodPayoutDate("2026-10-05"), "2026-10-14"); // segunda → quarta seguinte à semana
  assert.equal(ifoodPayoutDate("2026-10-11"), "2026-10-14"); // domingo
  assert.equal(ifoodPayoutDate("2026-10-12"), "2026-10-21");
});

test("DFC: caixa por forma de pagamento, repasse líquido, saldo inicial e projeção", () => {
  const sales = [
    sale({ date: "2026-09-20", payment: "cash", totalCents: 5000, itemsCents: 5000 }),
    sale({ date: "2026-10-05", payment: "pix", totalCents: 10000 }),
    sale({ date: "2026-10-06", channel: "ifood", payment: "online", totalCents: 20000, itemsCents: 20000 }),
    sale({ date: "2026-10-07", channel: "ifood", payment: "cash", totalCents: 4000, itemsCents: 4000 }),
  ];
  const entries = [
    entry({ category: "purchase", amountCents: 3000, status: "settled", settledDate: "2026-10-08" }),
    entry({ category: "withdrawal", amountCents: 1000, status: "settled", settledDate: "2026-10-09" }),
    entry({ category: "rent", amountCents: 7000, status: "open", dueDate: "2026-10-30" }),
    entry({ kind: "receivable", category: "sales", amountCents: 1500, status: "open", dueDate: "2026-10-20" }),
  ];
  const s = buildDfc(sales, entries, brandColumns("2026-10-01", "2026-10-31", ["barbacue"]));
  assert.equal(value(s, "saldo_inicial"), 5000);
  assert.equal(value(s, "ent_pix"), 10000);
  assert.equal(value(s, "ent_dinheiro"), 4000); // pago na entrega do iFood fica com a casa
  // repasse em 14/10: 20.000 - 15,2% de 20.000 - 15,2% de 4.000 = 16.352
  assert.equal(value(s, "ent_ifood"), 20000 - 3040 - 608);
  assert.equal(value(s, "sai_fornecedores"), -3000);
  assert.equal(value(s, "fin_retiradas"), -1000);
  const variacao = 10000 + 4000 + 16352 - 3000 - 1000;
  assert.equal(value(s, "variacao"), variacao);
  assert.equal(value(s, "saldo_final"), 5000 + variacao);
  assert.equal(value(s, "saldo_projetado"), 5000 + variacao + 1500 - 7000);
});

test("drill-down devolve os lançamentos de uma linha e do seu grupo", () => {
  const entries = [
    entry({ category: "rent", amountCents: 1000 }),
    entry({ category: "utilities", amountCents: 500 }),
    entry({ category: "purchase", amountCents: 900 }),
  ];
  const [col] = brandColumns("2026-10-01", "2026-10-31", ["barbacue"]);
  assert.equal(lineEntries("dre", "fix_ocupacao", entries, col).length, 1);
  assert.equal(lineEntries("dre", "fixas", entries, col).length, 2);
});
