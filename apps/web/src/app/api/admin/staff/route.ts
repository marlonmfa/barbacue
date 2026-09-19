import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { staffUsers } from "@/db/schema";
import { desc } from "drizzle-orm";
import { withRole } from "@/lib/admin-auth";
import { hashPassword } from "@/lib/staff-auth";

// Staff account management is admin-only. The proxy gate only checks for a valid
// session (any role), so role enforcement happens here in the Node handler.

import { STAFF_ROLES, PERMISSION_IDS } from "@/lib/permissions";

const StaffSchema = z.object({
  name: z.string().min(1),
  username: z.string().min(3).transform((s) => s.trim().toLowerCase()),
  password: z.string().min(6),
  role: z.enum(STAFF_ROLES),
  active: z.boolean().optional(),
  jobTitle: z.string().trim().max(100).optional().nullable(),
  permissions: z.array(z.enum(PERMISSION_IDS)).max(PERMISSION_IDS.length).optional().nullable(),
});

export const GET = withRole("admin", async () => {
  // Never leak password hashes to the client.
  const all = await db
    .select({
      id: staffUsers.id,
      name: staffUsers.name,
      username: staffUsers.username,
      role: staffUsers.role,
      jobTitle: staffUsers.jobTitle,
      permissions: staffUsers.permissions,
      active: staffUsers.active,
      createdAt: staffUsers.createdAt,
    })
    .from(staffUsers)
    .orderBy(desc(staffUsers.createdAt));
  return NextResponse.json(all);
});

export const POST = withRole("admin", async (req: NextRequest) => {
  const body = await req.json().catch(() => null);
  const parsed = StaffSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const { name, username, password, role, active, jobTitle, permissions } = parsed.data;
  try {
    const [user] = await db
      .insert(staffUsers)
      .values({ name, username, role, jobTitle, permissions, active: active ?? true, passwordHash: await hashPassword(password) })
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
    return NextResponse.json(user, { status: 201 });
  } catch {
    // Unique violation on username, etc.
    return NextResponse.json({ error: "Usuário já existe" }, { status: 409 });
  }
});
