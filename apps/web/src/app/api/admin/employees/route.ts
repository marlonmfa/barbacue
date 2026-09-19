import { NextRequest, NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { employees } from "@/db/schema";
import { withRole } from "@/lib/admin-auth";

const ScheduleSchema = z.object({
  days: z.array(z.number().int().min(0).max(6)).max(7),
  start: z.string().regex(/^\d{2}:\d{2}$/),
  end: z.string().regex(/^\d{2}:\d{2}$/),
});

const EmployeeSchema = z.object({
  name: z.string().trim().min(2),
  jobTitle: z.string().trim().min(2),
  brand: z.enum(["barbacue", "barbadog", "chelas"]),
  phone: z.string().trim().optional().nullable(),
  email: z.string().trim().email().optional().nullable().or(z.literal("")),
  employmentType: z.enum(["clt", "pj", "freelancer", "estagio"]),
  salaryCents: z.number().int().nonnegative(),
  weeklyHours: z.number().int().min(0).max(80),
  workSchedule: ScheduleSchema,
  hireDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable().or(z.literal("")),
  active: z.boolean().optional(),
});

export const GET = withRole("admin", async () => {
  const rows = await db.select().from(employees).orderBy(desc(employees.active), employees.name);
  return NextResponse.json(rows);
});

export const POST = withRole("admin", async (req: NextRequest) => {
  const body = await req.json().catch(() => null);
  const parsed = EmployeeSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const [employee] = await db.insert(employees).values({
    ...parsed.data,
    phone: parsed.data.phone || null,
    email: parsed.data.email || null,
    hireDate: parsed.data.hireDate || null,
    active: parsed.data.active ?? true,
  }).returning();

  return NextResponse.json(employee, { status: 201 });
});
