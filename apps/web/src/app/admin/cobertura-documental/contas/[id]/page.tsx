import Link from "next/link";
import { notFound } from "next/navigation";
import { getCoverageAccount, type CoverageStatus } from "@/lib/document-coverage";
import styles from "./account-detail.module.css";

export const dynamic = "force-dynamic";

const statusLabels: Record<CoverageStatus, string> = {
  obtained: "Obtido",
  boundary: "Mês parcial",
  missing: "Faltante",
  unknown: "Existência incerta",
};
const shortMonths = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const fullMonth = (value: string) => {
  const [year, month] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, 1)));
};
const monthRange = (from: string, to: string) => from === to ? fullMonth(from) : `${fullMonth(from)} a ${fullMonth(to)}`;

export default async function CoverageAccountPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const account = getCoverageAccount(id);
  if (!account) notFound();

  const years = account.cells.reduce<Array<{ year: string; cells: typeof account.cells }>>((groups, cell) => {
    const year = cell.month.slice(0, 4);
    const group = groups.find((item) => item.year === year);
    if (group) group.cells.push(cell); else groups.push({ year, cells: [cell] });
    return groups;
  }, []);
  const documents = Array.from(new Map(account.cells.flatMap((cell) => cell.documents).map((document) => [document.id, document])).values());

  return <main className={styles.page}>
    <header className={styles.hero}>
      <div>
        <Link href="/admin/cobertura-documental" className={styles.back}>← Voltar à cobertura documental</Link>
        <span>{account.institution}</span>
        <h1>{account.name}</h1>
        <p>Histórico conhecido, prazo documental esperado e todos os meses vinculados a esta conta.</p>
      </div>
      <section className={`${styles.expected} ${account.gaps.length ? styles.expectedMissing : styles.expectedCovered}`}>
        <span>{account.cells.every((cell) => cell.status === "unknown") ? "Período citado" : "Período esperado"}</span>
        <strong>{monthRange(account.expectedPeriod.from, account.expectedPeriod.to)}</strong>
        <small>{account.gaps.length ? `${account.gaps.length} intervalo(s) faltante(s)` : "Sem lacunas confirmadas"}</small>
      </section>
    </header>

    <section className={styles.statusBar} aria-label="Resumo desta conta">
      {(["obtained", "boundary", "missing", "unknown"] as CoverageStatus[]).map((status) => <div key={status}>
        <i className={styles[status]} />
        <span>{statusLabels[status]}</span>
        <strong>{account.totals[status]}</strong>
      </div>)}
    </section>

    <div className={styles.columns}>
      <section className={styles.panel}>
        <h2>Evidência histórica da existência</h2>
        <div className={styles.timeline}>
          {account.evidence.map((evidence) => <article key={evidence.id}>
            <time>{fullMonth(evidence.date)}</time>
            <h3>{evidence.title}</h3>
            <p>{evidence.description}</p>
            {evidence.document && <a href={evidence.document.url} target="_blank" rel="noreferrer">{evidence.document.name}<span aria-hidden>↗</span></a>}
          </article>)}
        </div>
      </section>

      <section className={`${styles.panel} ${styles.gapPanel}`}>
        <h2>Lacunas no período esperado</h2>
        {account.gaps.length ? account.gaps.map((gap) => <article key={`${gap.from}-${gap.to}`}>
          <strong>{gap.dates ?? monthRange(gap.from, gap.to)}</strong>
          <p>{gap.reason}</p>
        </article>) : <div className={styles.emptyGap}><strong>Nenhuma lacuna confirmada</strong><span>Consulte o histórico abaixo para ver os meses parciais e os períodos ainda incertos.</span></div>}
      </section>
    </div>

    <section className={styles.monthHistory}>
      <div className={styles.sectionHeading}><div><h2>Histórico mês a mês</h2><p>Vermelho indica prazo esperado sem documento. Cinza fica fora da existência comprovada.</p></div></div>
      {years.map((year) => <div className={styles.yearRow} key={year.year}>
        <strong className={styles.year}>{year.year}</strong>
        <div className={styles.months}>
          {year.cells.map((cell) => {
            const content = <><span>{shortMonths[Number(cell.month.slice(5)) - 1]}</span><b>{statusLabels[cell.status]}</b><small>{cell.documents.length ? `${cell.documents.length} doc.` : "sem arquivo"}</small></>;
            return cell.documents[0]
              ? <a key={cell.month} className={`${styles.monthCard} ${styles[cell.status]}`} href={cell.documents[0].url} target="_blank" rel="noreferrer" title={`${fullMonth(cell.month)} — ${cell.reason}`}>{content}</a>
              : <div key={cell.month} className={`${styles.monthCard} ${styles[cell.status]}`} title={`${fullMonth(cell.month)} — ${cell.reason}`}>{content}</div>;
          })}
        </div>
      </div>)}
    </section>

    <section className={styles.documents}>
      <div className={styles.sectionHeading}><div><h2>Documentos vinculados</h2><p>{documents.length} arquivo(s) sustentam a classificação desta conta.</p></div></div>
      {documents.length ? <div className={styles.documentList}>{documents.map((document) => <a key={document.id} href={document.url} target="_blank" rel="noreferrer"><span><strong>{document.name}</strong><small>{document.period}</small></span><b aria-hidden>↗</b></a>)}</div> : <div className={styles.noDocuments}>Ainda não há arquivo bancário vinculado a esta conta. As evidências acima vêm do inventário histórico.</div>}
    </section>
  </main>;
}
