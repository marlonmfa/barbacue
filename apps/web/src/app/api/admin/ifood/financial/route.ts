import { NextRequest, NextResponse } from "next/server";
import { withStaff } from "@/lib/admin-auth";
import { ifoodSettings, IfoodApiError } from "@/lib/ifood-api";
import { IFOOD_FINANCIAL_SECTIONS, ifoodFinancialSection, ifoodReconciliationStatus, requestIfoodReconciliation } from "@/lib/ifood-financial";

const headers = { "Cache-Control": "private, no-store" };

const errorResponse = (message: string, status: number) => NextResponse.json({ error: message }, { status, headers });
const financialError = (error: unknown) => error instanceof IfoodApiError
  ? errorResponse(error.message, error.status)
  : errorResponse("Falha ao consultar o financeiro do iFood. Tente novamente.", 502);

export const GET = withStaff(async (request: NextRequest, _ctx, session) => {
  if (session.role !== "admin" && session.role !== "manager") {
    return NextResponse.json({ error: "Financeiro disponível para administradores e gerentes." }, { status: 403, headers });
  }

  const stores = ifoodSettings().stores;
  const query = request.nextUrl.searchParams;
  const sectionValue = query.get("section");
  if (!sectionValue) return NextResponse.json({ stores }, { headers });

  const store = stores.find(store => store.id === query.get("store"));
  if (!store) return NextResponse.json({ error: "Loja não encontrada." }, { status: 404, headers });

  try {
    if (sectionValue === "reconciliation") {
      return NextResponse.json(await ifoodReconciliationStatus(store.id, query.get("competence") ?? "", query.get("requestId") ?? ""), { headers });
    }
    const section = IFOOD_FINANCIAL_SECTIONS.find(section => section === sectionValue);
    if (!section) return errorResponse("Consulta financeira inválida.", 422);
    const data = await ifoodFinancialSection(store.id, section, query.get("from") ?? "", query.get("to") ?? "", Number(query.get("page") ?? "1"), query.get("dateBasis") ?? "payment");
    return NextResponse.json(data, { headers });
  } catch (error) {
    return financialError(error);
  }
});

export const POST = withStaff(async (request: NextRequest, _ctx, session) => {
  if (session.role !== "admin" && session.role !== "manager") return errorResponse("Financeiro disponível para administradores e gerentes.", 403);
  const body = await request.json().catch(() => null);
  if (typeof body?.store !== "string" || typeof body?.competence !== "string") return errorResponse("Informe a loja e a competência.", 422);
  const store = ifoodSettings().stores.find(store => store.id === body.store);
  if (!store) return errorResponse("Loja não encontrada.", 404);
  try {
    const result = await requestIfoodReconciliation(store.id, body.competence);
    return NextResponse.json(result, { status: 202, headers });
  } catch (error) {
    return financialError(error);
  }
});
