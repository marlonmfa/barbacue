import { NextResponse } from "next/server";
import { db } from "@/db";
import { customers } from "@/db/schema";
import { desc } from "drizzle-orm";
import { withStaff } from "@/lib/admin-auth";

export const GET = withStaff(async () => {
  const all = await db.select().from(customers).orderBy(desc(customers.createdAt));
  return NextResponse.json(all);
});
