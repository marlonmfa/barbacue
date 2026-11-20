import { NextResponse } from "next/server";
import { withRole } from "@/lib/admin-auth";
import { loadFinanceReport } from "@/lib/financeiro/queries";

export const GET = withRole("admin", async () => {
  try {
    return NextResponse.json(await loadFinanceReport(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("[financeiro] falha ao consultar demonstrativos", error);
    return NextResponse.json({ error: "Não foi possível consultar os demonstrativos." }, { status: 503 });
  }
});
