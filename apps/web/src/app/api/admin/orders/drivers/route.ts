import { NextResponse } from "next/server";
import { withStaff } from "@/lib/admin-auth";
import { driverRoster } from "@/lib/driver-roster";
export const GET = withStaff(async () => NextResponse.json(await driverRoster(), { headers: { "Cache-Control": "no-store" } }));
