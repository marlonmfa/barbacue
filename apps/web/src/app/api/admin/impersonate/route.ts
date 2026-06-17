import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { customers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { isMasterPassword } from "@/lib/admin-auth";
import { setCustomerSession } from "@/lib/customer-session";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { customerId, masterPassword } = body as { customerId?: number; masterPassword?: string };

  if (!isMasterPassword(masterPassword ?? "")) {
    return NextResponse.json({ error: "Senha mestra incorreta" }, { status: 401 });
  }

  if (!customerId) {
    return NextResponse.json({ error: "Cliente não informado" }, { status: 400 });
  }

  const [customer] = await db.select().from(customers).where(eq(customers.id, customerId));
  if (!customer) {
    return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 });
  }

  const res = NextResponse.json({ ok: true });
  setCustomerSession(res, {
    name: customer.name,
    phone: customer.phone,
    address: customer.address ?? undefined,
  });
  return res;
}
