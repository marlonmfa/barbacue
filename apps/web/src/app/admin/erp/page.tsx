"use client";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
  Fragment,
} from "react";
import type { erpSnapshot } from "@/lib/erp";
import styles from "./erp.module.css";

type Data = Awaited<ReturnType<typeof erpSnapshot>>;
type Row = Record<string, unknown>;
type Form = { action: string; title: string; values: Row };
type Part = {
  ingredientId: number;
  quantityMilli: number;
  unitCostCents?: number;
};
const tabs = [
  ["overview", "Resumo"],
  ["finance", "Financeiro"],
  ["tax", "Impostos"],
  ["purchases", "Compras"],
  ["ingredients", "Estoque"],
  ["recipes", "Receitas"],
  ["suppliers", "Fornecedores"],
  ["hr", "RH"],
  ["audit", "Histórico"],
] as const;
type Tab = (typeof tabs)[number][0];
const money = (v: number) =>
  (v / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const quantity = (v: number) =>
  (v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
const today = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(
    new Date(),
  );
const dateLabel = (v: unknown) =>
  v ? String(v).slice(0, 10).split("-").reverse().join("/") : "—";
const labels: Record<string, string> = {
  open: "Em aberto",
  settled: "Baixado",
  cancelled: "Cancelado",
  draft: "Rascunho",
  received: "Recebida",
  review: "Revisar ficha",
  ready: "Aprovada",
  planned: "Planejado",
  approved: "Aprovado",
  vacation: "Férias",
  medical: "Atestado",
  absence: "Falta",
  other: "Outros",
  operating: "Operacional",
  tax: "Imposto",
  payroll: "Folha",
  purchase: "Compra",
  payable: "A pagar",
  receivable: "A receber",
  pix: "Pix",
  boleto: "Boleto",
  transfer: "Transferência",
  cash: "Dinheiro",
  card: "Cartão",
};
const operationLabels: Record<string, string> = {
  "supplier.save": "Cadastro de fornecedor",
  "ingredient.save": "Cadastro de insumo",
  "stock.adjust": "Ajuste de estoque",
  "purchase.save": "Cadastro de compra",
  "purchase.receive": "Recebimento de compra",
  "purchase.cancel": "Cancelamento de compra",
  "recipe.save": "Revisão de ficha técnica",
  "recipe.seed": "Importação dos cardápios",
  "recipe.produce": "Consumo para produção",
  "finance.save": "Lançamento financeiro",
  "finance.settle": "Registro de pagamento ou recebimento",
  "finance.cancel": "Cancelamento financeiro",
  "payroll.create": "Lançamento de folha",
  "attendance.save": "Registro ou correção de ponto",
  "leave.save": "Férias ou afastamento",
};
function Badge({ value }: { value: string }) {
  return (
    <span
      className={`${styles.badge} ${["review", "open", "draft"].includes(value) ? styles.warn : ""}`}
    >
      {labels[value] || value}
    </span>
  );
}
function Table({ heads, rows }: { heads: string[]; rows: ReactNode[][] }) {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            {heads.map((h) => (
              <th key={h} scope="col">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((r, i) => (
              <tr key={i}>
                {r.map((v, j) => (
                  <td key={j}>{v}</td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={heads.length} className={styles.empty}>
                Nenhum registro encontrado. Use os botões acima para cadastrar.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function ErpPage() {
  const [data, setData] = useState<Data | null>(null),
    [tab, setTab] = useState<Tab>("overview"),
    [brand, setBrand] = useState("all"),
    [search, setSearch] = useState("");
  const [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [form, setForm] = useState<Form | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const retry = useRef<{ payload: string; requestId: string } | null>(null);
  const load = useCallback(async () => {
    const res = await fetch("/api/admin/erp", { cache: "no-store" });
    const body = await res.json();
    if (!res.ok)
      throw new Error(
        typeof body.error === "string"
          ? body.error
          : "Não foi possível carregar o ERP.",
      );
    setData(body);
  }, []);
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [load]);
  useEffect(() => {
    if (formRef.current) {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      formRef.current
        ?.querySelector<HTMLInputElement>("input,select,textarea")
        ?.focus();
    }
  }, [form?.action, form?.values.id]);
  async function run(command: Row) {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    const payload = JSON.stringify(command);
    if (retry.current?.payload !== payload)
      retry.current = { payload, requestId: crypto.randomUUID() };
    try {
      const res = await fetch("/api/admin/erp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: retry.current.requestId, command }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Não foi possível salvar.");
      retry.current = null;
      setForm(null);
      setMessage(
        command.action === "recipe.seed"
          ? `${body.imported} novas fichas cadastradas. As fichas existentes foram preservadas.`
          : "Registro salvo com sucesso.",
      );
      await load();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Falha na conexão. Tente novamente.",
      );
    } finally {
      setBusy(false);
    }
  }
  function open(action: string, title: string, values: Row = {}) {
    setError("");
    setMessage("");
    setForm({ action, title, values });
  }
  function set(key: string, value: unknown) {
    setForm((f) => f && { ...f, values: { ...f.values, [key]: value } });
  }
  const v = form?.values || {};
  function field(
    key: string,
    label: string,
    type = "text",
    required = true,
    scale = 1,
  ) {
    const raw = v[key];
    const value =
      raw == null ? "" : scale !== 1 ? Number(raw) / scale : String(raw);
    return (
      <label className={styles.field} key={key}>
        {label}
        <input
          type={type}
          value={value}
          required={required}
          step={
            scale === 100
              ? ".01"
              : scale === 1000
                ? ".001"
                : type === "number"
                  ? "1"
                  : undefined
          }
          min={type === "number" && key !== "quantityMilli" ? "0" : undefined}
          onChange={(e) =>
            set(
              key,
              type === "number"
                ? e.target.value === ""
                  ? undefined
                  : Math.round(Number(e.target.value) * scale)
                : e.target.value,
            )
          }
        />
      </label>
    );
  }
  function select(
    key: string,
    label: string,
    options: { value: string | number; label: string }[],
  ) {
    return (
      <label className={styles.field} key={key}>
        {label}
        <select
          value={String(v[key] ?? "")}
          required
          onChange={(e) =>
            set(
              key,
              ["ingredientId", "employeeId", "supplierId"].includes(key)
                ? Number(e.target.value)
                : key === "active"
                  ? e.target.value === "true"
                  : e.target.value,
            )
          }
        >
          <option value="">Selecione</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    );
  }
  function text(key: string, label: string) {
    return (
      <label className={`${styles.field} ${styles.wide}`} key={key}>
        {label}
        <textarea
          value={String(v[key] || "")}
          onChange={(e) => set(key, e.target.value)}
        />
      </label>
    );
  }
  const brandOptions = ["barbacue", "barbadog", "chelas"].map((b) => ({
    value: b,
    label:
      b === "barbacue" ? "Barbacue" : b === "barbadog" ? "Barbadog" : "Chelas",
  }));
  const enumOptions = (...keys: string[]) =>
    keys.map((k) => ({ value: k, label: labels[k] || k }));
  const employees =
    data?.employees.map((e) => ({
      value: e.id,
      label: `${e.name}${e.active ? "" : " (inativo)"}`,
    })) || [];
  const insumos =
    data?.ingredients
      .filter((i) => i.active)
      .map((i) => ({ value: i.id, label: `${i.name} (${i.unit})` })) || [];
  const employeeName = (id: number) =>
    data?.employees.find((e) => e.id === id)?.name || `#${id}`;
  const ingredientName = (id: number) => {
    const i = data?.ingredients.find((i) => i.id === id);
    return i ? `${i.name} (${i.unit})` : `#${id}`;
  };
  const inBrand = (r: { brand: string }) =>
    brand === "all" || r.brand === brand;
  const matches = (r: unknown) =>
    !search ||
    JSON.stringify(r)
      .toLocaleLowerCase("pt-BR")
      .includes(search.toLocaleLowerCase("pt-BR"));
  const chosenBrand = brand === "all" ? "barbacue" : brand;
  function edit(action: string, title: string, row: object) {
    open(action, title, { ...row });
  }
  function actions(children: ReactNode) {
    return <div className={styles.actions}>{children}</div>;
  }
  const btn = (label: string, click: () => void) => (
    <button type="button" disabled={busy} onClick={click}>
      {label}
    </button>
  );
  function lineEditor(key: "lines" | "parts") {
    const lines = (v[key] || []) as Part[];
    function patch(index: number, values: Partial<Part>) {
      set(
        key,
        lines.map((l, i) => (i === index ? { ...l, ...values } : l)),
      );
    }
    return (
      <div className={styles.lines}>
        <p>
          Quantidades na unidade do insumo: kg, litro ou unidade. Exemplo: 150 g
          = 0,150 kg.
        </p>
        {lines.map((l, i) => (
          <div className={styles.line} key={i}>
            <label className={styles.field}>
              Insumo
              <select
                value={l.ingredientId || ""}
                required
                onChange={(e) =>
                  patch(i, { ingredientId: Number(e.target.value) })
                }
              >
                <option value="">Selecione</option>
                {insumos.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              Quantidade
              <input
                aria-label={`Quantidade do insumo ${i + 1}`}
                type="number"
                min=".001"
                step=".001"
                required
                value={l.quantityMilli / 1000 || ""}
                onChange={(e) =>
                  patch(i, {
                    quantityMilli: Math.round(Number(e.target.value) * 1000),
                  })
                }
              />
            </label>
            {key === "lines" ? (
              <label className={styles.field}>
                Custo por unidade (R$)
                <input
                  type="number"
                  min="0"
                  step=".01"
                  required
                  value={(l.unitCostCents || 0) / 100}
                  onChange={(e) =>
                    patch(i, {
                      unitCostCents: Math.round(Number(e.target.value) * 100),
                    })
                  }
                />
              </label>
            ) : (
              <span />
            )}
            {btn("Remover", () =>
              set(
                key,
                lines.filter((_, j) => j !== i),
              ),
            )}
          </div>
        ))}
        {btn("Adicionar insumo", () =>
          set(key, [
            ...lines,
            {
              ingredientId: 0,
              quantityMilli: 0,
              ...(key === "lines" ? { unitCostCents: 0 } : {}),
            },
          ]),
        )}
      </div>
    );
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    const values = { ...v };
    if (form.action === "finance.save" && !values.competence)
      delete values.competence;
    if (form.action === "attendance.save") {
      for (const key of ["startAt", "endAt"])
        values[key] = new Date(String(values[key])).toISOString();
    }
    await run({ ...values, action: form.action });
  }
  function renderForm() {
    if (!form) return null;
    let fields: ReactNode;
    const a = form.action;
    if (a === "supplier.save")
      fields = (
        <>
          {field("name", "Nome do fornecedor")}
          {field("document", "CPF/CNPJ", "text", false)}
          {field("contact", "Telefone / e-mail", "text", false)}
          {select("active", "Situação", [
            { value: "true", label: "Ativo" },
            { value: "false", label: "Inativo" },
          ])}
          {text("notes", "Observações")}
        </>
      );
    if (a === "ingredient.save")
      fields = (
        <>
          {field("name", "Nome do insumo")}
          {select(
            "unit",
            "Unidade (fixa após cadastro)",
            enumOptions("kg", "l", "un"),
          )}
          {field("minimumMilli", "Estoque mínimo", "number", true, 1000)}
          {field(
            "unitCostCents",
            "Custo por kg, litro ou unidade (R$)",
            "number",
            true,
            100,
          )}
          {select("active", "Situação", [
            { value: "true", label: "Ativo" },
            { value: "false", label: "Inativo" },
          ])}
        </>
      );
    if (a === "stock.adjust")
      fields = (
        <>
          {select("ingredientId", "Insumo", insumos)}
          {field(
            "quantityMilli",
            "Quantidade (+ entrada / − perda ou saída)",
            "number",
            true,
            1000,
          )}
          {field("reason", "Motivo do ajuste")}
        </>
      );
    if (a === "purchase.save")
      fields = (
        <>
          {select(
            "supplierId",
            "Fornecedor",
            data?.suppliers
              .filter((s) => s.active)
              .map((s) => ({ value: s.id, label: s.name })) || [],
          )}
          {select("brand", "Marca", brandOptions)}
          {field("dueDate", "Vencimento", "date")}
          {field("invoice", "Número / referência da nota", "text", false)}
        </>
      );
    if (a === "recipe.save")
      fields = (
        <>
          {field("name", "Nome da receita")}
          {select("brand", "Marca", brandOptions)}
          {field("category", "Categoria", "text", false)}
          {field(
            "salePriceCents",
            "Preço de venda por porção (R$)",
            "number",
            true,
            100,
          )}
          {field("yieldPortions", "Rendimento em porções", "number")}
          {select("status", "Revisão", enumOptions("review", "ready"))}
          {text("description", "Descrição do cardápio (referência)")}
          {text("instructions", "Modo de preparo confirmado pela cozinha")}
        </>
      );
    if (a === "recipe.produce")
      fields = (
        <>
          {field("batches", "Quantidade de lotes", "number")}
          <p>
            A confirmação consome os insumos de todos os lotes no estoque. Não é
            feita baixa automática pelos pedidos.
          </p>
        </>
      );
    if (a === "finance.save")
      fields = (
        <>
          {field("description", "Descrição")}
          {select("brand", "Marca", brandOptions)}
          {select("kind", "Tipo", enumOptions("payable", "receivable"))}
          {select(
            "category",
            "Categoria",
            enumOptions("operating", "tax", "other"),
          )}
          {field("amountCents", "Valor (R$)", "number", true, 100)}
          {field("dueDate", "Vencimento", "date")}
          {field("competence", "Competência", "month", v.category === "tax")}
          {field(
            "document",
            "Guia, código de barras ou referência",
            "text",
            v.category === "tax",
          )}
        </>
      );
    if (a === "finance.settle")
      fields = (
        <>
          <p className={styles.wide}>
            Registre somente um pagamento ou recebimento já realizado. Esta ação
            não transfere dinheiro.
          </p>
          {field("settledDate", "Data efetiva", "date")}
          {select(
            "paymentMethod",
            "Forma de pagamento",
            enumOptions("pix", "boleto", "transfer", "cash", "card"),
          )}
          {field("receipt", "Referência do comprovante ou link")}
        </>
      );
    if (a === "payroll.create")
      fields = (
        <>
          {select("employeeId", "Funcionário", employees)}
          {field("competence", "Competência", "month")}
          {field("dueDate", "Vencimento", "date")}
          {field(
            "additionsCents",
            "Adicionais e benefícios (R$)",
            "number",
            true,
            100,
          )}
          {field(
            "deductionsCents",
            "Descontos e retenções (R$)",
            "number",
            true,
            100,
          )}
          {text("notes", "Discriminação dos valores / referência da folha")}
          <p className={styles.wide}>
            Base salarial:{" "}
            {money(
              data?.employees.find((e) => e.id === v.employeeId)?.salaryCents ||
                0,
            )}
            . Adicionais e descontos são informados conforme a folha conferida.
            Não há cálculo automático de encargos ou envio ao eSocial. O
            lançamento gera uma conta a pagar e não pode ser duplicado na
            competência.
          </p>
        </>
      );
    if (a === "attendance.save")
      fields = (
        <>
          {select("employeeId", "Funcionário", employees)}
          {field(
            "startAt",
            "Entrada (horário deste dispositivo)",
            "datetime-local",
          )}
          {field(
            "endAt",
            "Saída (horário deste dispositivo)",
            "datetime-local",
          )}
          {field("breakMinutes", "Intervalo (minutos)", "number")}
          {text("notes", "Observações / correção")}
        </>
      );
    if (a === "leave.save")
      fields = (
        <>
          {select("employeeId", "Funcionário", employees)}
          {select(
            "kind",
            "Tipo",
            enumOptions("vacation", "medical", "absence", "other"),
          )}
          {field("startDate", "Início", "date")}
          {field("endDate", "Fim", "date")}
          {select(
            "status",
            "Situação",
            enumOptions("planned", "approved", "cancelled"),
          )}
          {text("notes", "Observações")}
        </>
      );
    return (
      <form ref={formRef} className={styles.form} onSubmit={submit}>
        <h3>{form.title}</h3>
        <fieldset disabled={busy}>
          <div className={styles.grid}>{fields}</div>
          {a === "purchase.save" && lineEditor("lines")}
          {a === "recipe.save" && lineEditor("parts")}
          <div className={styles.toolbar}>
            <button className={styles.primary} type="submit">
              {busy
                ? "Salvando…"
                : a === "finance.settle"
                  ? "Confirmar registro da baixa"
                  : a === "recipe.produce"
                    ? "Confirmar consumo de insumos"
                    : "Salvar"}
            </button>
            {btn("Fechar", () => setForm(null))}
          </div>
        </fieldset>
      </form>
    );
  }
  function exportCsv() {
    if (!data) return;
    const rows = data.finance.filter(inBrand);
    const escape = (v: unknown) =>
      '"' +
      String(v ?? "")
        .replace(/^[=+@-]/, "'$&")
        .replaceAll('"', '""') +
      '"';
    const csv = [
      [
        "ID",
        "Marca",
        "Tipo",
        "Categoria",
        "Descrição",
        "Valor em centavos",
        "Vencimento",
        "Status",
        "Data da baixa",
        "Comprovante",
      ],
      ...rows.map((r) => [
        r.id,
        r.brand,
        labels[r.kind],
        labels[r.category],
        r.description,
        r.amountCents,
        r.dueDate,
        labels[r.status],
        r.settledDate,
        r.receipt,
      ]),
    ]
      .map((r) => r.map(escape).join(";"))
      .join("\r\n");
    const url = URL.createObjectURL(
      new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `financeiro-${today()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  const financial = data?.finance.filter(inBrand) || [];
  const openFinance = financial.filter((f) => f.status === "open");
  const sum = (rows: Data["finance"]) =>
    rows.reduce((s, r) => s + r.amountCents, 0);
  const newFinance = () =>
    open(
      "finance.save",
      tab === "tax" ? "Cadastrar obrigação tributária" : "Novo lançamento",
      {
        brand: chosenBrand,
        kind: "payable",
        category: tab === "tax" ? "tax" : "operating",
        dueDate: today(),
        competence: today().slice(0, 7),
        amountCents: 0,
      },
    );
  const financeRows = (rows: Data["finance"]) =>
    rows.map((f) => [
      <Fragment key="description">
        <strong>{f.description}</strong>
        <small>
          {f.brand} · {labels[f.category]}
          {f.competence ? ` · ${f.competence}` : ""}
        </small>
        {f.document && <small>Documento: {f.document}</small>}
        {f.receipt && (
          <small>
            Comprovante: {f.receipt} · {dateLabel(f.settledDate)}
          </small>
        )}
      </Fragment>,
      labels[f.kind],
      money(f.amountCents),
      <span
        key="due"
        className={
          f.status === "open" && f.dueDate < today() ? styles.warn : ""
        }
      >
        {dateLabel(f.dueDate)}
        {f.status === "open" && f.dueDate < today() && <small>Vencido</small>}
      </span>,
      <Badge key="status" value={f.status} />,
      actions(
        f.status === "open" && (
          <>
            {btn("Registrar baixa", () =>
              open(
                "finance.settle",
                `Baixa: ${f.description} — ${money(f.amountCents)}`,
                {
                  id: f.id,
                  settledDate: today(),
                  paymentMethod: "pix",
                  receipt: "",
                },
              ),
            )}
            {!f.sourceKey && (
              <>
                {btn("Editar", () =>
                  edit("finance.save", "Editar lançamento", f),
                )}
                {btn("Cancelar", () => {
                  if (window.confirm(`Cancelar o lançamento ${f.description}?`))
                    void run({ action: "finance.cancel", id: f.id });
                })}
              </>
            )}
          </>
        ),
      ),
    ]);
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>Gestão do restaurante</h1>
          <p>
            Compras, cozinha, pessoas e contas das três marcas em um só lugar.
          </p>
        </div>
        <Link href="/admin/team">Funcionários e escalas</Link>
      </header>
      <div className={styles.tabs} role="tablist" aria-label="Módulos do ERP">
        {tabs.map(([id, label]) => (
          <button
            role="tab"
            key={id}
            aria-selected={tab === id}
            onClick={() => {
              setTab(id);
              setForm(null);
              setSearch("");
              setError("");
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {error && (
        <div className={styles.error} role="alert">
          {error}{" "}
          {!data &&
            btn("Tentar novamente", () =>
              load().catch((e) => setError(e.message)),
            )}
        </div>
      )}
      {message && (
        <div className={styles.success} role="status">
          {message}
        </div>
      )}
      {!data ? (
        <p>
          {error ? "Os dados não estão disponíveis." : "Carregando a gestão…"}
        </p>
      ) : (
        <>
          <div className={styles.toolbar}>
            <label>
              Marca{" "}
              <select
                aria-label="Filtrar por marca"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
              >
                <option value="all">Todas as marcas</option>
                {brandOptions.map((b) => (
                  <option key={b.value} value={b.value}>
                    {b.label}
                  </option>
                ))}
              </select>
            </label>
            <input
              aria-label="Buscar registros"
              placeholder="Buscar registros"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {btn("Exportar financeiro CSV", exportCsv)}
          </div>
          {renderForm()}
          {tab === "overview" && (
            <>
              <div className={styles.stats}>
                <div>
                  <span>Contas a pagar em aberto</span>
                  <strong>
                    {money(
                      sum(openFinance.filter((f) => f.kind === "payable")),
                    )}
                  </strong>
                </div>
                <div>
                  <span>Contas a receber em aberto</span>
                  <strong>
                    {money(
                      sum(openFinance.filter((f) => f.kind === "receivable")),
                    )}
                  </strong>
                </div>
                <div>
                  <span>Obrigações vencidas</span>
                  <strong>
                    {
                      openFinance.filter(
                        (f) => f.kind === "payable" && f.dueDate < today(),
                      ).length
                    }
                  </strong>
                </div>
                <div>
                  <span>Insumos no mínimo</span>
                  <strong>
                    {
                      data.ingredients.filter(
                        (i) => i.active && i.stockMilli <= i.minimumMilli,
                      ).length
                    }
                  </strong>
                </div>
              </div>
              <div className={styles.notice}>
                O estoque é compartilhado pelas marcas.{" "}
                {
                  data.recipes
                    .filter(inBrand)
                    .filter((r) => r.status === "review").length
                }{" "}
                fichas aguardam revisão da cozinha. Compras recebidas e folhas
                lançadas já aparecem nas contas a pagar.
              </div>
              <h2>Caixa e vendas</h2>
              <p>
                Valores acumulados de todo o período. Vendas pagas são exibidas
                separadamente dos lançamentos manuais para evitar dupla
                contagem. Não recadastre a venda como recebimento manual.
              </p>
              <div className={styles.stats}>
                <div>
                  <span>Pedidos pagos (exceto cancelados)</span>
                  <strong>
                    {money(
                      data.sales
                        .filter(inBrand)
                        .reduce((s, r) => s + Number(r.totalCents), 0),
                    )}
                  </strong>
                </div>
                <div>
                  <span>Recebimentos registrados</span>
                  <strong>
                    {money(
                      sum(
                        financial.filter(
                          (f) =>
                            f.kind === "receivable" && f.status === "settled",
                        ),
                      ),
                    )}
                  </strong>
                </div>
                <div>
                  <span>Pagamentos registrados</span>
                  <strong>
                    {money(
                      sum(
                        financial.filter(
                          (f) => f.kind === "payable" && f.status === "settled",
                        ),
                      ),
                    )}
                  </strong>
                </div>
                <div>
                  <span>Saldo dos lançamentos</span>
                  <strong>
                    {money(
                      sum(
                        financial.filter(
                          (f) =>
                            f.kind === "receivable" && f.status === "settled",
                        ),
                      ) -
                        sum(
                          financial.filter(
                            (f) =>
                              f.kind === "payable" && f.status === "settled",
                          ),
                        ),
                    )}
                  </strong>
                </div>
              </div>
              <div className={styles.toolbar}>
                <h2>Próximos vencimentos</h2>
              </div>
              <Table
                heads={[
                  "Descrição",
                  "Tipo",
                  "Valor",
                  "Vencimento",
                  "Situação",
                  "Ações",
                ]}
                rows={financeRows(openFinance.filter(matches).slice(0, 15))}
              />
            </>
          )}
          {(tab === "finance" || tab === "tax") && (
            <>
              <div className={styles.toolbar}>
                <h2>
                  {tab === "tax"
                    ? "Obrigações tributárias"
                    : "Contas a pagar e receber"}
                </h2>
                {btn("Novo lançamento", newFinance)}
              </div>
              {tab === "tax" && (
                <div className={styles.notice}>
                  Cadastre a guia emitida pela contabilidade, a competência e o
                  vencimento. Após pagar no banco, registre a baixa e a
                  referência do comprovante. O sistema não emite guias, calcula
                  tributos ou executa pagamentos bancários.
                </div>
              )}
              <Table
                heads={[
                  "Descrição",
                  "Tipo",
                  "Valor",
                  "Vencimento",
                  "Situação",
                  "Ações",
                ]}
                rows={financeRows(
                  financial.filter(
                    (f) =>
                      (tab !== "tax" || f.category === "tax") && matches(f),
                  ),
                )}
              />
            </>
          )}
          {tab === "suppliers" && (
            <>
              <div className={styles.toolbar}>
                <h2>Fornecedores</h2>
                {btn("Cadastrar fornecedor", () =>
                  open("supplier.save", "Novo fornecedor", { active: true }),
                )}
              </div>
              <Table
                heads={[
                  "Fornecedor",
                  "Documento",
                  "Contato",
                  "Situação",
                  "Ações",
                ]}
                rows={data.suppliers
                  .filter(matches)
                  .map((s) => [
                    s.name,
                    s.document,
                    s.contact,
                    s.active ? "Ativo" : "Inativo",
                    btn("Editar", () =>
                      edit("supplier.save", "Editar fornecedor", s),
                    ),
                  ])}
              />
            </>
          )}
          {tab === "ingredients" && (
            <>
              <div className={styles.toolbar}>
                <h2>Insumos e estoque</h2>
                {btn("Cadastrar insumo", () =>
                  open("ingredient.save", "Novo insumo", {
                    unit: "kg",
                    minimumMilli: 0,
                    unitCostCents: 0,
                    active: true,
                  }),
                )}
                {btn("Entrada, perda ou ajuste", () =>
                  open("stock.adjust", "Movimentar estoque"),
                )}
              </div>
              <p>
                Estoque compartilhado. O recebimento atualiza o custo médio
                ponderado; perdas e consumo ficam no histórico.
              </p>
              <Table
                heads={[
                  "Insumo",
                  "Saldo",
                  "Mínimo",
                  "Custo / unidade",
                  "Situação",
                  "Ações",
                ]}
                rows={data.ingredients.filter(matches).map((i) => [
                  i.name,
                  <span
                    key="stock"
                    className={
                      i.stockMilli <= i.minimumMilli ? styles.warn : ""
                    }
                  >
                    {quantity(i.stockMilli)} {i.unit}
                  </span>,
                  `${quantity(i.minimumMilli)} ${i.unit}`,
                  money(i.unitCostCents),
                  i.active ? "Ativo" : "Inativo",
                  btn("Editar", () =>
                    edit("ingredient.save", "Editar insumo", i),
                  ),
                ])}
              />
              <div className={styles.toolbar}>
                <h2>Últimas 200 movimentações</h2>
              </div>
              <Table
                heads={["Data", "Insumo", "Quantidade", "Motivo", "Referência"]}
                rows={data.movements.map((m) => [
                  dateLabel(m.createdAt),
                  ingredientName(m.ingredientId),
                  quantity(m.quantityMilli),
                  m.reason,
                  m.reference,
                ])}
              />
            </>
          )}
          {tab === "purchases" && (
            <>
              <div className={styles.toolbar}>
                <h2>Compra de insumos</h2>
                {btn("Nova compra", () =>
                  open("purchase.save", "Cadastrar compra", {
                    brand: chosenBrand,
                    dueDate: today(),
                    lines: [],
                  }),
                )}
              </div>
              <p>
                Cadastre fornecedor e insumos antes da compra. Confirme o
                recebimento para dar entrada no estoque e gerar a conta a pagar.
              </p>
              <Table
                heads={[
                  "Compra / fornecedor",
                  "Insumos",
                  "Valor",
                  "Vencimento",
                  "Situação",
                  "Ações",
                ]}
                rows={data.purchases
                  .filter(inBrand)
                  .filter(matches)
                  .map((p) => [
                    <Fragment key="purchase">
                      #{p.id} ·{" "}
                      {data.suppliers.find((s) => s.id === p.supplierId)?.name}
                      <small>
                        {p.brand} · Nota: {p.invoice || "Não informada"}
                      </small>
                    </Fragment>,
                    p.lines.map((l) => (
                      <small key={l.ingredientId}>
                        {quantity(l.quantityMilli)}{" "}
                        {ingredientName(l.ingredientId)}
                      </small>
                    )),
                    money(p.totalCents),
                    dateLabel(p.dueDate),
                    <Badge key="status" value={p.status} />,
                    actions(
                      p.status === "draft" && (
                        <>
                          {btn("Editar", () =>
                            edit("purchase.save", "Editar compra", p),
                          )}
                          {btn("Receber", () => {
                            if (
                              window.confirm(
                                `Receber compra #${p.id}? O estoque e a conta a pagar de ${money(p.totalCents)} serão lançados.`,
                              )
                            )
                              void run({
                                action: "purchase.receive",
                                id: p.id,
                              });
                          })}
                          {btn("Cancelar", () => {
                            if (
                              window.confirm(
                                "Cancelar esta compra em rascunho?",
                              )
                            )
                              void run({ action: "purchase.cancel", id: p.id });
                          })}
                        </>
                      ),
                    ),
                  ])}
              />
            </>
          )}
          {tab === "recipes" && (
            <>
              <div className={styles.toolbar}>
                <h2>Receitas e fichas técnicas</h2>
                {btn("Nova receita", () =>
                  open("recipe.save", "Nova ficha técnica", {
                    brand: chosenBrand,
                    yieldPortions: 1,
                    salePriceCents: 0,
                    status: "review",
                    parts: [],
                  }),
                )}
                {btn(
                  "Importar novos itens do cardápio",
                  () => void run({ action: "recipe.seed" }),
                )}
              </div>
              <div className={styles.notice}>
                As fichas importadas preservam as descrições dos cardápios.
                Complete insumos, quantidades, rendimento e preparo antes de
                aprovar. O custo e o percentual sobre a venda só são exibidos
                para fichas aprovadas com custos preenchidos.
              </div>
              <Table
                heads={[
                  "Receita",
                  "Rendimento",
                  "Custo / porção",
                  "Custo / venda",
                  "Situação",
                  "Ações",
                ]}
                rows={data.recipes
                  .filter(inBrand)
                  .filter(matches)
                  .map((r) => {
                    const cost =
                      r.parts.reduce(
                        (s, p) =>
                          s +
                          (p.quantityMilli *
                            (data.ingredients.find(
                              (i) => i.id === p.ingredientId,
                            )?.unitCostCents || 0)) /
                            1000,
                        0,
                      ) / r.yieldPortions;
                    const complete =
                      r.status === "ready" &&
                      r.parts.length > 0 &&
                      r.parts.every(
                        (p) =>
                          (data.ingredients.find((i) => i.id === p.ingredientId)
                            ?.unitCostCents || 0) > 0,
                      );
                    return [
                      <Fragment key="recipe">
                        <strong>{r.name}</strong>
                        <small>
                          {r.brand} · {r.category}
                        </small>
                        <small>{r.description}</small>
                      </Fragment>,
                      `${r.yieldPortions} porção(ões)`,
                      complete ? money(Math.round(cost)) : "Pendente",
                      complete && r.salePriceCents > 0
                        ? `${((cost / r.salePriceCents) * 100).toFixed(1)}%`
                        : "—",
                      <Badge key="status" value={r.status} />,
                      actions(
                        <>
                          {btn("Editar ficha", () =>
                            edit("recipe.save", "Ficha técnica", r),
                          )}
                          {r.status === "ready" &&
                            btn("Produzir", () =>
                              open("recipe.produce", `Produzir: ${r.name}`, {
                                id: r.id,
                                batches: 1,
                              }),
                            )}
                        </>,
                      ),
                    ];
                  })}
              />
            </>
          )}
          {tab === "hr" && (
            <>
              <div className={styles.toolbar}>
                <h2>Folha, ponto e afastamentos</h2>
                {btn("Lançar folha", () =>
                  open("payroll.create", "Lançar folha conferida", {
                    competence: today().slice(0, 7),
                    dueDate: today(),
                    additionsCents: 0,
                    deductionsCents: 0,
                  }),
                )}
                {btn("Registrar ponto", () =>
                  open("attendance.save", "Registro manual de ponto", {
                    breakMinutes: 0,
                  }),
                )}
                {btn("Férias ou afastamento", () =>
                  open("leave.save", "Novo afastamento", {
                    kind: "vacation",
                    status: "planned",
                    startDate: today(),
                    endDate: today(),
                  }),
                )}
              </div>
              <p>
                Cadastro de funcionários e escalas em{" "}
                <Link href="/admin/team">Funcionários</Link>. Este é um controle
                administrativo; os cálculos legais da folha e os registros
                oficiais são tratados pela contabilidade.
              </p>
              <Table
                heads={[
                  "Funcionário",
                  "Competência",
                  "Base",
                  "Adicionais",
                  "Descontos",
                  "Líquido",
                  "Pagamento",
                ]}
                rows={data.payroll
                  .filter((p) => {
                    const e = data.employees.find((e) => e.id === p.employeeId);
                    return e && inBrand(e) && matches({ ...p, name: e.name });
                  })
                  .map((p) => [
                    employeeName(p.employeeId),
                    p.competence,
                    money(p.baseCents),
                    money(p.additionsCents),
                    money(p.deductionsCents),
                    money(p.netCents),
                    <Badge
                      key="status"
                      value={
                        data.finance.find((f) => f.id === p.financeId)
                          ?.status || "open"
                      }
                    />,
                  ])}
              />
              <div className={styles.toolbar}>
                <h2>Ponto — últimos 500 registros</h2>
              </div>
              <Table
                heads={[
                  "Funcionário",
                  "Entrada",
                  "Saída",
                  "Horas trabalhadas",
                  "Ações",
                ]}
                rows={data.attendance
                  .filter((a) => {
                    const e = data.employees.find((e) => e.id === a.employeeId);
                    return e && inBrand(e) && matches({ ...a, name: e.name });
                  })
                  .map((a) => [
                    employeeName(a.employeeId),
                    new Date(a.startAt).toLocaleString("pt-BR"),
                    new Date(a.endAt).toLocaleString("pt-BR"),
                    (
                      (new Date(a.endAt).getTime() -
                        new Date(a.startAt).getTime()) /
                        3600000 -
                      a.breakMinutes / 60
                    ).toFixed(2),
                    btn("Corrigir", () => {
                      const local = (d: Date) => {
                        const t = new Date(d);
                        return new Date(
                          t.getTime() - t.getTimezoneOffset() * 60000,
                        )
                          .toISOString()
                          .slice(0, 16);
                      };
                      open("attendance.save", "Corrigir ponto", {
                        ...a,
                        startAt: local(a.startAt),
                        endAt: local(a.endAt),
                      });
                    }),
                  ])}
              />
              <div className={styles.toolbar}>
                <h2>Férias e afastamentos</h2>
              </div>
              <Table
                heads={[
                  "Funcionário",
                  "Tipo",
                  "Início",
                  "Fim",
                  "Situação",
                  "Ações",
                ]}
                rows={data.leaves
                  .filter((l) => {
                    const e = data.employees.find((e) => e.id === l.employeeId);
                    return e && inBrand(e) && matches({ ...l, name: e.name });
                  })
                  .map((l) => [
                    employeeName(l.employeeId),
                    labels[l.kind],
                    dateLabel(l.startDate),
                    dateLabel(l.endDate),
                    <Badge key="status" value={l.status} />,
                    btn("Editar", () =>
                      edit("leave.save", "Editar afastamento", l),
                    ),
                  ])}
              />
            </>
          )}
          {tab === "audit" && (
            <>
              <h2>Últimas 100 operações</h2>
              <p>
                Operações concluídas e usuário responsável. O usuário 0
                representa o administrador principal.
              </p>
              <Table
                heads={["Data", "Operação", "Usuário"]}
                rows={data.audit
                  .filter(matches)
                  .map((a) => [
                    new Date(a.createdAt).toLocaleString("pt-BR"),
                    operationLabels[a.action] || a.action,
                    `#${a.actorId}`,
                  ])}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}
