import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { categories } from "@/db/schema";
import { asc } from "drizzle-orm";
import { withStaff } from "@/lib/admin-auth";

const CatSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/),
  sortOrder: z.number().int().optional(),
});

export const GET = withStaff(async () => {
  const cats = await db.select().from(categories).orderBy(asc(categories.sortOrder));
  return NextResponse.json(cats);
});

export const POST = withStaff(async (req: NextRequest) => {
  const body = await req.json().catch(() => null);
  const parsed = CatSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const [cat] = await db.insert(categories).values(parsed.data).returning();
  return NextResponse.json(cat, { status: 201 });
});
