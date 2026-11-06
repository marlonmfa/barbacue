import { findCogAdminStaff } from "@/lib/cog-staff";
import { NextRequest, NextResponse } from "next/server";
import { oidcConfig, requestOrigin, completeFlow, FLOW_COOKIE, GRANT_COOKIE, CHECK_COOKIE } from "@/lib/cog-oidc";
import { findCogStaff } from "@/lib/admin-auth";
import { findCogMember } from "@/lib/member-auth";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  const origin = requestOrigin(req.headers);
  const config = oidcConfig(origin);
  if (!config) return new NextResponse("Não encontrado", { status: 404 });
  let next = "/admin/login", grant = null;
  try {
    const result = await completeFlow(config, req.cookies.get(FLOW_COOKIE)?.value, req.nextUrl.searchParams);
    next = result.next;
    if (result.grant) {
      const [staff, member] = await Promise.all([result.grant.admin ? findCogAdminStaff({email:result.grant.email,admin:true,source:"oidc"}) : findCogStaff(result.grant.email), findCogMember(result.grant.email)]);
      if (staff || member) grant = result.grant;
    }
  } catch { /* Preserve native session on invalid, unavailable or unmapped Cog. */ }
  const response = NextResponse.redirect(new URL(next, origin), 303);
  const options = { httpOnly: true, secure: origin.startsWith("https:"), sameSite: "lax" as const, path: "/" };
  response.cookies.set(FLOW_COOKIE, "", { ...options, maxAge: 0 });
  response.cookies.set(CHECK_COOKIE, "1", { ...options, maxAge: 300 });
  response.cookies.set(GRANT_COOKIE, grant?.cookie || "", { ...options, maxAge: grant?.ttl || 0 });
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
