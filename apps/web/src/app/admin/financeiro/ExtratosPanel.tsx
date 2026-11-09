"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { BRANDS, BRAND_LABELS, CATEGORY_LABELS } from "@/lib/financeiro/engine";
import styles from "./financeiro.module.css";

type Status = "pending" | "posted" | "ignored" | "all";
interface BankRow {
  id: number;
  brand: string;
  bank: string;
  account: string;
  postedDate: string;
  amountCents: number;
  description: string;
  counterparty: string | null;
  document: string | null;
  status: "pending" | "posted" | "ignored";
  category: string | null;
  rule: string | null;
}
interface Data {
  rows: BankRow[];
  counts: Record<string, number>;
  accounts: { brand: string; bank: string; account: string; first: string; last: string; n: number }[];
}
const DEBIT = ["purchase", "packaging", "delivery", "marketplace", "fees", "tax", "payroll", "rent", "utilities", "marketing", "admin", "maintenance", "operating", "financial", "investment", "loan", "withdrawal", "other"];
const CREDIT = ["ifood", "sales", "financial", "loan", "other"];
const STATUS_TABS: [Status, string][] = [
  ["pending", "A revisar"],
  ["posted", "Lançados"],
  ["ignored", "Ignorados"],
  ["all", "Todos"],
];
const money = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dateBr = (d: string) => d.slice(0, 10).split("-").reverse().join("/");
const maskDoc = (d: string | null) => (d ? (d.length === 11 ? `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**` : d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5")) : "");

async function fetchExtratos(s: Status): Promise<Data | { error: string }> {
  const r = await fetch(`/api/admin/financeiro/extratos?status=${s}`, { cache: "no-store" }).catch(() => null);
  const body = r ? await r.json().catch(() => ({})) : {};
  return r?.ok ? (body as Data) : { error: body.error ?? "Falha ao ler os extratos." };
}

export function ExtratosPanel() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("pending");
  const [data, setData] = useState<Data | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [remember, setRemember] = useState(true);

  const load = useCallback(async (s: Status) => {
    const r = await fetchExtratos(s);
    if ("error" in r) setMessage({ tone: "error", text: r.error });
    else setData(r);
  }, []);
  useEffect(() => {
    let alive = true;
    fetchExtratos(status).then((r) => {
      if (!alive) return;
      if ("error" in r) setMessage({ tone: "error", text: r.error });
      else setData(r);
    });
    return () => {
      alive = false;
    };
  }, [status]);

  async function upload(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const file = form.get("ofx");
    if (!(file instanceof File) || !file.size) return setMessage({ tone: "error", text: "Escolha o arquivo OFX do extrato." });
    setBusy(true);
    // OFX antigo costuma vir em Latin-1; tenta UTF-8 e cai para Latin-1 se houver caractere inválido.
    const buf = await file.arrayBuffer();
    let ofx = new TextDecoder("utf-8").decode(buf);
    if (ofx.includes("�")) ofx = new TextDecoder("windows-1252").decode(buf);
    const r = await fetch("/api/admin/financeiro/extratos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brand: form.get("brand"), bank: form.get("bank"), ofx }),
    });
    const body = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setMessage({ tone: "error", text: body.error ?? "Falha ao importar." });
    setMessage({
      tone: "ok",
      text: `${body.novos} lançamento(s) novos de ${body.total} (${body.repetidos} já importados): ${body.lancados} lançados, ${body.ignorados} ignorados, ${body.revisar} para revisar.`,
    });
    (e.target as HTMLFormElement).reset();
    await load(status);
    router.refresh();
  }

  async function classify(row: BankRow, action: "post" | "ignore" | "review", category?: string) {
    setBusy(true);
    const r = await fetch("/api/admin/financeiro/extratos", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: row.id, action, category: category ?? null, remember }),
    });
    const body = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setMessage({ tone: "error", text: body.error ?? "Falha ao classificar." });
    setMessage({ tone: "ok", text: body.applied > 1 ? `Classificado, e a regra valeu para mais ${body.applied - 1} lançamento(s) do mesmo favorecido.` : "Classificado." });
    await load(status);
    router.refresh();
  }

  return (
    <>
      <section className={styles.card}>
        <div className={styles.cardBar}>
          <span>Importar extrato bancário (OFX) · as despesas e repasses viram lançamentos do ERP</span>
        </div>
        <form className={styles.uploadForm} onSubmit={upload}>
          <label>
            Loja dona da conta
            <select name="brand" defaultValue="barbacue">
              {BRANDS.map((b) => (
                <option key={b} value={b}>
                  {BRAND_LABELS[b]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Banco
            <input name="bank" placeholder="C6, Itaú, Inter…" required minLength={2} maxLength={60} list="bancos" />
            <datalist id="bancos">
              <option value="C6" />
              <option value="Itaú" />
              <option value="Inter" />
              <option value="Rede" />
            </datalist>
          </label>
          <label>
            Arquivo OFX
            <input name="ofx" type="file" accept=".ofx,.OFX,application/x-ofx,text/plain" required />
          </label>
          <button className={styles.primary} disabled={busy}>
            {busy ? "Importando…" : "Importar extrato"}
          </button>
        </form>
        <p className={styles.help}>
          Cada linha passa pelas regras: imposto (DAS), folha (FGTS/INSS), tarifas, aluguel, contas de consumo, fornecedores
          conhecidos, iFood e maquininha. Valor igual a uma conta em aberto do ERP da mesma categoria (até 10 dias de diferença) baixa
          a conta em vez de criar outra. Créditos de cliente e de maquininha são ignorados porque as vendas já entram pelos pedidos. O que
          não tiver regra fica em “A revisar”. Reimportar o mesmo arquivo não duplica.
        </p>
        {data?.accounts.length ? (
          <ul className={styles.accounts}>
            {data.accounts.map((a) => (
              <li key={`${a.bank}|${a.account}`}>
                <strong>
                  {a.bank} · conta ***{a.account.slice(-4)}
                </strong>{" "}
                ({BRAND_LABELS[a.brand as keyof typeof BRAND_LABELS] ?? a.brand}) · {a.n} lançamentos de {dateBr(a.first)} a {dateBr(a.last)}
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {message && (
        <p role="status" className={message.tone === "error" ? styles.errorMsg : styles.okMsg}>
          {message.text}
        </p>
      )}

      <section className={styles.card}>
        <div className={styles.cardBar}>
          <div className={styles.cardActions} role="tablist" aria-label="Situação do extrato">
            {STATUS_TABS.map(([s, label]) => (
              <button key={s} role="tab" aria-selected={status === s} className={status === s ? styles.chipOn : styles.chip} onClick={() => setStatus(s)}>
                {label}
                {s !== "all" && data?.counts[s] ? ` (${data.counts[s]})` : ""}
              </button>
            ))}
          </div>
          <label className={styles.remember}>
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Lembrar a escolha para o mesmo favorecido
          </label>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.bankTable}>
            <thead>
              <tr>
                <th>Data</th>
                <th>Loja · banco</th>
                <th>Favorecido / histórico</th>
                <th>Valor</th>
                <th>Classificação</th>
              </tr>
            </thead>
            <tbody>
              {data?.rows.length ? (
                data.rows.map((r) => (
                  <tr key={r.id} data-bank-row={r.id}>
                    <td>{dateBr(r.postedDate)}</td>
                    <td>
                      {BRAND_LABELS[r.brand as keyof typeof BRAND_LABELS] ?? r.brand} · {r.bank}
                    </td>
                    <td>
                      <div className={styles.bankDesc}>{r.counterparty || r.description}</div>
                      <small>
                        {[maskDoc(r.document), r.rule].filter(Boolean).join(" · ")}
                      </small>
                    </td>
                    <td className={r.amountCents < 0 ? styles.neg : styles.pos}>{money(r.amountCents)}</td>
                    <td>
                      <div className={styles.classify}>
                        <select
                          aria-label={`Categoria de ${r.counterparty || r.description}`}
                          value={r.status === "posted" ? r.category ?? "" : r.status === "ignored" ? "__ignore" : ""}
                          disabled={busy}
                          onChange={(e) => {
                            const v = e.target.value;
                            if (v === "__ignore") void classify(r, "ignore");
                            else if (v === "__review") void classify(r, "review");
                            else if (v) void classify(r, "post", v);
                          }}
                        >
                          <option value="" disabled>
                            Escolha…
                          </option>
                          {(r.amountCents < 0 ? DEBIT : CREDIT).map((c) => (
                            <option key={c} value={c}>
                              {CATEGORY_LABELS[c] ?? c}
                            </option>
                          ))}
                          <option value="__ignore">Ignorar (venda já contada ou transferência)</option>
                          {r.status !== "pending" && <option value="__review">Voltar para revisão</option>}
                        </select>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className={styles.muted}>
                    {data ? "Nenhum lançamento nesta situação." : "Carregando…"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
