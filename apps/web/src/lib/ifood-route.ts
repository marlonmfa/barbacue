import { NextResponse } from "next/server";
import { IfoodApiError, ifoodSettings } from "@/lib/ifood-api";

export type StoreParams = { params: Promise<{ storeId: string }> };

export async function storeFrom(params: StoreParams["params"]) {
  const { storeId } = await params;
  return ifoodSettings().stores.find(s => s.id === storeId) ?? null;
}

export const notFound = () => NextResponse.json({ error: "Loja não encontrada." }, { status: 404 });

/** Erros do iFood viram resposta legível; 403 traz forbidden=true para a tela mostrar "sem permissão no iFood". */
export function ifoodFailure(error: unknown) {
  if (error instanceof IfoodApiError) return NextResponse.json({ error: error.message, forbidden: error.status === 403 }, { status: error.status });
  if (error instanceof Error && error.message && !/fetch failed|ECONN|timeout/i.test(error.message)) return NextResponse.json({ error: error.message }, { status: 422 });
  throw error;
}
