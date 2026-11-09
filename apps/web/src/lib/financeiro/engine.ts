// Motor puro do DRE (competência) e do DFC (caixa, método direto) do Barbacue.
// Sem banco e sem Next: recebe fatos já agregados e devolve as linhas do
// demonstrativo por coluna. As regras e premissas estão em docs/FINANCEIRO-DRE-DFC.md.

export const BRANDS = ["barbacue", "chelas", "barbadog"] as const;
export type Brand = (typeof BRANDS)[number];
export const BRAND_LABELS: Record<Brand, string> = {
  barbacue: "Barbacue",
  chelas: "Chelas",
  barbadog: "Barbadog",
};

/** Vendas agregadas por dia, loja, canal e forma de pagamento (centavos). */
export interface SaleFact {
  date: string; // YYYY-MM-DD no fuso de São Paulo
  brand: Brand;
  channel: "ifood" | "own";
  /** online = pago pelo app do iFood; os demais são recebidos pela casa. */
  payment: "online" | "pix" | "cash" | "card";
  orders: number;
  itemsCents: number; // soma dos itens (subtotal)
  discountCents: number;
  deliveryFeeCents: number;
  totalCents: number;
}

/** Lançamento do ERP (erp_finance), sem os cancelados. */
export interface EntryFact {
  id: number;
  brand: Brand;
  kind: "payable" | "receivable";
  category: string;
  description: string;
  amountCents: number;
  competence: string | null; // YYYY-MM
  dueDate: string; // YYYY-MM-DD
  settledDate: string | null;
  status: "open" | "settled";
}

export interface Assumptions {
  /** Comissão + taxa de pagamento do iFood, em pontos-base (1520 = 15,2%). */
  ifoodFeeBps: number;
}
// Plano Básico do iFood (entrega própria, como mostram os fechamentos com motoboy
// da casa): 12% de comissão + 3,2% de pagamento online. Só vale enquanto não houver
// lançamento real da categoria "marketplace" no mês e na loja.
export const DEFAULT_ASSUMPTIONS: Assumptions = { ifoodFeeBps: 1520 };

export interface Column {
  key: string;
  label: string;
  brands: Brand[];
  from: string; // YYYY-MM-DD inclusive
  to: string; // YYYY-MM-DD inclusive
}

export type RowType = "group" | "line" | "total" | "percent" | "info";
export interface Row {
  id: string;
  label: string;
  level: number;
  type: RowType;
  parent?: string;
  values: number[]; // centavos; em "percent", pontos-base
  /** Linha alimentada por estimativa (sem lançamento real). */
  estimated?: boolean[];
  hint?: string;
}
export interface Statement {
  columns: Column[];
  rows: Row[];
}

// ─── Plano de contas ─────────────────────────────────────────────────────────

/** Categorias aceitas no lançamento financeiro do ERP, com o rótulo de tela. */
export const CATEGORY_LABELS: Record<string, string> = {
  purchase: "Compra de insumos (CMV)",
  packaging: "Embalagens",
  delivery: "Entregas e motoboys",
  marketplace: "Comissão iFood / marketplace",
  fees: "Taxas de cartão e Pix",
  tax: "Impostos sobre vendas",
  payroll: "Folha e encargos",
  rent: "Aluguel e condomínio",
  utilities: "Energia, água, gás e internet",
  marketing: "Marketing",
  admin: "Contador, sistemas e administrativo",
  maintenance: "Manutenção",
  operating: "Outras despesas operacionais",
  financial: "Tarifas bancárias e juros",
  investment: "Investimentos (equipamentos, obras)",
  loan: "Empréstimos e financiamentos",
  withdrawal: "Retirada dos sócios",
  ifood: "Repasse iFood",
  sales: "Outras receitas de vendas",
  other: "Outros",
};

// Contas do DRE alimentadas por lançamentos a pagar (despesa).
const DRE_EXPENSE: Record<string, string> = {
  tax: "ded_impostos",
  marketplace: "ded_ifood",
  fees: "ded_cartao",
  purchase: "cmv",
  packaging: "var_embalagens",
  delivery: "var_entregas",
  payroll: "fix_pessoal",
  rent: "fix_ocupacao",
  utilities: "fix_utilidades",
  marketing: "fix_marketing",
  admin: "fix_admin",
  maintenance: "fix_manutencao",
  operating: "fix_outras",
  financial: "fin_despesas",
  other: "nop_despesas",
};
// Contas do DRE alimentadas por lançamentos a receber (receita).
const DRE_INCOME: Record<string, string> = {
  sales: "rb_outras",
  operating: "rb_outras",
  financial: "fin_receitas",
  other: "nop_receitas",
};
// investment, loan, withdrawal e ifood (repasse) não são resultado: só entram no DFC.

interface Def {
  id: string;
  label: string;
  type: RowType;
  parent?: string;
  hint?: string;
}
const DRE_DEFS: Def[] = [
  { id: "receita_bruta", label: "RECEITA BRUTA", type: "group" },
  { id: "rb_propria", label: "Vendas próprias (site, WhatsApp, salão, totem)", type: "line", parent: "receita_bruta" },
  { id: "rb_ifood", label: "Vendas iFood", type: "line", parent: "receita_bruta" },
  { id: "rb_entrega", label: "Taxas de entrega cobradas", type: "line", parent: "receita_bruta" },
  { id: "rb_outras", label: "Outras receitas de vendas", type: "line", parent: "receita_bruta" },
  { id: "deducoes", label: "(-) DEDUÇÕES", type: "group" },
  { id: "ded_descontos", label: "Descontos e cupons", type: "line", parent: "deducoes" },
  { id: "ded_impostos", label: "Impostos sobre vendas (Simples)", type: "line", parent: "deducoes" },
  { id: "ded_ifood", label: "Comissão e taxas iFood", type: "line", parent: "deducoes", hint: "Sem lançamento de marketplace no mês, usa a taxa estimada." },
  { id: "ded_cartao", label: "Taxas de cartão e Pix", type: "line", parent: "deducoes" },
  { id: "receita_liquida", label: "RECEITA LÍQUIDA", type: "total" },
  { id: "cmv", label: "(-) CMV (insumos)", type: "group" },
  { id: "lucro_bruto", label: "LUCRO BRUTO", type: "total" },
  { id: "margem_bruta", label: "% Margem bruta", type: "percent" },
  { id: "variaveis", label: "(-) DESPESAS VARIÁVEIS", type: "group" },
  { id: "var_embalagens", label: "Embalagens", type: "line", parent: "variaveis" },
  { id: "var_entregas", label: "Entregas e motoboys", type: "line", parent: "variaveis" },
  { id: "margem_contribuicao", label: "MARGEM DE CONTRIBUIÇÃO", type: "total" },
  { id: "margem_contribuicao_pct", label: "% Margem de contribuição", type: "percent" },
  { id: "fixas", label: "(-) DESPESAS FIXAS", type: "group" },
  { id: "fix_pessoal", label: "Folha e encargos", type: "line", parent: "fixas" },
  { id: "fix_ocupacao", label: "Aluguel e condomínio", type: "line", parent: "fixas" },
  { id: "fix_utilidades", label: "Energia, água, gás e internet", type: "line", parent: "fixas" },
  { id: "fix_marketing", label: "Marketing", type: "line", parent: "fixas" },
  { id: "fix_admin", label: "Contador, sistemas e administrativo", type: "line", parent: "fixas" },
  { id: "fix_manutencao", label: "Manutenção", type: "line", parent: "fixas" },
  { id: "fix_outras", label: "Outras despesas operacionais", type: "line", parent: "fixas" },
  { id: "ebitda", label: "RESULTADO OPERACIONAL (EBITDA)", type: "total" },
  { id: "financeiro", label: "RESULTADO FINANCEIRO", type: "group" },
  { id: "fin_receitas", label: "Receitas financeiras", type: "line", parent: "financeiro" },
  { id: "fin_despesas", label: "Tarifas bancárias e juros", type: "line", parent: "financeiro" },
  { id: "nao_operacional", label: "OUTRAS RECEITAS E DESPESAS", type: "group" },
  { id: "nop_receitas", label: "Outras receitas", type: "line", parent: "nao_operacional" },
  { id: "nop_despesas", label: "Outras despesas", type: "line", parent: "nao_operacional" },
  { id: "resultado_liquido", label: "RESULTADO LÍQUIDO", type: "total" },
  { id: "margem_liquida", label: "% Margem líquida", type: "percent" },
  { id: "pedidos", label: "Pedidos", type: "info" },
  { id: "ticket_medio", label: "Ticket médio", type: "info" },
  { id: "ponto_equilibrio", label: "Ponto de equilíbrio (receita bruta)", type: "info", hint: "Despesas fixas ÷ % de margem de contribuição sobre a receita bruta." },
];

const DFC_DEFS: Def[] = [
  { id: "saldo_inicial", label: "SALDO INICIAL", type: "total", hint: "Soma de tudo o que entrou e saiu antes do período, só com o que está registrado no sistema." },
  { id: "entradas", label: "1 - ENTRADAS OPERACIONAIS", type: "group" },
  { id: "ent_pix", label: "Vendas recebidas em Pix", type: "line", parent: "entradas" },
  { id: "ent_dinheiro", label: "Vendas recebidas em dinheiro", type: "line", parent: "entradas" },
  { id: "ent_cartao", label: "Vendas recebidas em cartão", type: "line", parent: "entradas" },
  { id: "ent_ifood", label: "Repasses iFood", type: "line", parent: "entradas", hint: "Sem repasse lançado, estima pedidos online da semana (seg–dom) menos a taxa, pagos na quarta seguinte." },
  { id: "ent_outras", label: "Outros recebimentos", type: "line", parent: "entradas" },
  { id: "saidas", label: "2 - SAÍDAS OPERACIONAIS", type: "group" },
  { id: "sai_fornecedores", label: "Fornecedores (insumos e embalagens)", type: "line", parent: "saidas" },
  { id: "sai_pessoal", label: "Folha e encargos", type: "line", parent: "saidas" },
  { id: "sai_impostos", label: "Impostos", type: "line", parent: "saidas" },
  { id: "sai_ocupacao", label: "Aluguel, contas e manutenção", type: "line", parent: "saidas" },
  { id: "sai_vendas", label: "Entregas, taxas e marketing", type: "line", parent: "saidas" },
  { id: "sai_admin", label: "Administrativo e outras", type: "line", parent: "saidas" },
  { id: "caixa_operacional", label: "CAIXA GERADO NA OPERAÇÃO", type: "total" },
  { id: "investimento", label: "3 - INVESTIMENTOS", type: "group" },
  { id: "inv_saidas", label: "Equipamentos, obras e reformas", type: "line", parent: "investimento" },
  { id: "financiamento", label: "4 - FINANCIAMENTOS E SÓCIOS", type: "group" },
  { id: "fin_captacao", label: "Empréstimos recebidos", type: "line", parent: "financiamento" },
  { id: "fin_amortizacao", label: "Pagamento de empréstimos", type: "line", parent: "financiamento" },
  { id: "fin_tarifas", label: "Tarifas bancárias e juros", type: "line", parent: "financiamento" },
  { id: "fin_retiradas", label: "Retirada dos sócios", type: "line", parent: "financiamento" },
  { id: "variacao", label: "VARIAÇÃO DO CAIXA", type: "total" },
  { id: "saldo_final", label: "SALDO FINAL", type: "total" },
  { id: "previsto_receber", label: "A receber em aberto no período", type: "info" },
  { id: "previsto_pagar", label: "A pagar em aberto no período", type: "info" },
  { id: "saldo_projetado", label: "Saldo final projetado", type: "info" },
];

const DFC_PAYABLE: Record<string, string> = {
  purchase: "sai_fornecedores",
  packaging: "sai_fornecedores",
  payroll: "sai_pessoal",
  tax: "sai_impostos",
  rent: "sai_ocupacao",
  utilities: "sai_ocupacao",
  maintenance: "sai_ocupacao",
  delivery: "sai_vendas",
  fees: "sai_vendas",
  marketplace: "sai_vendas",
  marketing: "sai_vendas",
  admin: "sai_admin",
  operating: "sai_admin",
  other: "sai_admin",
  investment: "inv_saidas",
  loan: "fin_amortizacao",
  financial: "fin_tarifas",
  withdrawal: "fin_retiradas",
};
const DFC_RECEIVABLE: Record<string, string> = {
  ifood: "ent_ifood",
  loan: "fin_captacao",
  financial: "fin_tarifas",
};

// ─── Utilitários de data ─────────────────────────────────────────────────────

const inRange = (d: string, c: { from: string; to: string }) => d >= c.from && d <= c.to;
/** Mês de competência do lançamento: o informado ou o do vencimento. */
export const entryMonth = (e: EntryFact) => e.competence ?? e.dueDate.slice(0, 7);
const monthInRange = (m: string, c: { from: string; to: string }) =>
  m >= c.from.slice(0, 7) && m <= c.to.slice(0, 7);

function addDays(date: string, days: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
/** Quarta-feira seguinte ao domingo que fecha a semana do pedido. */
export function ifoodPayoutDate(orderDate: string) {
  const dow = new Date(`${orderDate}T12:00:00Z`).getUTCDay(); // 0 = domingo
  const toSunday = (7 - dow) % 7;
  return addDays(orderDate, toSunday + 3);
}
export function monthEnd(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}
/** Lista de meses YYYY-MM de `from` a `to`, inclusive. */
export function monthsBetween(from: string, to: string) {
  const out: string[] = [];
  let [y, m] = from.slice(0, 7).split("-").map(Number);
  const [ty, tm] = to.slice(0, 7).split("-").map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    if (++m > 12) { m = 1; y++; }
    if (out.length > 120) break;
  }
  return out;
}

// ─── Cálculo ─────────────────────────────────────────────────────────────────

type Acc = Map<string, number>;
const add = (acc: Acc, id: string, v: number) => acc.set(id, (acc.get(id) ?? 0) + v);
const get = (acc: Acc, id: string) => acc.get(id) ?? 0;
const pct = (num: number, den: number) => (den ? Math.round((num / den) * 10000) : 0);

function sumChildren(acc: Acc, defs: Def[]) {
  for (const g of defs.filter((d) => d.type === "group")) {
    const kids = defs.filter((d) => d.parent === g.id);
    if (kids.length) acc.set(g.id, kids.reduce((s, k) => s + get(acc, k.id), 0));
  }
}

/** Valores de uma coluna do DRE. Despesas/deduções saem negativas. */
export function dreColumn(sales: SaleFact[], entries: EntryFact[], col: Column, a: Assumptions = DEFAULT_ASSUMPTIONS) {
  const acc: Acc = new Map();
  const estimated = new Set<string>();
  const brands = new Set(col.brands);
  const ifoodByBrandMonth = new Map<string, number>();
  let orders = 0;
  for (const s of sales) {
    if (!brands.has(s.brand) || !inRange(s.date, col)) continue;
    orders += s.orders;
    add(acc, s.channel === "ifood" ? "rb_ifood" : "rb_propria", s.itemsCents);
    add(acc, "rb_entrega", s.deliveryFeeCents);
    add(acc, "ded_descontos", -s.discountCents);
    if (s.channel === "ifood") {
      const k = `${s.brand}|${s.date.slice(0, 7)}`;
      ifoodByBrandMonth.set(k, (ifoodByBrandMonth.get(k) ?? 0) + s.totalCents);
    }
  }
  const realMarketplace = new Set<string>();
  for (const e of entries) {
    if (!brands.has(e.brand)) continue;
    const m = entryMonth(e);
    if (!monthInRange(m, col)) continue;
    if (e.kind === "payable") {
      const id = DRE_EXPENSE[e.category];
      if (!id) continue;
      add(acc, id, -e.amountCents);
      if (e.category === "marketplace") realMarketplace.add(`${e.brand}|${m}`);
    } else {
      const id = DRE_INCOME[e.category];
      if (id) add(acc, id, e.amountCents);
    }
  }
  for (const [k, total] of ifoodByBrandMonth) {
    if (realMarketplace.has(k)) continue;
    add(acc, "ded_ifood", -Math.round((total * a.ifoodFeeBps) / 10000));
    estimated.add("ded_ifood");
  }
  sumChildren(acc, DRE_DEFS);
  const rb = get(acc, "receita_bruta");
  acc.set("receita_liquida", rb + get(acc, "deducoes"));
  acc.set("lucro_bruto", get(acc, "receita_liquida") + get(acc, "cmv"));
  acc.set("margem_bruta", pct(get(acc, "lucro_bruto"), rb));
  acc.set("margem_contribuicao", get(acc, "lucro_bruto") + get(acc, "variaveis"));
  acc.set("margem_contribuicao_pct", pct(get(acc, "margem_contribuicao"), rb));
  acc.set("ebitda", get(acc, "margem_contribuicao") + get(acc, "fixas"));
  acc.set("resultado_liquido", get(acc, "ebitda") + get(acc, "financeiro") + get(acc, "nao_operacional"));
  acc.set("margem_liquida", pct(get(acc, "resultado_liquido"), rb));
  acc.set("pedidos", orders);
  acc.set("ticket_medio", orders ? Math.round(rb / orders) : 0);
  const mcRatio = rb ? get(acc, "margem_contribuicao") / rb : 0;
  acc.set("ponto_equilibrio", mcRatio > 0 ? Math.round(-get(acc, "fixas") / mcRatio) : 0);
  return { acc, estimated };
}

/** Movimento de caixa até `to` (inclusive) a partir de `from` (inclusive). */
function cashFlow(sales: SaleFact[], entries: EntryFact[], brands: Set<Brand>, from: string, to: string, a: Assumptions) {
  const acc: Acc = new Map();
  const estimated = new Set<string>();
  const range = { from, to };
  // Repasse real lançado (categoria ifood a receber, baixado) substitui a estimativa
  // na semana de pagamento daquela loja.
  const realPayouts = new Set<string>();
  for (const e of entries)
    if (e.kind === "receivable" && e.category === "ifood" && e.settledDate) realPayouts.add(`${e.brand}|${e.settledDate.slice(0, 7)}`);
  for (const s of sales) {
    if (!brands.has(s.brand)) continue;
    if (s.channel === "ifood" && s.payment === "online") {
      const pay = ifoodPayoutDate(s.date);
      if (!inRange(pay, range) || realPayouts.has(`${s.brand}|${pay.slice(0, 7)}`)) continue;
      // A taxa incide sobre todos os pedidos iFood; os pagos na entrega também
      // descontam do repasse.
      add(acc, "ent_ifood", s.totalCents - Math.round((s.totalCents * a.ifoodFeeBps) / 10000));
      estimated.add("ent_ifood");
      continue;
    }
    if (!inRange(s.date, range)) continue;
    if (s.channel === "ifood") {
      const pay = ifoodPayoutDate(s.date);
      if (inRange(pay, range) && !realPayouts.has(`${s.brand}|${pay.slice(0, 7)}`)) {
        add(acc, "ent_ifood", -Math.round((s.totalCents * a.ifoodFeeBps) / 10000));
        estimated.add("ent_ifood");
      }
    }
    const id = s.payment === "pix" ? "ent_pix" : s.payment === "cash" ? "ent_dinheiro" : "ent_cartao";
    add(acc, id, s.totalCents);
  }
  for (const e of entries) {
    if (!brands.has(e.brand) || e.status !== "settled" || !e.settledDate || !inRange(e.settledDate, range)) continue;
    if (e.kind === "payable") add(acc, DFC_PAYABLE[e.category] ?? "sai_admin", -e.amountCents);
    else add(acc, DFC_RECEIVABLE[e.category] ?? "ent_outras", e.amountCents);
  }
  sumChildren(acc, DFC_DEFS);
  acc.set("caixa_operacional", get(acc, "entradas") + get(acc, "saidas"));
  acc.set("variacao", get(acc, "caixa_operacional") + get(acc, "investimento") + get(acc, "financiamento"));
  return { acc, estimated };
}

export function dfcColumn(sales: SaleFact[], entries: EntryFact[], col: Column, a: Assumptions = DEFAULT_ASSUMPTIONS) {
  const brands = new Set(col.brands);
  const before = cashFlow(sales, entries, brands, "0000-01-01", addDays(col.from, -1), a);
  const { acc, estimated } = cashFlow(sales, entries, brands, col.from, col.to, a);
  acc.set("saldo_inicial", get(before.acc, "variacao"));
  acc.set("saldo_final", get(acc, "saldo_inicial") + get(acc, "variacao"));
  let receber = 0, pagar = 0;
  for (const e of entries) {
    if (!brands.has(e.brand) || e.status !== "open" || !inRange(e.dueDate, col)) continue;
    if (e.kind === "receivable") receber += e.amountCents;
    else pagar -= e.amountCents;
  }
  acc.set("previsto_receber", receber);
  acc.set("previsto_pagar", pagar);
  acc.set("saldo_projetado", get(acc, "saldo_final") + receber + pagar);
  return { acc, estimated };
}

function build(defs: Def[], columns: Column[], compute: (c: Column) => { acc: Acc; estimated: Set<string> }): Statement {
  const results = columns.map(compute);
  return {
    columns,
    rows: defs.map((d) => {
      const est = results.map((r) => r.estimated.has(d.id) || defs.some((k) => k.parent === d.id && r.estimated.has(k.id)));
      return {
        id: d.id,
        label: d.label,
        level: d.parent ? 1 : 0,
        type: d.type,
        parent: d.parent,
        hint: d.hint,
        values: results.map((r) => get(r.acc, d.id)),
        ...(est.some(Boolean) ? { estimated: est } : {}),
      };
    }),
  };
}

export const buildDre = (sales: SaleFact[], entries: EntryFact[], columns: Column[], a: Assumptions = DEFAULT_ASSUMPTIONS) =>
  build(DRE_DEFS, columns, (c) => dreColumn(sales, entries, c, a));
export const buildDfc = (sales: SaleFact[], entries: EntryFact[], columns: Column[], a: Assumptions = DEFAULT_ASSUMPTIONS) =>
  build(DFC_DEFS, columns, (c) => dfcColumn(sales, entries, c, a));

/** Colunas por loja + consolidado, num mesmo período. */
export function brandColumns(from: string, to: string, brands: readonly Brand[] = BRANDS): Column[] {
  return [
    ...brands.map((b) => ({ key: b, label: BRAND_LABELS[b], brands: [b], from, to })),
    { key: "total", label: "Consolidado", brands: [...brands], from, to },
  ];
}
const MONTH_NAMES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
export const monthLabel = (m: string) => `${MONTH_NAMES[Number(m.slice(5, 7)) - 1]}/${m.slice(2, 4)}`;
/** Uma coluna por mês + total do período, para as lojas escolhidas. */
export function monthColumns(from: string, to: string, brands: Brand[]): Column[] {
  const months = monthsBetween(from, to);
  return [
    ...months.map((m) => ({
      key: m,
      label: monthLabel(m),
      brands,
      from: m === from.slice(0, 7) ? from : `${m}-01`,
      to: m === to.slice(0, 7) ? to : monthEnd(m),
    })),
    { key: "total", label: "Total", brands, from, to },
  ];
}

/** Lançamentos que compõem uma linha do DRE ou do DFC numa coluna (drill-down). */
export function lineEntries(view: "dre" | "dfc", lineId: string, entries: EntryFact[], col: Column) {
  const brands = new Set(col.brands);
  return entries.filter((e) => {
    if (!brands.has(e.brand)) return false;
    if (view === "dre") {
      if (!monthInRange(entryMonth(e), col)) return false;
      const map = e.kind === "payable" ? DRE_EXPENSE : DRE_INCOME;
      return map[e.category] === lineId || (DRE_DEFS.find((d) => d.id === map[e.category])?.parent === lineId);
    }
    if (e.status !== "settled" || !e.settledDate || !inRange(e.settledDate, col)) return false;
    const id = e.kind === "payable" ? DFC_PAYABLE[e.category] ?? "sai_admin" : DFC_RECEIVABLE[e.category] ?? "ent_outras";
    return id === lineId || DFC_DEFS.find((d) => d.id === id)?.parent === lineId;
  });
}
