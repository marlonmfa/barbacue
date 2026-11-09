"use client";
import Link from "next/link";
import { Fragment, useMemo, useState } from "react";
import {
  BRANDS,
  BRAND_LABELS,
  CATEGORY_LABELS,
  DEFAULT_ASSUMPTIONS,
  brandColumns,
  buildDfc,
  buildDre,
  entryMonth,
  lineEntries,
  monthColumns,
  monthEnd,
  monthLabel,
  type Brand,
  type Column,
  type EntryFact,
  type Row,
  type SaleFact,
  type Statement,
} from "@/lib/financeiro/engine";
import styles from "./financeiro.module.css";

type Tab = "overview" | "dre" | "dfc";
type Mode = "brands" | "months";
const TABS: [Tab, string][] = [
  ["overview", "Visão geral"],
  ["dre", "DRE"],
  ["dfc", "Fluxo de caixa (DFC)"],
];

const money = (c: number) => (c / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const brl = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const percent = (bps: number) => `${(bps / 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
const dateBr = (d: string) => d.split("-").reverse().join("/");
const shiftMonth = (m: string, delta: number) => {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(Date.UTC(y, mo - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
};

function formatValue(row: Row, v: number) {
  if (row.type === "percent") return percent(v);
  if (row.id === "pedidos") return v.toLocaleString("pt-BR");
  return money(v);
}

export function FinanceiroView({
  sales,
  entries,
  today,
  firstSale,
}: {
  sales: SaleFact[];
  entries: EntryFact[];
  today: string;
  firstSale: string;
}) {
  const thisMonth = today.slice(0, 7);
  const [tab, setTab] = useState<Tab>("overview");
  const [mode, setMode] = useState<Mode>("brands");
  const [fromMonth, setFromMonth] = useState(thisMonth);
  const [toMonth, setToMonth] = useState(thisMonth);
  const [brandFilter, setBrandFilter] = useState<Brand | "all">("all");
  const [feePct, setFeePct] = useState(DEFAULT_ASSUMPTIONS.ifoodFeeBps / 100);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [drill, setDrill] = useState<{ row: Row; col: Column } | null>(null);

  const from = `${fromMonth <= toMonth ? fromMonth : toMonth}-01`;
  const last = fromMonth <= toMonth ? toMonth : fromMonth;
  const to = monthEnd(last) < today || last !== thisMonth ? monthEnd(last) : today;
  const assumptions = useMemo(() => ({ ifoodFeeBps: Math.round(Math.max(0, Math.min(feePct, 60)) * 100) }), [feePct]);
  const brands: Brand[] = brandFilter === "all" ? [...BRANDS] : [brandFilter];
  const columns = useMemo(
    () => (mode === "brands" ? brandColumns(from, to, brands) : monthColumns(from, to, brands)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mode, from, to, brandFilter],
  );
  const dre = useMemo(() => buildDre(sales, entries, columns, assumptions), [sales, entries, columns, assumptions]);
  const dfc = useMemo(() => buildDfc(sales, entries, columns, assumptions), [sales, entries, columns, assumptions]);

  const presets: [string, string, string][] = [
    ["Este mês", thisMonth, thisMonth],
    ["Mês anterior", shiftMonth(thisMonth, -1), shiftMonth(thisMonth, -1)],
    ["Últimos 3 meses", shiftMonth(thisMonth, -2), thisMonth],
    ["Este ano", `${thisMonth.slice(0, 4)}-01`, thisMonth],
    ["Desde o início", firstSale.slice(0, 7), thisMonth],
  ];
  const statement = tab === "dfc" ? dfc : dre;
  const periodLabel = from.slice(0, 7) === to.slice(0, 7) ? monthLabel(from.slice(0, 7)) : `${monthLabel(from.slice(0, 7))} a ${monthLabel(to.slice(0, 7))}`;

  const missing = useMemo(() => {
    const cats = new Set(entries.filter((e) => e.kind === "payable" && monthInPeriod(entryMonth(e), from, to)).map((e) => e.category));
    return (["purchase", "payroll", "rent", "tax", "utilities", "packaging"] as const).filter((c) => !cats.has(c));
  }, [entries, from, to]);

  function exportCsv() {
    const lines = [
      ["Descrição", ...statement.columns.map((c) => c.label)].join(";"),
      ...statement.rows.map((r) => [r.label, ...r.values.map((v) => (r.type === "percent" ? (v / 100).toFixed(2) : r.id === "pedidos" ? String(v) : (v / 100).toFixed(2)).replace(".", ","))].join(";")),
    ];
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${tab === "dfc" ? "dfc" : "dre"}-${from}-${to}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <span className={styles.eyebrow}>Financeiro & Contábil</span>
          <h1>DRE e fluxo de caixa</h1>
          <p>
            Resultado por competência e caixa pelo método direto, por loja ou mês a mês. As vendas vêm dos pedidos;
            custos, despesas, pagamentos e recebimentos vêm dos lançamentos do <Link href="/admin/erp">ERP</Link>.
          </p>
        </div>
      </header>

      <div className={styles.tabs} role="tablist" aria-label="Demonstrativos">
        {TABS.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      <section className={styles.filters} aria-label="Filtros">
        <div className={styles.presets}>
          {presets.map(([label, f, t], i) => (
            <button
              key={label}
              className={presets.findIndex(([, pf, pt]) => pf === fromMonth && pt === toMonth) === i ? styles.chipOn : styles.chip}
              onClick={() => {
                setFromMonth(f);
                setToMonth(t);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <label>
          De
          <input type="month" value={fromMonth} max={thisMonth} onChange={(e) => e.target.value && setFromMonth(e.target.value)} />
        </label>
        <label>
          Até
          <input type="month" value={toMonth} max={thisMonth} onChange={(e) => e.target.value && setToMonth(e.target.value)} />
        </label>
        <label>
          Colunas
          <select value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
            <option value="brands">Por loja</option>
            <option value="months">Mês a mês</option>
          </select>
        </label>
        <label>
          Loja
          <select value={brandFilter} onChange={(e) => setBrandFilter(e.target.value as Brand | "all")}>
            <option value="all">Todas</option>
            {BRANDS.map((b) => (
              <option key={b} value={b}>
                {BRAND_LABELS[b]}
              </option>
            ))}
          </select>
        </label>
        <label title="Comissão + taxa de pagamento online do iFood, usada só quando não há lançamento real">
          Taxa iFood (%)
          <input type="number" min={0} max={60} step={0.1} value={feePct} onChange={(e) => setFeePct(Number(e.target.value))} />
        </label>
      </section>

      {tab === "overview" ? (
        <Overview dre={dre} dfc={dfc} sales={sales} entries={entries} from={from} to={to} brands={brands} assumptions={assumptions} missing={missing} periodLabel={periodLabel} />
      ) : (
        <section className={styles.card}>
          <div className={styles.cardBar}>
            <span>
              ⓘ {periodLabel} · Valores em R$ · {tab === "dre" ? "Regime de competência" : "Regime de caixa, método direto"}
            </span>
            <div className={styles.cardActions}>
              <button onClick={() => setCollapsed(new Set())}>Expandir tudo</button>
              <button onClick={() => setCollapsed(new Set(statement.rows.filter((r) => r.type === "group").map((r) => r.id)))}>Recolher</button>
              <button onClick={exportCsv}>Exportar CSV</button>
            </div>
          </div>
          <Notes tab={tab} missing={missing} feePct={feePct} hasEntries={entries.length > 0} />
          <StatementTable statement={statement} collapsed={collapsed} toggle={(id) => setCollapsed((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; })} onCell={(row, col) => setDrill({ row, col })} />
          {drill && <Drill view={tab} drill={drill} entries={entries} onClose={() => setDrill(null)} />}
        </section>
      )}
    </main>
  );
}

function monthInPeriod(m: string, from: string, to: string) {
  return m >= from.slice(0, 7) && m <= to.slice(0, 7);
}

function Notes({ tab, missing, feePct, hasEntries }: { tab: Tab; missing: string[]; feePct: number; hasEntries: boolean }) {
  return (
    <details className={styles.notes}>
      <summary>Detalhes do modelo e dados faltantes</summary>
      <ul>
        {tab === "dre" ? (
          <>
            <li>Vendas entram na data do pedido. Pedidos próprios só contam depois de aceitos; cancelados e testes ficam fora.</li>
            <li>Lançamentos entram no mês de competência informado ou, sem ele, no mês do vencimento.</li>
            <li>Sem lançamento de comissão iFood (categoria “Comissão iFood / marketplace”) no mês, a comissão é estimada em {feePct.toLocaleString("pt-BR")}% do valor dos pedidos iFood. Valores estimados aparecem com ≈.</li>
            <li>Investimentos, empréstimos, retiradas e repasses não são resultado: aparecem só no fluxo de caixa.</li>
          </>
        ) : (
          <>
            <li>Vendas próprias entram no caixa na data do pedido, pela forma de pagamento.</li>
            <li>Repasse iFood: sem repasse lançado (categoria “Repasse iFood”, baixado), estima os pedidos da semana (segunda a domingo) menos {feePct.toLocaleString("pt-BR")}%, pagos na quarta-feira seguinte. Pedidos iFood pagos na entrega ficam com a casa e a taxa sai do repasse.</li>
            <li>Pagamentos e recebimentos do ERP entram na data da baixa. O saldo inicial considera só o que está registrado no sistema, sem saldo bancário de abertura.</li>
          </>
        )}
        {!hasEntries && <li className={styles.warnText}>Ainda não há lançamentos no ERP: o demonstrativo mostra só vendas e estimativas.</li>}
        {missing.length > 0 && (
          <li className={styles.warnText}>
            Sem lançamentos no período em: {missing.map((c) => CATEGORY_LABELS[c]).join(", ")}. <Link href="/admin/erp">Lançar no ERP</Link>.
          </li>
        )}
      </ul>
    </details>
  );
}

function StatementTable({
  statement,
  collapsed,
  toggle,
  onCell,
}: {
  statement: Statement;
  collapsed: Set<string>;
  toggle: (id: string) => void;
  onCell: (row: Row, col: Column) => void;
}) {
  const hasKids = new Set(statement.rows.filter((r) => r.parent).map((r) => r.parent!));
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">Descrição</th>
            {statement.columns.map((c) => (
              <th key={c.key} scope="col" className={c.key === "total" ? styles.totalCol : undefined}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {statement.rows.map((r) => {
            if (r.parent && collapsed.has(r.parent)) return null;
            const expandable = hasKids.has(r.id);
            return (
              <Fragment key={r.id}>
                {r.type === "group" || (r.type === "total" && !r.parent) ? <tr className={styles.spacer} aria-hidden="true"><td colSpan={statement.columns.length + 1} /></tr> : null}
                <tr className={styles[`row_${r.type}`]} data-row={r.id}>
                  <th scope="row" style={{ paddingLeft: 14 + r.level * 22 }}>
                    {expandable ? (
                      <button className={styles.toggle} aria-expanded={!collapsed.has(r.id)} onClick={() => toggle(r.id)}>
                        <span aria-hidden="true">{collapsed.has(r.id) ? "›" : "⌄"}</span> {r.label}
                      </button>
                    ) : (
                      <span title={r.hint}>{r.label}</span>
                    )}
                  </th>
                  {r.values.map((v, i) => {
                    const est = r.estimated?.[i];
                    const clickable = r.type === "line" || r.type === "group";
                    return (
                      <td
                        key={statement.columns[i].key}
                        className={`${v < 0 && r.type !== "percent" ? styles.neg : ""} ${statement.columns[i].key === "total" ? styles.totalCol : ""}`}
                      >
                        {clickable ? (
                          <button className={styles.cell} onClick={() => onCell(r, statement.columns[i])} title="Ver lançamentos">
                            {est ? "≈ " : ""}
                            {formatValue(r, v)}
                          </button>
                        ) : (
                          <>
                            {est ? "≈ " : ""}
                            {formatValue(r, v)}
                          </>
                        )}
                      </td>
                    );
                  })}
                </tr>
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Drill({ view, drill, entries, onClose }: { view: Tab; drill: { row: Row; col: Column }; entries: EntryFact[]; onClose: () => void }) {
  const list = lineEntries(view === "dfc" ? "dfc" : "dre", drill.row.id, entries, drill.col);
  const fromSales = ["rb_propria", "rb_ifood", "rb_entrega", "ded_descontos", "receita_bruta", "ent_pix", "ent_dinheiro", "ent_cartao", "entradas"].includes(drill.row.id);
  return (
    <aside className={styles.drill} aria-label="Lançamentos da linha">
      <div className={styles.drillHead}>
        <div>
          <strong>{drill.row.label}</strong>
          <span>
            {drill.col.label} · {dateBr(drill.col.from)} a {dateBr(drill.col.to)}
          </span>
        </div>
        <button onClick={onClose}>Fechar</button>
      </div>
      {list.length ? (
        <table className={styles.drillTable}>
          <thead>
            <tr>
              <th>Loja</th>
              <th>Descrição</th>
              <th>Categoria</th>
              <th>{view === "dfc" ? "Baixa" : "Competência"}</th>
              <th>Valor</th>
            </tr>
          </thead>
          <tbody>
            {list.map((e) => (
              <tr key={e.id}>
                <td>{BRAND_LABELS[e.brand]}</td>
                <td>{e.description}</td>
                <td>{CATEGORY_LABELS[e.category] ?? e.category}</td>
                <td>{view === "dfc" ? dateBr(e.settledDate ?? "") : monthLabel(entryMonth(e))}</td>
                <td className={e.kind === "payable" ? styles.neg : ""}>{money(e.kind === "payable" ? -e.amountCents : e.amountCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p>
          {fromSales || drill.row.estimated ? "Valor calculado a partir dos pedidos; não há lançamento manual nesta linha." : "Nenhum lançamento nesta linha."}{" "}
          <Link href="/admin/erp">Abrir o ERP</Link>
        </p>
      )}
    </aside>
  );
}

function Overview({
  dre,
  dfc,
  sales,
  entries,
  from,
  to,
  brands,
  assumptions,
  missing,
  periodLabel,
}: {
  dre: Statement;
  dfc: Statement;
  sales: SaleFact[];
  entries: EntryFact[];
  from: string;
  to: string;
  brands: Brand[];
  assumptions: { ifoodFeeBps: number };
  missing: string[];
  periodLabel: string;
}) {
  const total = dre.columns.length - 1;
  const v = (s: Statement, id: string, col = total) => s.rows.find((r) => r.id === id)?.values[col] ?? 0;
  // Últimos 6 meses até o fim do período, para o gráfico de evolução.
  const trendCols = useMemo(() => {
    const end = to.slice(0, 7);
    const start = shiftMonth(end, -5);
    return monthColumns(`${start}-01`, to, brands).slice(0, -1);
  }, [to, brands]);
  const trend = useMemo(() => buildDre(sales, entries, trendCols, assumptions), [sales, entries, trendCols, assumptions]);
  const tv = (id: string) => trend.rows.find((r) => r.id === id)!.values;
  const rb = tv("receita_bruta"), rl = tv("resultado_liquido");
  // Eixo zero móvel: a área abaixo dele só aparece quando há prejuízo.
  const maxPos = Math.max(1, ...rb, ...rl);
  const maxNeg = Math.max(0, ...rl.map((x) => -x));
  const scale = maxPos + maxNeg;
  const plotH = 190;
  const zeroY = 10 + (maxPos / scale) * plotH;
  const byBrand = brands.length > 1 ? dre.columns.slice(0, -1) : [];
  const open = entries.filter((e) => e.status === "open" && e.dueDate >= from && e.dueDate <= to && brands.includes(e.brand));
  const overdue = entries.filter((e) => e.status === "open" && e.dueDate < new Date().toISOString().slice(0, 10) && brands.includes(e.brand));
  const kpis: [string, number, string?][] = [
    ["Receita bruta", v(dre, "receita_bruta"), `${v(dre, "pedidos").toLocaleString("pt-BR")} pedidos · ticket ${brl(v(dre, "ticket_medio"))}`],
    ["Receita líquida", v(dre, "receita_liquida"), "após descontos, impostos e taxas"],
    ["Resultado líquido", v(dre, "resultado_liquido"), `margem ${percent(v(dre, "margem_liquida"))}`],
    ["Caixa gerado no período", v(dfc, "variacao"), `saldo final ${brl(v(dfc, "saldo_final"))}`],
  ];
  return (
    <>
      <section className={styles.kpis} aria-label={`Indicadores de ${periodLabel}`}>
        {kpis.map(([label, value, sub]) => (
          <article key={label} className={styles.kpi}>
            <span>{label}</span>
            <strong className={value < 0 ? styles.neg : undefined}>{brl(value)}</strong>
            {sub && <small>{sub}</small>}
          </article>
        ))}
      </section>

      <div className={styles.grid2}>
        <section className={styles.card}>
          <div className={styles.cardBar}>
            <span>Receita bruta × resultado líquido · últimos 6 meses</span>
          </div>
          <svg className={styles.chart} viewBox="0 0 600 230" role="img" aria-label="Evolução mensal de receita e resultado">
            {trend.columns.map((c, i) => {
              const w = 550 / trend.columns.length;
              const x = 40 + i * w + w * 0.15;
              const bw = w * 0.3;
              const h1 = (rb[i] / scale) * plotH;
              const h2 = (Math.abs(rl[i]) / scale) * plotH;
              return (
                <g key={c.key}>
                  <rect x={x} y={zeroY - h1} width={bw} height={h1} className={styles.barRevenue}>
                    <title>{`${c.label}: receita ${brl(rb[i])}`}</title>
                  </rect>
                  <rect x={x + bw + 4} y={rl[i] >= 0 ? zeroY - h2 : zeroY} width={bw} height={h2} className={rl[i] >= 0 ? styles.barProfit : styles.barLoss}>
                    <title>{`${c.label}: resultado ${brl(rl[i])}`}</title>
                  </rect>
                  <text x={x + bw} y={222} textAnchor="middle" className={styles.chartLabel}>
                    {c.label}
                  </text>
                </g>
              );
            })}
            <line x1="40" y1={zeroY} x2="590" y2={zeroY} className={styles.axis} />
          </svg>
          <div className={styles.legend}>
            <span><i className={styles.dotRevenue} /> Receita bruta</span>
            <span><i className={styles.dotProfit} /> Resultado líquido</span>
          </div>
        </section>

        <section className={styles.card}>
          <div className={styles.cardBar}>
            <span>Resultado por loja · {periodLabel}</span>
          </div>
          {byBrand.length ? (
            <table className={styles.miniTable}>
              <thead>
                <tr>
                  <th>Loja</th>
                  <th>Receita</th>
                  <th>Margem contrib.</th>
                  <th>Resultado</th>
                </tr>
              </thead>
              <tbody>
                {byBrand.map((c, i) => (
                  <tr key={c.key}>
                    <td>{c.label}</td>
                    <td>{brl(v(dre, "receita_bruta", i))}</td>
                    <td>{percent(v(dre, "margem_contribuicao_pct", i))}</td>
                    <td className={v(dre, "resultado_liquido", i) < 0 ? styles.neg : ""}>{brl(v(dre, "resultado_liquido", i))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className={styles.muted}>Escolha “Todas” as lojas para comparar.</p>
          )}
          <ul className={styles.facts}>
            <li>Ponto de equilíbrio: <strong>{v(dre, "ponto_equilibrio")
                  ? brl(v(dre, "ponto_equilibrio"))
                  : v(dre, "fixas")
                    ? "não atingível com a margem de contribuição atual"
                    : "sem despesas fixas lançadas"}</strong></li>
            <li>Comissão iFood no período: <strong>{brl(-v(dre, "ded_ifood"))}</strong>{dre.rows.find((r) => r.id === "ded_ifood")?.estimated?.[total] ? " (estimada)" : ""}</li>
            <li>Em aberto no período: <strong>{open.length}</strong> lançamento(s) · vencidos: <strong className={overdue.length ? styles.neg : undefined}>{overdue.length}</strong></li>
          </ul>
        </section>
      </div>

      {missing.length > 0 && (
        <section className={styles.alert}>
          <strong>Para o DRE ficar completo</strong>
          <p>
            Faltam lançamentos de {missing.map((c) => CATEGORY_LABELS[c].toLowerCase()).join(", ")} em {periodLabel}. Sem eles, o resultado mostra só
            vendas menos descontos e a comissão do iFood. <Link href="/admin/erp">Lançar no ERP</Link>
          </p>
        </section>
      )}
    </>
  );
}
