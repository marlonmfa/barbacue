"use client";
import Link from "next/link";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  BRANDS,
  BRAND_LABELS,
  CATEGORY_LABELS,
  brandColumns,
  buildDfc,
  buildDre,
  entryMonth,
  lineEntries,
  monthColumns,
  monthEnd,
  monthLabel,
  saleAdjustment,
  type Brand,
  type Column,
  type EntryFact,
  type Row,
  type FinanceReport,
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
const brl = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const axisCurrency = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });
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
  firstDate,
}: FinanceReport) {
  const thisMonth = today.slice(0, 7);
  const [tab, setTab] = useState<Tab>("overview");
  const [mode, setMode] = useState<Mode>("brands");
  const [fromMonth, setFromMonth] = useState(() => shiftMonth(thisMonth, -5));
  const [toMonth, setToMonth] = useState(thisMonth);
  const [brandFilter, setBrandFilter] = useState<Brand | "all">("all");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [drill, setDrill] = useState<{ row: Row; col: Column } | null>(null);
  const drillTrigger = useRef<HTMLButtonElement>(null);

  const start = fromMonth <= toMonth ? fromMonth : toMonth;
  const last = fromMonth <= toMonth ? toMonth : fromMonth;
  const from = `${start}-01`;
  const to = last >= thisMonth ? today : monthEnd(last);
  const brands = useMemo<Brand[]>(() => brandFilter === "all" ? [...BRANDS] : [brandFilter], [brandFilter]);
  const columns = useMemo(
    () => mode === "brands" || tab === "overview" ? brandColumns(from, to, brands) : monthColumns(from, to, brands),
    [mode, tab, from, to, brands],
  );
  const dre = useMemo(() => buildDre(sales, entries, columns), [sales, entries, columns]);
  const dfc = useMemo(() => buildDfc(entries, columns), [entries, columns]);

  const presets: [string, string, string][] = [
    ["Este mês", thisMonth, thisMonth],
    ["Mês anterior", shiftMonth(thisMonth, -1), shiftMonth(thisMonth, -1)],
    ["Últimos 6 meses", shiftMonth(thisMonth, -5), thisMonth],
    ["Este ano", `${thisMonth.slice(0, 4)}-01`, thisMonth],
    ["Desde o início", firstDate.slice(0, 7), thisMonth],
  ];
  const statement = tab === "dfc" ? dfc : dre;
  const hasCashMovements = entries.some((entry) => brands.includes(entry.brand) && entry.status === "settled"
    && entry.settledDate !== null && entry.settledDate >= from && entry.settledDate <= to);
  const periodLabel = from.slice(0, 7) === to.slice(0, 7) ? monthLabel(from.slice(0, 7)) : `${monthLabel(from.slice(0, 7))} a ${monthLabel(to.slice(0, 7))}`;

  const missing = useMemo(() => {
    const cats = new Set(entries.filter((e) => e.kind === "payable" && brands.includes(e.brand) && monthInPeriod(entryMonth(e), from, to)).map((e) => e.category));
    return (["purchase", "payroll", "rent", "tax", "utilities", "packaging"] as const).filter((c) => !cats.has(c));
  }, [entries, brands, from, to]);

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

  function isMonth(value: string) {
    return /^\d{4}-(0[1-9]|1[0-2])$/.test(value) && value >= "1900-01" && value <= thisMonth;
  }

  const activeDrill = drill && columns.some((column) =>
    column.key === drill.col.key && column.from === drill.col.from &&
    column.to === drill.col.to && column.brands.join() === drill.col.brands.join(),
  ) ? drill : null;

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>Relatórios financeiros</h1>
          <p>
            Faturamento, resultado por competência e fluxo de caixa de Barbacue, Chelas e Barbadog.
          </p>
        </div>
      </header>

      <nav className={styles.tabs} aria-label="Demonstrativos">
        {TABS.map(([id, label]) => (
          <button key={id} aria-pressed={tab === id} onClick={() => { setTab(id); setDrill(null); }}>
            {label}
          </button>
        ))}
      </nav>
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
          <input type="month" value={fromMonth} max={thisMonth} onChange={(e) => isMonth(e.target.value) && setFromMonth(e.target.value)} />
        </label>
        <label>
          Até
          <input type="month" value={toMonth} max={thisMonth} onChange={(e) => isMonth(e.target.value) && setToMonth(e.target.value)} />
        </label>
        {tab !== "overview" && <label>
          Colunas
          <select value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
            <option value="brands">Por loja</option>
            <option value="months">Mês a mês</option>
          </select>
        </label>}
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
      </section>

      {tab === "overview" ? (
        <Overview dre={dre} dfc={dfc} sales={sales} entries={entries} from={from} to={to} brands={brands} today={today} hasCashMovements={hasCashMovements} missing={missing} periodLabel={periodLabel} />
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
          {tab === "dfc" && !hasCashMovements && <p className={styles.cashNotice} role="status">
            Sem movimentações de caixa registradas para esta seleção. As contas em aberto continuam visíveis na projeção.
          </p>}
          <Notes tab={tab} missing={missing} />
          <StatementTable statement={statement} collapsed={collapsed} toggle={(id) => setCollapsed((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; })} onCell={(row, col, button) => { drillTrigger.current = button; setDrill({ row, col }); }} />
          {activeDrill && <Drill view={tab} drill={activeDrill} entries={entries} sales={sales} onClose={() => { setDrill(null); drillTrigger.current?.focus(); }} />}
        </section>
      )}
    </section>
  );
}

function monthInPeriod(m: string, from: string, to: string) {
  return m >= from.slice(0, 7) && m <= to.slice(0, 7);
}

function Notes({ tab, missing }: { tab: Tab; missing: string[] }) {
  return (
    <details className={styles.notes}>
      <summary>Fontes e critérios de cálculo</summary>
      {tab === "dre" ? (
        <ul>
          <li>Vendas pela data do pedido. Pedidos próprios em espera, pedidos cancelados e testes ficam fora.</li>
          <li>Lançamentos pela competência informada ou pelo mês do vencimento. Compras de insumos representam custos registrados. A apuração do CMV depende do consumo de estoque.</li>
          <li>A linha de ajustes concilia o total informado pelo canal com itens, entrega e descontos registrados.</li>
          <li>Taxas, impostos e comissões dependem dos lançamentos disponíveis no <Link href="/admin/erp">ERP</Link>.</li>
          {missing.length > 0 && <li>Sem lançamento no período para {missing.map((c) => CATEGORY_LABELS[c].toLowerCase()).join(", ")}.</li>}
        </ul>
      ) : (
        <ul>
          <li>O DFC usa recebimentos e estornos do caixa, confirmações online e baixas do ERP. Repasses iFood entram quando baixados no ERP.</li>
          <li>O saldo inicial e o saldo final acumulam os movimentos registrados no sistema. Para saldo bancário, consulte o extrato.</li>
          <li>Sangrias e suprimentos movimentam o caixa interno e ficam fora do demonstrativo.</li>
        </ul>
      )}
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
  onCell: (row: Row, col: Column, button: HTMLButtonElement) => void;
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
                    const clickable = r.type === "line" || r.type === "group" || ["total_entradas", "total_saidas"].includes(r.id);
                    return (
                      <td
                        key={statement.columns[i].key}
                        className={`${v < 0 && r.type !== "percent" ? styles.neg : ""} ${statement.columns[i].key === "total" ? styles.totalCol : ""}`}
                      >
                        {clickable ? (
                          <button className={styles.cell} onClick={(event) => onCell(r, statement.columns[i], event.currentTarget)} title="Ver lançamentos">
                            {formatValue(r, v)}
                          </button>
                        ) : (
                          <>
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

function Drill({ view, drill, entries, sales, onClose }: {
  view: "dre" | "dfc";
  drill: { row: Row; col: Column };
  entries: EntryFact[];
  sales: FinanceReport["sales"];
  onClose: () => void;
}) {
  const detail = useRef<HTMLElement>(null);
  useEffect(() => {
    detail.current?.focus({ preventScroll: true });
    detail.current?.scrollIntoView({ block: "nearest" });
  }, [drill]);
  const { row, col } = drill;
  const list = lineEntries(view, row.id, entries, col);
  const salesAmount = (sale: FinanceReport["sales"][number]) => {
    switch (row.id) {
      case "receita_bruta": return sale.itemsCents + sale.deliveryFeeCents;
      case "rb_propria": return sale.channel === "own" ? sale.itemsCents : 0;
      case "rb_ifood": return sale.channel === "ifood" ? sale.itemsCents : 0;
      case "rb_entrega": return sale.deliveryFeeCents;
      case "deducoes": return saleAdjustment(sale) - sale.discountCents;
      case "ded_ajustes": return saleAdjustment(sale);
      case "ded_descontos": return -sale.discountCents;
      default: return 0;
    }
  };
  const salesRows = view === "dre" ? sales
    .filter((sale) => col.brands.includes(sale.brand) && sale.date >= col.from && sale.date <= col.to)
    .map((sale) => ({ ...sale, amount: salesAmount(sale) }))
    .filter((sale) => sale.amount !== 0) : [];
  return (
    <aside ref={detail} tabIndex={-1} className={styles.drill} aria-label="Lançamentos da linha">
      <div className={styles.drillHead}>
        <div>
          <strong>{drill.row.label}</strong>
          <span>
            {drill.col.label} · {dateBr(drill.col.from)} a {dateBr(drill.col.to)}
          </span>
        </div>
        <button onClick={onClose}>Fechar</button>
      </div>
      {salesRows.length > 0 && (
        <div className={styles.tableWrap}>
          <table className={styles.drillTable}>
            <thead><tr><th>Data</th><th>Loja</th><th>Canal</th><th>Pedidos</th><th>Valor</th></tr></thead>
            <tbody>{salesRows.map((sale) => (
              <tr key={`${sale.date}:${sale.brand}:${sale.channel}`}>
                <td>{dateBr(sale.date)}</td><td>{BRAND_LABELS[sale.brand]}</td>
                <td>{sale.channel === "ifood" ? "iFood" : "Canais próprios"}</td>
                <td>{sale.orders}</td><td>{money(sale.amount)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {list.length > 0 && (
        <div className={styles.tableWrap}><table className={styles.drillTable}>
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
        </table></div>
      )}
      {!list.length && !salesRows.length && <p>Nenhum lançamento nesta linha.</p>}
    </aside>
  );
}

type Series = { label: string; values: number[]; color: "revenue" | "positive" | "outflow" };

function MonthlyChart({ title, columns, series }: { title: string; columns: Column[]; series: Series[] }) {
  const values = series.flatMap((item) => item.values);
  const rawMax = Math.max(0, ...values);
  const rawMin = Math.min(0, ...values);
  const interval = (rawMax - rawMin) / 4 || 100;
  const unit = 10 ** Math.floor(Math.log10(interval));
  const step = ([1, 2, 5, 10].find((factor) => factor * unit >= interval) ?? 10) * unit;
  const max = rawMax || rawMin ? Math.ceil(rawMax / step) * step : step;
  const min = Math.floor(rawMin / step) * step;
  const span = max - min;
  const position = (value: number) => ((max - value) / span) * 100;
  const ticks = Array.from({ length: Math.round(span / step) + 1 }, (_, index) => max - step * index);

  return (
    <section className={styles.card} aria-label={title}>
      <h2 className={styles.cardBar}>{title}</h2>
      <div className={styles.chartFrame}>
        <div className={styles.chartAxis} aria-hidden="true">
          {ticks.map((tick) => <span key={tick} style={{ top: `${position(tick)}%` }}>{axisCurrency.format(tick / 100)}</span>)}
        </div>
        <div className={styles.chartScroll}><div className={styles.plot} style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(56px, 1fr))` }}>
          {columns.map((column, index) => (
            <div className={styles.chartMonth} key={column.key}>
              <div className={styles.plotBars} aria-hidden="true">
                {ticks.map((tick) => <div key={tick} className={tick === 0 ? styles.baseline : styles.gridLine} style={{ top: `${position(tick)}%` }} />)}
                {series.map((item) => {
                  const value = item.values[index];
                  const height = Math.abs(value) / span * 100;
                  return <div className={styles.barSlot} key={item.label}>
                    <div className={styles[item.color]} style={{ top: `${position(Math.max(0, value))}%`, height: `${height}%` }}
                      title={`${item.label} • ${brl(value)}`} />
                  </div>;
                })}
              </div>
              <span>{column.label}</span>
            </div>
          ))}
        </div></div>
      </div>
      <ul className={styles.legend}>
        {series.map((item) => <li key={item.label}><i className={styles[item.color]} />{item.label}</li>)}
      </ul>
      <details className={`${styles.notes} ${styles.chartDetails}`}>
        <summary>Ver valores por mês</summary>
        <div className={styles.tableWrap}>
          <table className={styles.miniTable}>
            <thead><tr><th scope="col">Mês</th>{series.map((item) => <th scope="col" key={item.label}>{item.label}</th>)}</tr></thead>
            <tbody>{columns.map((column, index) => <tr key={column.key}>
              <th scope="row">{column.label}</th>
              {series.map((item) => <td key={item.label}>{brl(item.values[index])}</td>)}
            </tr>)}</tbody>
          </table>
        </div>
      </details>
    </section>
  );
}

function Overview({ dre, dfc, sales, entries, from, to, brands, today, hasCashMovements, missing, periodLabel }: {
  dre: Statement;
  dfc: Statement;
  sales: FinanceReport["sales"];
  entries: EntryFact[];
  from: string;
  to: string;
  brands: Brand[];
  today: string;
  hasCashMovements: boolean;
  missing: string[];
  periodLabel: string;
}) {
  const columns = useMemo(() => monthColumns(from, to, brands).slice(0, -1), [from, to, brands]);
  const monthlyDre = useMemo(() => buildDre(sales, entries, columns), [sales, entries, columns]);
  const monthlyDfc = useMemo(() => buildDfc(entries, columns), [entries, columns]);
  const total = dre.columns.length - 1;
  const values = (statement: Statement, id: string) => statement.rows.find((row) => row.id === id)!.values;
  const value = (statement: Statement, id: string, index = total) => values(statement, id)[index];
  const hasData = sales.some((s) => brands.includes(s.brand) && s.date >= from && s.date <= to)
    || entries.some((e) => brands.includes(e.brand) && (
      monthInPeriod(entryMonth(e), from, to) || (e.settledDate && e.settledDate >= from && e.settledDate <= to)
    ));
  const open = entries.filter((e) => e.status === "open" && e.dueDate >= from && e.dueDate <= to && brands.includes(e.brand));
  const overdue = open.filter((e) => e.dueDate < today);
  const kpis = [
    ["Receita bruta", value(dre, "receita_bruta"), `${value(dre, "pedidos").toLocaleString("pt-BR")} pedidos · ticket médio de ${brl(value(dre, "ticket_medio"))}`],
    ["Receita líquida", value(dre, "receita_liquida"), "Após deduções registradas"],
    ["Resultado líquido gerencial", value(dre, "resultado_liquido"), `Margem de ${percent(value(dre, "margem_liquida"))}`],
    ["Variação do caixa", value(dfc, "variacao"), `Saldo final registrado de ${brl(value(dfc, "saldo_final"))}`],
  ] as const;
  const chartSeries: { title: string; items: Series[] }[] = [
    { title: "Faturamento por mês", items: [
      { label: "Receita bruta", values: values(monthlyDre, "receita_bruta"), color: "revenue" },
      { label: "Receita líquida", values: values(monthlyDre, "receita_liquida"), color: "positive" },
    ] },
    { title: "Entradas e saídas por mês", items: [
      { label: "Entradas", values: values(monthlyDfc, "total_entradas"), color: "positive" },
      { label: "Saídas", values: values(monthlyDfc, "total_saidas").map(Math.abs), color: "outflow" },
    ] },
    { title: "Vendas por canal", items: [
      { label: "Itens de canais próprios", values: values(monthlyDre, "rb_propria"), color: "revenue" },
      { label: "Itens do iFood", values: values(monthlyDre, "rb_ifood"), color: "positive" },
    ] },
    { title: "Resultado e caixa por mês", items: [
      { label: "Resultado líquido gerencial", values: values(monthlyDre, "resultado_liquido"), color: "revenue" },
      { label: "Variação do caixa", values: values(monthlyDfc, "variacao"), color: "positive" },
    ] },
  ];

  return (
    <>
      <section className={styles.kpis} aria-label={`Indicadores de ${periodLabel}`}>
        {kpis.map(([label, amount, description]) => (
          <article key={label} className={styles.kpi}>
            <span>{label}</span>
            <strong className={amount < 0 ? styles.neg : undefined}>{brl(amount)}</strong>
            <small>{description}</small>
          </article>
        ))}
      </section>
      {hasData && !hasCashMovements && <p className={styles.cashNotice} role="status">
        Sem movimentações de caixa registradas para esta seleção. O gráfico de caixa reflete essa ausência de registros.
      </p>}
      {hasData ? (
        <div className={styles.grid2}>
          {chartSeries.map(({ title, items }) => <MonthlyChart key={title} title={title} columns={columns} series={items} />)}
        </div>
      ) : <p role="status">Nenhuma venda ou movimentação registrada para a loja e o período selecionados.</p>}
      <section className={styles.card}>
        <h2 className={styles.cardBar}>Resultado por loja em {periodLabel}</h2>
        <div className={styles.tableWrap}>
          <table className={styles.miniTable}>
            <thead><tr>
              <th scope="col">Loja</th><th scope="col">Receita bruta</th><th scope="col">Resultado gerencial</th>
              <th scope="col">Entradas</th><th scope="col">Saídas</th>
            </tr></thead>
            <tbody>{dre.columns.map((column, index) => <tr key={column.key}>
              <th scope="row">{column.label}</th>
              <td>{brl(value(dre, "receita_bruta", index))}</td>
              <td>{brl(value(dre, "resultado_liquido", index))}</td>
              <td>{brl(value(dfc, "total_entradas", index))}</td>
              <td>{brl(Math.abs(value(dfc, "total_saidas", index)))}</td>
            </tr>)}</tbody>
          </table>
        </div>
        <ul className={styles.facts}>
          <li>Contas em aberto no período <strong>{open.length}</strong></li>
          <li>Contas vencidas no período <strong>{overdue.length}</strong></li>
        </ul>
      </section>
      {missing.length > 0 && (
        <p className={styles.alert}>Sem lançamentos de {missing.map((category) => CATEGORY_LABELS[category].toLowerCase()).join(", ")} para o período selecionado. <Link href="/admin/erp">Consultar lançamentos</Link></p>
      )}
    </>
  );
}
