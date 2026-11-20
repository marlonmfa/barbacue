import { NextRequest, NextResponse } from "next/server";
import { withRole } from "@/lib/admin-auth";
import { buildDocumentCoverage } from "@/lib/document-coverage";

export const dynamic = "force-dynamic";

export const GET = withRole("admin", async (_request: NextRequest) => NextResponse.json(buildDocumentCoverage(), {
  headers: { "Cache-Control": "private, no-store" },
}));
