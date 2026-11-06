import { COG_STAFF_SENTINEL } from "@/lib/cog-staff";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { staffUsers } from "@/db/schema";
import { desc, ne } from "drizzle-orm";
import { withStaff } from "@/lib/admin-auth";
import { hashPassword } from "@/lib/staff-auth";
import { STAFF_ROLES, PERMISSION_IDS } from "@/lib/permissions";
import { canManageStaffAccount } from "@/lib/staff-management";

const StaffSchema = z.object({
  name: z.string().trim().min(1).max(200),
  username: z.string().trim().min(3).max(254).transform(s => s.toLowerCase()),
  password: z.string().min(6).max(256),
  role: z.enum(STAFF_ROLES),
  active: z.boolean().optional(),
  jobTitle: z.string().trim().max(100).optional().nullable(),
  permissions: z.array(z.enum(PERMISSION_IDS)).max(PERMISSION_IDS.length).optional().nullable(),
});

export const GET = withStaff(async (_req, _ctx, session) => {
  const all = await db.select({
    id: staffUsers.id, name: staffUsers.name, username: staffUsers.username,
    role: staffUsers.role, jobTitle: staffUsers.jobTitle, permissions: staffUsers.permissions,
    active: staffUsers.active, createdAt: staffUsers.createdAt,
  }).from(staffUsers).where(ne(staffUsers.passwordHash,COG_STAFF_SENTINEL)).orderBy(desc(staffUsers.createdAt));
  return NextResponse.json(all.filter(user => canManageStaffAccount(session, user)), { headers: { "Cache-Control": "private, no-store" } });
});

export const POST = withStaff(async (req: NextRequest, _ctx, session) => {
  const parsed = StaffSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  if (!canManageStaffAccount(session, parsed.data)) {
    return NextResponse.json({ error: "Você só pode cadastrar profissionais da operação com funções disponíveis na sua conta." }, { status: 403 });
  }
  const { name, username, password, role, active, jobTitle, permissions } = parsed.data;
  try {
    const [user] = await db.insert(staffUsers)
      .values({ name, username, role, jobTitle, permissions, active: active ?? true, passwordHash: await hashPassword(password) })
      .returning({ id: staffUsers.id, name: staffUsers.name, username: staffUsers.username, role: staffUsers.role, jobTitle: staffUsers.jobTitle, permissions: staffUsers.permissions, active: staffUsers.active, createdAt: staffUsers.createdAt });
    return NextResponse.json(user, { status: 201 });
  } catch (error) {
    const code = (error as { code?: string; cause?: { code?: string } }).cause?.code ?? (error as { code?: string }).code;
    if (code === "23505") return NextResponse.json({ error: "Usuário já existe" }, { status: 409 });
    throw error;
  }
});
