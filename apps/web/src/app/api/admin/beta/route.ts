import { NextResponse } from "next/server";
import { db } from "@/db";
import { betaSignups } from "@/db/schema";
import { desc } from "drizzle-orm";
import { withStaff } from "@/lib/admin-auth";

export const GET = withStaff(async () => {
  const all = await db
    .select()
    .from(betaSignups)
    .orderBy(desc(betaSignups.createdAt));
  return NextResponse.json(all);
});
