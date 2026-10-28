import { NextRequest, NextResponse } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { staffUsers } from "@/db/schema";
import { parseSession, resolveStaffSession, setAdminCookie } from "@/lib/admin-auth";
import { hashPassword, verifyPassword } from "@/lib/staff-auth";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { landingPath } from "@/lib/permissions";

const PasswordSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)).optional(),
  currentPassword: z.string().min(1).max(256),
  password: z.string().min(8).max(256),
  confirmation: z.string(),
}).refine((data) => data.password === data.confirmation, { message: "As senhas não coincidem." });

export async function POST(req: NextRequest) {
  const token = await parseSession(req.cookies.get("barbacue_admin")?.value ?? "");
  const session = token ? await resolveStaffSession(token) : null;
  if (!session || session.userId === 0) {
    return NextResponse.json({ error: "Entre com sua conta para alterar a senha." }, { status: 401 });
  }
  const limit = rateLimit(`staff-password:${session.userId}:${clientIp(req)}`, 8, 60_000, 5 * 60_000);
  if (!limit.ok) return NextResponse.json({ error: "Muitas tentativas. Tente novamente em alguns minutos." }, { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } });
  const parsed = PasswordSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Use ao menos 8 caracteres e confirme a nova senha." }, { status: 422 });
  const { currentPassword, password, email } = parsed.data;
  const [user] = await db.select().from(staffUsers).where(eq(staffUsers.id, session.userId));
  if (!user?.active || !(await verifyPassword(currentPassword, user.passwordHash))) {
    return NextResponse.json({ error: "Senha atual incorreta." }, { status: 400 });
  }
  if (await verifyPassword(password, user.passwordHash)) {
    return NextResponse.json({ error: "Escolha uma senha diferente da senha inicial." }, { status: 422 });
  }
  // Temporarily collect the address without a confirmation code (27/10/2026).
  // Keep it unverified; registering an address does not prove ownership.
  if (user.mustChangePassword && (!email || email === user.username.toLowerCase() || email.endsWith("@barbacue.cog.ia.br"))) {
    return NextResponse.json({ error: "Informe um e-mail alternativo válido fora de barbacue.cog.ia.br." }, { status: 422 });
  }
  const passwordHash = await hashPassword(password);
  const updated = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM staff_users WHERE id = ${user.id} FOR UPDATE`);
    const [changed] = await tx.update(staffUsers).set({ passwordHash, mustChangePassword: false })
      .where(and(eq(staffUsers.id, user.id), eq(staffUsers.passwordHash, user.passwordHash), eq(staffUsers.active, true)))
      .returning({ userId: staffUsers.id, role: staffUsers.role, permissions: staffUsers.permissions });
    if (changed && user.mustChangePassword && email) {
      await tx.execute(sql`INSERT INTO staff_alternate_emails(user_id, email, code_hash, expires_at, verified_at) VALUES (${user.id}, ${email}, NULL, now(), NULL) ON CONFLICT(user_id) DO UPDATE SET email = excluded.email, code_hash = NULL, expires_at = now(), verified_at = NULL`);
    }
    return changed;
  });
  if (!updated) return NextResponse.json({ error: "A conta foi alterada. Entre novamente para salvar a nova senha." }, { status: 409 });
  const response = NextResponse.json({ ok: true, redirect: landingPath(updated) });
  await setAdminCookie(response, updated);
  return response;
}
