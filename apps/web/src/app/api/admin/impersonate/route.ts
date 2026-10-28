import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { customers, staffUsers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { withRole } from "@/lib/admin-auth";
import { verifyPassword } from "@/lib/staff-auth";
import { rateLimit } from "@/lib/rate-limit";
import { setCustomerSession } from "@/lib/customer-session";

// Impersonation grants access to a customer's saved data — admin-only, AND still
// gated by confirmation of the administrator's own password.
export const POST = withRole("admin", async (req: NextRequest, _ctx, session) => {
  const limit = rateLimit(`staff-impersonate:${session.userId}`, 8, 60_000, 5 * 60_000);
  if (!limit.ok) return NextResponse.json({ error: "Muitas tentativas. Tente novamente em alguns minutos." }, { status: 429 });
  const body = await req.json().catch(() => ({}));
  const { customerId, currentPassword } = (body ?? {}) as { customerId?: number; currentPassword?: string };
  const [user] = await db.select({ passwordHash: staffUsers.passwordHash, active: staffUsers.active }).from(staffUsers).where(eq(staffUsers.id, session.userId));

  if (!user?.active || typeof currentPassword !== "string" || currentPassword.length > 256 || !(await verifyPassword(currentPassword, user.passwordHash))) {
    return NextResponse.json({ error: "Senha da sua conta incorreta" }, { status: 401 });
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
});
