import { NextResponse } from "next/server";
import { withRole } from "@/lib/admin-auth";
import { erpSnapshot, executeErp, ErpError } from "@/lib/erp";
import { erpRequest } from "@/lib/erp-validation";

export const GET = withRole("admin", async () => {
  try {
    return NextResponse.json(await erpSnapshot(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("ERP read failed", error);
    return NextResponse.json(
      {
        error:
          "Não foi possível carregar o ERP. Verifique a conexão e as migrações do banco.",
      },
      { status: 503 },
    );
  }
});
export const POST = withRole("admin", async (req, _ctx, session) => {
  const parsed = erpRequest.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      {
        error: "Verifique os campos informados.",
        details: parsed.error.flatten(),
      },
      { status: 422 },
    );
  try {
    return NextResponse.json(await executeErp(parsed.data, session.userId));
  } catch (error) {
    if (error instanceof ErpError)
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    console.error("ERP mutation failed", error);
    return NextResponse.json(
      {
        error: "Não foi possível salvar. Confira os valores e tente novamente.",
      },
      { status: 500 },
    );
  }
});
