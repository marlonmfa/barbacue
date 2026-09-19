import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { staffUsers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { withRole, type AdminSession } from "@/lib/admin-auth";
import { hashPassword } from "@/lib/staff-auth";

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

export const PATCH = withRole("admin", async (req: NextRequest, { params }: Params, session: AdminSession) => {
  const { id } = await params;
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
  if (parsed.data.password) data.passwordHash = await hashPassword(parsed.data.password);

  const [updated] = await db
    .update(staffUsers)
    .set(data)
    .where(eq(staffUsers.id, Number(id)))
    .returning({
      id: staffUsers.id,
      name: staffUsers.name,
      username: staffUsers.username,
      role: staffUsers.role,
      jobTitle: staffUsers.jobTitle,
      permissions: staffUsers.permissions,
      active: staffUsers.active,
      createdAt: staffUsers.createdAt,
    });

  if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(updated);
});

export const DELETE = withRole("admin", async (_req: NextRequest, { params }: Params, session: AdminSession) => {
  const { id } = await params;
  if (Number(id) === session.userId) {
    return NextResponse.json({ error: "Não é possível excluir a própria conta" }, { status: 400 });
  }
  await db.delete(staffUsers).where(eq(staffUsers.id, Number(id)));
  return NextResponse.json({ ok: true });
});
