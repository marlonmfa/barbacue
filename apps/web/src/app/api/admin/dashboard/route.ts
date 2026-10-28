import { NextResponse } from "next/server";
import { withStaff } from "@/lib/admin-auth";
import { getDashboardData } from "@/lib/admin-dashboard";

export const GET = withStaff(async () => NextResponse.json(await getDashboardData(), {
  headers: { "Cache-Control": "private, no-store", Vary: "Cookie" },
}));
