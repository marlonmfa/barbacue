import { call, IfoodApiError } from "@/lib/ifood-api";

export const IFOOD_FINANCIAL_SECTIONS = ["sales", "settlements", "events", "anticipations"] as const;
export type IfoodFinancialSection = typeof IFOOD_FINANCIAL_SECTIONS[number];

type Money = number | string | { value?: number | string };
type Sale = {
  shortId?: string;
  createdAt?: string;
  currentStatus?: string;
  saleGrossValue?: { bag?: number; deliveryFee?: number; serviceFee?: number };
  billingSummary?: { saleBalance?: number };
};
type Transfer = { paymentDate?: string; status?: string; type?: string; amount?: Money };
type Anticipation = {
  type?: string; status?: string; originalPaymentDate?: string; anticipatedPaymentDate?: string;
  originalPaymentAmount?: Money; anticipatedPaymentAmount?: Money; feeAmount?: Money; feePercentage?: number;
};
type FinancialEvent = {
  dateTime?: string; name?: string; trigger?: string; hasTransferImpact?: boolean;
  amount?: Money; settlement?: { expectedDate?: string };
};

export interface IfoodFinancialRow {
  date: string | null;
  description: string;
  status: string | null;
  amount: number | null;
  balance?: number | null;
  feeAmount?: number | null;
  feePercentage?: number | null;
  expectedDate?: string | null;
  impactsTransfer?: boolean | null;
}

const dayMs = 86_400_000;
const date = (value?: string) => value?.slice(0, 10) || null;

function amount(input?: Money) {
  const value = typeof input === "object" ? input?.value : input;
  if (typeof value !== "number" && !(typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value))) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function day(value: string) {
  const time = /^\d{4}-\d{2}-\d{2}$/.test(value) ? Date.parse(value) : NaN;
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? time : NaN;
}

export async function ifoodFinancialSection(storeId: string, section: IfoodFinancialSection, from: string, to: string, page: number, dateBasis = "payment") {
  const days = (day(to) - day(from)) / dayMs;
  const maxDays = section === "sales" ? 7 : 31;
  if (!(days >= 0 && days < maxDays)) {
    throw new IfoodApiError(`Escolha um período válido de até ${maxDays} dias.`, 422);
  }
  if (!Number.isSafeInteger(page) || page < 1 || page > 10000) throw new IfoodApiError("Página inválida.", 422);

  const path = `/financial/v3.0/merchants/${encodeURIComponent(storeId)}`;
  try {
    if (section === "sales") {
      const result = await call<{ sales: Sale[]; pageCount: number }>(
        `${path}/sales?beginSalesDate=${from}&endSalesDate=${to}&page=${page}`,
      );
      const rows: IfoodFinancialRow[] = (result?.sales ?? []).map(sale => {
        const gross = sale.saleGrossValue;
        const values = [gross?.bag, gross?.deliveryFee, gross?.serviceFee]
          .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
        return {
          date: date(sale.createdAt), description: sale.shortId || "Pedido",
          status: sale.currentStatus ?? null,
          amount: values.length ? values.reduce((sum, value) => sum + Math.round(value * 100), 0) / 100 : null,
          balance: amount(sale.billingSummary?.saleBalance),
        };
      });
      return { rows, hasNextPage: page < (result?.pageCount ?? 0) };
    }

    if (section === "settlements") {
      const result = await call<{ settlements: { closingItems?: Transfer[] }[] }>(
        `${path}/settlements?beginPaymentDate=${from}&endPaymentDate=${to}`,
      );
      const rows: IfoodFinancialRow[] = (result?.settlements ?? []).flatMap(period => (period.closingItems ?? []).map(transfer => ({
        date: date(transfer.paymentDate), description: transfer.type || "Repasse",
        status: transfer.status ?? null, amount: amount(transfer.amount),
      })));
      return { rows, hasNextPage: false };
    }

    if (section === "anticipations") {
      if (dateBasis !== "payment" && dateBasis !== "calculation") throw new IfoodApiError("Filtro de datas inválido.", 422);
      const suffix = dateBasis === "payment" ? "AnticipatedPaymentDate" : "CalculationDate";
      const result = await call<{ settlements: { closingItems?: Anticipation[] }[] }>(
        `${path}/anticipations?begin${suffix}=${from}&end${suffix}=${to}`,
      );
      const rows: IfoodFinancialRow[] = (result?.settlements ?? []).flatMap(period => (period.closingItems ?? []).map(item => ({
        date: date(item.anticipatedPaymentDate), description: item.type || "Antecipação",
        status: item.status ?? null, amount: amount(item.anticipatedPaymentAmount),
        balance: amount(item.originalPaymentAmount), expectedDate: date(item.originalPaymentDate),
        feeAmount: amount(item.feeAmount), feePercentage: amount(item.feePercentage),
      })));
      return { rows, hasNextPage: false };
    }

    const result = await call<{ financialEvents: FinancialEvent[]; hasNextPage: boolean }>(
      `${path}/financial-events?beginDate=${from}&endDate=${to}&page=${page}&size=300`,
    );
    const rows: IfoodFinancialRow[] = (result?.financialEvents ?? []).map(event => ({
      date: date(event.dateTime), description: event.name || "Lançamento", status: event.trigger ?? null,
      amount: amount(event.amount), expectedDate: date(event.settlement?.expectedDate),
      impactsTransfer: event.hasTransferImpact ?? null,
    }));
    return { rows, hasNextPage: result?.hasNextPage === true };
  } catch (error) {
    if (error instanceof IfoodApiError && error.status === 403) {
      throw new IfoodApiError("O iFood ainda não autorizou o módulo Financial para esta loja.", 403);
    }
    throw error;
  }
}

const reportBase = (storeId: string) => `/financial/v3.0/merchants/${encodeURIComponent(storeId)}/reconciliation/on-demand`;
const reportIdPattern = /^[a-zA-Z0-9_-]{8,100}$/;
export interface IfoodReconciliation {
  requestId: string;
  competence: string;
  status: "created" | "enqueue" | "processing" | "processed" | "error";
  downloadUrl?: string;
  message?: string;
}

function assertCompetence(value: string) {
  if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(value)) throw new IfoodApiError("Informe a competência no formato AAAA-MM.", 422);
}

export async function requestIfoodReconciliation(storeId: string, competence: string) {
  assertCompetence(competence);
  const result = await call<{ requestId: string; merchantId: string; competence: string }>(
    reportBase(storeId), { method: "POST", body: { competence } },
  );
  if (!result || !reportIdPattern.test(result.requestId) || result.merchantId !== storeId || result.competence !== competence) {
    throw new IfoodApiError("O iFood não retornou um protocolo válido.", 502);
  }
  return { requestId: result.requestId, competence, status: "created" } satisfies IfoodReconciliation;
}

export async function ifoodReconciliationStatus(storeId: string, competence: string, requestId: string): Promise<IfoodReconciliation> {
  assertCompetence(competence);
  if (!reportIdPattern.test(requestId)) throw new IfoodApiError("Protocolo inválido.", 422);
  const result = await call<{ id: string; merchantId: string; competence: string; status: string; filePath?: string; errorMessage?: string }>(
    `${reportBase(storeId)}/${encodeURIComponent(requestId)}`,
  );
  if (!result) throw new IfoodApiError("Protocolo ainda indisponível no iFood.", 404);
  if (result.id !== requestId || result.merchantId !== storeId || result.competence !== competence) throw new IfoodApiError("Protocolo não encontrado para esta loja e competência.", 404);

  const report = { requestId, competence };
  if (result.status === "created" || result.status === "enqueue" || result.status === "processing") return { ...report, status: result.status };
  if (result.status === "error") return {
    ...report, status: "error",
    message: result.errorMessage?.includes("No financial entries")
      ? "O iFood não encontrou lançamentos para esta competência."
      : "O iFood não conseguiu gerar o arquivo desta competência.",
  };
  if (result.status === "processed") {
    const url = URL.canParse(result.filePath ?? "") ? new URL(result.filePath!) : null;
    if (url?.protocol === "https:" && !url.username && !url.password) return { ...report, status: "processed", downloadUrl: url.href };
  }
  throw new IfoodApiError("O iFood devolveu um status ou arquivo inválido.", 502);
}
