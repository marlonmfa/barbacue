import { NextRequest, NextResponse } from "next/server";
import { parseSession, resolveStaffSession } from "@/lib/admin-auth";

// Confirmation is temporarily disabled. Cached clients must not send codes.
export async function POST(req: NextRequest) {
  const token = await parseSession(req.cookies.get("barbacue_admin")?.value ?? "");
  const session = token ? await resolveStaffSession(token) : null;
  if (!session?.mustChangePassword) return NextResponse.json({ error: "Entre com sua conta para concluir o primeiro acesso." }, { status: 401 });
  return NextResponse.json({ error: "A confirmação por código está temporariamente desativada. Atualize a página e cadastre o e-mail junto com a nova senha." }, { status: 409, headers: { "Cache-Control": "no-store" } });
}
