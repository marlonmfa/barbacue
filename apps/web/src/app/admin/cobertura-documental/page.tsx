"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./coverage.module.css";

type Status = "obtained" | "boundary" | "missing" | "unknown";
type DocumentLink = { id: string; name: string; period: string; url: string };
type Cell = { month: string; status: Status; reason: string; documents: DocumentLink[] };
type Evidence = { id: string; date: string; title: string; description: string; document?: DocumentLink };
type Gap = { from: string; to: string; reason: string; dates?: string };
type Account = { id: string; name: string; institution: string; expectedPeriod: { from: string; to: string }; evidence: Evidence[]; gaps: Gap[]; totals: Record<Status, number>; cells: Cell[] };
type Payload = { generatedAt: string; months: string[]; accounts: Account[]; summary: Record<Status, number> };
type Selection = { account: Account; cell: Cell };

const labels: Record<Status, string> = { obtained: "Obtido", boundary: "Limite do período", missing: "Intervalo faltante", unknown: "Existência incerta" };
const monthNames = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const fullMonth = (value: string) => {
  const [year, month] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, 1)));
};
const monthRange = (from: string, to: string) => from === to ? fullMonth(from) : `${fullMonth(from)} a ${fullMonth(to)}`;

export default function DocumentCoveragePage() {
  const [data, setData] = useState<Payload>();
  const [selection, setSelection] = useState<Selection>();
  const [accountSelection, setAccountSelection] = useState<Account>();
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/admin/document-coverage", { cache: "no-store", signal: controller.signal })
      .then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.error || "Não foi possível consultar a cobertura."); return body; })
      .then(setData).catch((reason) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Falha ao consultar a cobertura."); });
    return () => controller.abort();
  }, []);
  const years = useMemo(() => data?.months.reduce<Array<{ year: string; count: number }>>((groups, month) => {
    const year = month.slice(0, 4), last = groups.at(-1);
    if (last?.year === year) last.count += 1; else groups.push({ year, count: 1 });
    return groups;
  }, []) ?? [], [data]);

  if (error) return <section className={styles.state}><span>Falha na consulta</span><h1>Não foi possível abrir a cobertura documental.</h1><p>{error}</p><button onClick={() => location.reload()}>Tentar novamente</button></section>;
  if (!data) return <section className={styles.state}><span>Controle documental</span><h1>Organizando contas e períodos…</h1><p>Os extratos protegidos estão sendo conferidos.</p></section>;

  return <section className={styles.page}>
    <header className={styles.hero}>
      <div><span className={styles.eyebrow}>Auditoria financeira · atualizado em {new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeZone: "America/Sao_Paulo" }).format(new Date(data.generatedAt))}</span><h1>Cobertura documental</h1><p>Selecione qualquer mês para ver a situação e abrir o extrato que sustenta a classificação.</p></div>
      <a href="/controle" className={styles.inventoryLink}>Ver inventário completo <span aria-hidden>↗</span></a>
    </header>

    <div className={styles.summary} aria-label="Resumo da cobertura">
      {(["obtained", "boundary", "missing", "unknown"] as Status[]).map((status) => <div key={status}><i className={styles[status]} /><span>{labels[status]}</span><strong>{data.summary[status]}</strong><small>meses</small></div>)}
    </div>

    <div className={styles.legend}><strong>Como ler</strong><span><i className={styles.obtained} />Documento correto</span><span><i className={styles.boundary} />Mês parcial ou borda</span><span><i className={styles.missing} />Prazo esperado sem documento</span><span><i className={styles.unknown} />Sem evidência de existência</span></div>

    <div className={styles.matrixFrame}>
      <div className={styles.matrix} style={{ "--months": data.months.length } as React.CSSProperties}>
        <div className={`${styles.corner} ${styles.yearCorner}`}>Conta</div>
        {years.map(({ year, count }) => <div className={styles.year} key={year} style={{ gridColumn: `span ${count}` }}>{year}</div>)}
        <div className={`${styles.corner} ${styles.monthCorner}`}>Instituição</div>
        {data.months.map((month) => <div className={styles.month} key={month}>{monthNames[Number(month.slice(5)) - 1]}</div>)}
        {data.accounts.map((account) => <div className={styles.row} key={account.id}>
          <div className={styles.account}><button type="button" className={styles.accountButton} onClick={() => { setSelection(undefined); setAccountSelection(account); }} aria-label={`Ver evidências históricas de ${account.name}`}><span><strong>{account.name}</strong><small>{account.institution}</small></span><b aria-hidden>›</b></button></div>
          {account.cells.map((cell) => <button
            key={cell.month}
            type="button"
            className={`${styles.cell} ${styles[cell.status]} ${cell.documents.length ? styles.hasDocument : ""}`}
            onClick={() => { setAccountSelection(undefined); setSelection({ account, cell }); }}
            aria-label={`${account.name}, ${fullMonth(cell.month)}: ${labels[cell.status]}${cell.documents.length ? `, ${cell.documents.length} documento(s)` : ""}`}
            title={`${fullMonth(cell.month)} · ${labels[cell.status]}`}
          ><span aria-hidden>{cell.documents.length ? "↗" : "·"}</span></button>)}
        </div>)}
      </div>
    </div>

    <p className={styles.note}>Clique no nome da conta para ver a evidência histórica. Vermelho marca períodos sem extrato em conta conhecida. Laranja indica mês parcial ou borda. Cinza indica existência incerta.</p>

    {selection && <div className={styles.drawerBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelection(undefined); }}>
      <aside className={styles.drawer} role="dialog" aria-modal="true" aria-labelledby="coverage-detail-title">
        <button className={styles.close} onClick={() => setSelection(undefined)} aria-label="Fechar detalhe">×</button>
        <span className={styles.eyebrow}>{selection.account.institution}</span>
        <h2 id="coverage-detail-title">{selection.account.name}</h2>
        <p className={styles.period}>{fullMonth(selection.cell.month)}</p>
        <div className={`${styles.verdict} ${styles[selection.cell.status]}`}><i />{labels[selection.cell.status]}</div>
        <p className={styles.reason}>{selection.cell.reason}</p>
        <div className={styles.documents}>
          <h3>{selection.cell.documents.length ? "Documentos deste mês" : "Documento"}</h3>
          {selection.cell.documents.length ? selection.cell.documents.map((document) => <a key={document.id} href={document.url} target="_blank" rel="noreferrer"><span><strong>{document.name}</strong><small>{document.period}</small></span><b aria-hidden>↗</b></a>) : <div className={styles.noDocument}><strong>Nenhum arquivo vinculado</strong><span>{selection.cell.status === "missing" ? "Este é um intervalo que ainda precisa ser obtido." : "Ainda não existe documento suficiente para comprovar este mês."}</span></div>}
        </div>
      </aside>
    </div>}

    {accountSelection && <div className={styles.drawerBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setAccountSelection(undefined); }}>
      <aside className={`${styles.drawer} ${styles.accountDrawer}`} role="dialog" aria-modal="true" aria-labelledby="account-history-title">
        <button className={styles.close} onClick={() => setAccountSelection(undefined)} aria-label="Fechar histórico da conta">×</button>
        <span className={styles.eyebrow}>{accountSelection.institution}</span>
        <h2 id="account-history-title">{accountSelection.name}</h2>
        <p className={styles.accountIntro}>Evidências que sustentam a existência da conta e os períodos ainda sem extrato.</p>

        <section className={`${styles.expectedPeriod} ${accountSelection.gaps.length ? styles.expectedMissing : styles.expectedCovered}`}>
          <span>{accountSelection.cells.every((cell) => cell.status === "unknown") ? "Período citado" : "Período documental esperado"}</span>
          <strong>{monthRange(accountSelection.expectedPeriod.from, accountSelection.expectedPeriod.to)}</strong>
          <small>{accountSelection.gaps.length ? `${accountSelection.gaps.length} intervalo(s) faltante(s)` : "Sem lacunas confirmadas"}</small>
        </section>

        <section className={styles.historySection}>
          <h3>Evidência histórica</h3>
          <div className={styles.timeline}>
            {accountSelection.evidence.map((evidence) => <article key={evidence.id}>
              <time>{fullMonth(evidence.date)}</time>
              <strong>{evidence.title}</strong>
              <p>{evidence.description}</p>
              {evidence.document && <a href={evidence.document.url} target="_blank" rel="noreferrer">Abrir documento comprobatório <span aria-hidden>↗</span></a>}
            </article>)}
          </div>
        </section>

        <section className={styles.gapsSection}>
          <h3>Prazo faltante</h3>
          {accountSelection.gaps.length ? accountSelection.gaps.map((gap) => <article key={`${gap.from}-${gap.to}`}><strong>{gap.dates ?? monthRange(gap.from, gap.to)}</strong><span>{gap.reason}</span></article>) : <p className={styles.noGaps}>Nenhuma lacuna confirmada.</p>}
        </section>

        <a className={styles.openAccount} href={`/admin/cobertura-documental/contas/${accountSelection.id}`} target="_blank" rel="noreferrer"><span><strong>Abrir todos os detalhes</strong><small>Histórico, lacunas, meses e documentos da conta</small></span><b aria-hidden>↗</b></a>
      </aside>
    </div>}
  </section>;
}
