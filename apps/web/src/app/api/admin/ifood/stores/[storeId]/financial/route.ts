import { NextRequest, NextResponse } from "next/server";
import { withStaff } from "@/lib/admin-auth";
import { financial } from "@/lib/ifood-ops";
import { ifoodFailure, notFound, storeFrom, type StoreParams } from "@/lib/ifood-route";

// Vendas e repasses do iFood: só administradores e gerentes.
export const GET = withStaff(async (req: NextRequest, { params }: StoreParams, session) => {
  if (!["admin", "manager"].includes(session.role)) return NextResponse.json({ error: "Somente administradores e gerentes veem o financeiro." }, { status: 403 });
  const store = await storeFrom(params); if (!store) return notFound();
  const today = new Date().toISOString().slice(0, 10);
  const from = req.nextUrl.searchParams.get("from") ?? new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
  const to = req.nextUrl.searchParams.get("to") ?? today;
  try { return NextResponse.json({ from, to, ...(await financial(store, from, to)) }, { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return ifoodFailure(error); }
});
