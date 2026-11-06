import { COG_STAFF_SENTINEL } from "@/lib/cog-staff";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { staffUsers } from "@/db/schema";
import { eq, and, ne } from "drizzle-orm";
import { withRole, withStaff, type AdminSession } from "@/lib/admin-auth";
import { hashPassword } from "@/lib/staff-auth";

import { canManageStaffAccount } from "@/lib/staff-management";
import { STAFF_ROLES, PERMISSION_IDS } from "@/lib/permissions";

const PatchSchema = z.object({
  name: z.string().min(1).optional(),
  password: z.string().min(6).optional(),
  role: z.enum(STAFF_ROLES).optional(),
  active: z.boolean().optional(),
  jobTitle: z.string().trim().max(100).optional().nullable(),
  permissions: z.array(z.enum(PERMISSION_IDS)).max(PERMISSION_IDS.length).optional().nullable(),
});

type Params = { params: Promise<{ id: string }> };

export const PATCH = withStaff( async (req: NextRequest, { params }: Params, session: AdminSession) => {
  const { id } = await params;
  const userId = Number(id);
  if (!Number.isSafeInteger(userId) || userId <= 0) return NextResponse.json({ error: "Conta inválida." }, { status: 422 });
  const body = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  // Guard against self-lockout: an admin cannot demote or deactivate their own account.
  if (Number(id) === session.userId && ((parsed.data.role !== undefined && parsed.data.role !== "admin") || parsed.data.active === false)) {
    return NextResponse.json({ error: "Não é possível rebaixar/desativar a própria conta" }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (parsed.data.jobTitle !== undefined) data.jobTitle = parsed.data.jobTitle;
  if (parsed.data.permissions !== undefined) data.permissions = parsed.data.permissions;
  if (parsed.data.name !== undefined) data.name = parsed.data.name;
  if (parsed.data.role !== undefined) data.role = parsed.data.role;
  if (parsed.data.active !== undefined) data.active = parsed.data.active;
  if (parsed.data.password) {
    data.passwordHash = await hashPassword(parsed.data.password);
  }

  return db.transaction(async tx => {
    const [current] = await tx.select({ id: staffUsers.id, role: staffUsers.role, permissions: staffUsers.permissions })
      .from(staffUsers).where(and(eq(staffUsers.id, userId),ne(staffUsers.passwordHash,COG_STAFF_SENTINEL))).for("update");
    if (!current) return NextResponse.json({ error: "Conta não encontrada." }, { status: 404 });
    const next = { role: parsed.data.role ?? current.role, permissions: parsed.data.permissions === undefined ? current.permissions : parsed.data.permissions };
    if (!canManageStaffAccount(session, current) || !canManageStaffAccount(session, next)) {
      return NextResponse.json({ error: "Você só pode administrar profissionais da operação com funções disponíveis na sua conta." }, { status: 403 });
    }
    const [updated] = await tx.update(staffUsers).set(data).where(eq(staffUsers.id, userId)).returning({
      id: staffUsers.id, name: staffUsers.name, username: staffUsers.username, role: staffUsers.role,
      jobTitle: staffUsers.jobTitle, permissions: staffUsers.permissions, active: staffUsers.active, createdAt: staffUsers.createdAt,
    });
    return NextResponse.json(updated);
  });
});

export const DELETE = withRole("admin", async (_req: NextRequest, { params }: Params, session: AdminSession) => {
  const { id } = await params;
  if (Number(id) === session.userId) {
    return NextResponse.json({ error: "Não é possível excluir a própria conta" }, { status: 400 });
  }
  const deleted=await db.delete(staffUsers).where(and(eq(staffUsers.id, Number(id)),ne(staffUsers.passwordHash,COG_STAFF_SENTINEL))).returning({id:staffUsers.id});
  if(!deleted.length)return NextResponse.json({error:"Conta não encontrada."},{status:404});
  return NextResponse.json({ ok: true });
});
