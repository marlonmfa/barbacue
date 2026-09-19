import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { employees } from "@/db/schema";
import { withRole } from "@/lib/admin-auth";

const ScheduleSchema = z.object({
  days: z.array(z.number().int().min(0).max(6)).max(7),
  start: z.string().regex(/^\d{2}:\d{2}$/),
  end: z.string().regex(/^\d{2}:\d{2}$/),
});

const PatchSchema = z.object({
  name: z.string().trim().min(2).optional(),
  jobTitle: z.string().trim().min(2).optional(),
  brand: z.enum(["barbacue", "barbadog", "chelas"]).optional(),
  phone: z.string().trim().optional().nullable(),
  email: z.string().trim().email().optional().nullable().or(z.literal("")),
  employmentType: z.enum(["clt", "pj", "freelancer", "estagio"]).optional(),
  salaryCents: z.number().int().nonnegative().optional(),
  weeklyHours: z.number().int().min(0).max(80).optional(),
  workSchedule: ScheduleSchema.optional(),
  hireDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable().or(z.literal("")),
  active: z.boolean().optional(),
});

type Params = { params: Promise<{ id: string }> };

export const PATCH = withRole("admin", async (req: NextRequest, { params }: Params) => {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const data = {
    ...parsed.data,
    ...(parsed.data.email !== undefined ? { email: parsed.data.email || null } : {}),
    ...(parsed.data.phone !== undefined ? { phone: parsed.data.phone || null } : {}),
    ...(parsed.data.hireDate !== undefined ? { hireDate: parsed.data.hireDate || null } : {}),
    updatedAt: new Date(),
  };

  const [updated] = await db.update(employees).set(data).where(eq(employees.id, Number(id))).returning();
  if (!updated) return NextResponse.json({ error: "Funcionário não encontrado" }, { status: 404 });
  return NextResponse.json(updated);
});

export const DELETE = withRole("admin", async (_req: NextRequest, { params }: Params) => {
  const { id } = await params;
  const [removed] = await db.delete(employees).where(eq(employees.id, Number(id))).returning({ id: employees.id });
  if (!removed) return NextResponse.json({ error: "Funcionário não encontrado" }, { status: 404 });
  return NextResponse.json({ ok: true });
});
