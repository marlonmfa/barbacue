import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { closedDays } from "@/db/schema";
import { eq } from "drizzle-orm";
import { withStaff } from "@/lib/admin-auth";

type Params = { params: Promise<{ id: string }> };

export const DELETE = withStaff(async (_req: NextRequest, { params }: Params) => {
  const { id } = await params;
  await db.delete(closedDays).where(eq(closedDays.id, Number(id)));
  return NextResponse.json({ ok: true });
});
