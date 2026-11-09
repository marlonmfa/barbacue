import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { bankRules, bankTransactions, erpAudit, erpFinance } from "@/db/schema";
import { classifyBankLine, counterpartyKey, type BankAction, type Classification, type LearnedRule } from "./classify";
import { BRANDS, type Brand } from "./engine";
import { parseOfx } from "./ofx";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type BankRow = typeof bankTransactions.$inferSelect;

export class ExtratoError extends Error {
  constructor(message: string, public status = 422) {
    super(message);
  }
}
export const DEBIT_CATEGORIES = [
  "purchase", "packaging", "delivery", "marketplace", "fees", "tax", "payroll", "rent", "utilities",
  "marketing", "admin", "maintenance", "operating", "financial", "investment", "loan", "withdrawal", "other",
] as const;
export const CREDIT_CATEGORIES = ["ifood", "sales", "financial", "loan", "other"] as const;
const MATCH_WINDOW_DAYS = 10;

const ownKey = (id: number) => `bank:${id}`;
const addDays = (date: string, days: number) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** Desfaz o efeito anterior da linha no financeiro antes de reclassificar. */
async function release(tx: Tx, row: BankRow) {
  if (!row.financeId) return;
  const [f] = await tx.select().from(erpFinance).where(eq(erpFinance.id, row.financeId));
  if (!f) return;
  if (f.sourceKey === ownKey(row.id)) {
    await tx.update(erpFinance).set({ status: "cancelled" }).where(eq(erpFinance.id, f.id));
  } else {
    // Era uma conta em aberto do ERP baixada por este lançamento: volta a ficar em aberto.
    await tx.update(erpFinance)
      .set({ status: "open", settledDate: null, paymentMethod: null, receipt: null })
      .where(eq(erpFinance.id, f.id));
  }
}

async function apply(tx: Tx, row: BankRow, c: Classification) {
  await release(tx, row);
  const base = { category: c.category, rule: c.rule, updatedAt: new Date() };
  if (c.action !== "post" || !c.category) {
    await tx.update(bankTransactions)
      .set({ ...base, status: c.action === "ignore" ? "ignored" : "pending", financeId: null })
      .where(eq(bankTransactions.id, row.id));
    return;
  }
  const kind = row.amountCents < 0 ? "payable" : "receivable";
  const amountCents = Math.abs(row.amountCents);
  const receipt = `Extrato ${row.bank} ${row.account} · ${row.fitid}`.slice(0, 2000);
  // Conciliação: uma conta em aberto do ERP da mesma loja e categoria, com o mesmo valor
  // e perto da data, é baixada em vez de criar outra (evita contar a folha ou a compra
  // duas vezes). Só o valor não basta: duas despesas diferentes podem coincidir.
  const [match] = await tx.select().from(erpFinance).where(and(
    eq(erpFinance.brand, row.brand), eq(erpFinance.kind, kind), eq(erpFinance.status, "open"),
    eq(erpFinance.category, c.category),
    eq(erpFinance.amountCents, amountCents),
    gte(erpFinance.dueDate, addDays(row.postedDate, -MATCH_WINDOW_DAYS)),
    lte(erpFinance.dueDate, addDays(row.postedDate, MATCH_WINDOW_DAYS)),
    sql`NOT EXISTS (SELECT 1 FROM bank_transactions b WHERE b.finance_id = ${erpFinance.id} AND b.id <> ${row.id})`,
  )).orderBy(asc(sql`abs(${erpFinance.dueDate} - ${row.postedDate}::date)`)).limit(1).for("update");
  let financeId: number;
  if (match) {
    await tx.update(erpFinance)
      .set({ status: "settled", settledDate: row.postedDate, paymentMethod: "transfer", receipt })
      .where(eq(erpFinance.id, match.id));
    financeId = match.id;
  } else {
    const values = {
      brand: row.brand, kind, category: c.category, description: (row.counterparty || row.description).slice(0, 200),
      amountCents, dueDate: row.postedDate, competence: row.postedDate.slice(0, 7), document: row.document ?? "",
      sourceKey: ownKey(row.id), status: "settled", settledDate: row.postedDate, paymentMethod: "transfer", receipt,
    };
    const [f] = await tx.insert(erpFinance).values(values)
      .onConflictDoUpdate({ target: erpFinance.sourceKey, set: { kind, category: c.category, status: "settled", settledDate: row.postedDate } })
      .returning({ id: erpFinance.id });
    financeId = f.id;
  }
  const rule = match ? `${c.rule} · baixou a conta #${match.id} do ERP`.slice(0, 200) : c.rule;
  await tx.update(bankTransactions).set({ ...base, rule, status: "posted", financeId }).where(eq(bankTransactions.id, row.id));
}

async function learned(tx: Tx): Promise<LearnedRule[]> {
  return (await tx.select().from(bankRules)) as LearnedRule[];
}
async function audit(tx: Tx, actorId: number, action: string, result: Record<string, unknown>) {
  await tx.insert(erpAudit).values({ requestId: randomUUID(), actorId, action, result });
}

export async function importStatement(input: { brand: string; bank: string; ofx: string }, actorId: number) {
  if (!BRANDS.includes(input.brand as Brand)) throw new ExtratoError("Escolha a loja dona da conta.");
  const bank = input.bank.trim().slice(0, 60);
  if (bank.length < 2) throw new ExtratoError("Informe o banco (ex.: C6, Itaú, Inter).");
  let statement;
  try {
    statement = parseOfx(input.ofx);
  } catch (error) {
    throw new ExtratoError(error instanceof Error ? error.message : "Arquivo OFX inválido.");
  }
  const account = statement.accountId || "conta";
  return db.transaction(async (tx) => {
    const rules = await learned(tx);
    const counts = { total: statement.transactions.length, novos: 0, repetidos: 0, lancados: 0, ignorados: 0, revisar: 0 };
    for (const t of statement.transactions) {
      const counterparty = (t.name || t.memo).slice(0, 200);
      const [row] = await tx.insert(bankTransactions).values({
        brand: input.brand, bank, account, fitid: t.fitid.slice(0, 200), postedDate: t.date, amountCents: t.amountCents,
        description: [t.name, t.memo].filter(Boolean).join(" · ").slice(0, 500) || t.type, counterparty, document: t.document,
      }).onConflictDoNothing().returning();
      if (!row) { counts.repetidos++; continue; }
      counts.novos++;
      const c = classifyBankLine({ amountCents: t.amountCents, name: t.name, memo: t.memo, document: t.document }, rules);
      await apply(tx, row, c);
      if (c.action === "post") counts.lancados++;
      else if (c.action === "ignore") counts.ignorados++;
      else counts.revisar++;
    }
    await audit(tx, actorId, "bank.import", { brand: input.brand, bank, account, ...counts });
    return counts;
  });
}

export async function classifyTransaction(
  input: { id: number; action: BankAction; category?: string | null; remember?: boolean },
  actorId: number,
) {
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(bankTransactions).where(eq(bankTransactions.id, input.id)).for("update");
    if (!row) throw new ExtratoError("Lançamento do extrato não encontrado.", 404);
    const direction = row.amountCents < 0 ? "debit" : "credit";
    const allowed: readonly string[] = direction === "debit" ? DEBIT_CATEGORIES : CREDIT_CATEGORIES;
    if (input.action === "post" && !allowed.includes(input.category ?? ""))
      throw new ExtratoError("Escolha uma categoria válida para este lançamento.");
    const c: Classification = {
      action: input.action,
      category: input.action === "post" ? input.category! : null,
      rule: "manual",
    };
    await apply(tx, row, c);
    let applied = 1;
    if (input.remember && input.action !== "review") {
      const pattern = counterpartyKey({ name: row.counterparty ?? "", memo: row.description, document: row.document });
      await tx.insert(bankRules).values({ pattern, direction, action: input.action, category: c.category })
        .onConflictDoUpdate({ target: [bankRules.pattern, bankRules.direction], set: { action: input.action, category: c.category } });
      // Aplica a nova regra aos outros pendentes do mesmo favorecido.
      const pending = await tx.select().from(bankTransactions).where(eq(bankTransactions.status, "pending"));
      for (const p of pending) {
        if (p.id === row.id || (p.amountCents < 0 ? "debit" : "credit") !== direction) continue;
        if (counterpartyKey({ name: p.counterparty ?? "", memo: p.description, document: p.document }) !== pattern) continue;
        await apply(tx, p, { ...c, rule: "regra aprendida" });
        applied++;
      }
    }
    await audit(tx, actorId, "bank.classify", { id: row.id, action: input.action, category: c.category, remember: !!input.remember, applied });
    return { applied };
  });
}

export async function listTransactions(status: "pending" | "posted" | "ignored" | "all", limit = 300) {
  const where = status === "all" ? undefined : eq(bankTransactions.status, status);
  const rows = await db.select().from(bankTransactions).where(where)
    .orderBy(desc(bankTransactions.postedDate), desc(bankTransactions.id)).limit(Math.min(limit, 1000));
  const counts = await db.select({ status: bankTransactions.status, n: sql<number>`count(*)::int` })
    .from(bankTransactions).groupBy(bankTransactions.status);
  const accounts = await db.select({
    brand: bankTransactions.brand, bank: bankTransactions.bank, account: bankTransactions.account,
    first: sql<string>`min(${bankTransactions.postedDate})::text`, last: sql<string>`max(${bankTransactions.postedDate})::text`,
    n: sql<number>`count(*)::int`,
  }).from(bankTransactions).groupBy(bankTransactions.brand, bankTransactions.bank, bankTransactions.account);
  return { rows, counts: Object.fromEntries(counts.map((c) => [c.status, c.n])), accounts };
}
