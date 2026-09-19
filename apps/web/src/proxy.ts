import { NextRequest, NextResponse } from "next/server";
import { parseSession, resolveStaffSession } from "@/lib/admin-auth";

import { canAccessPath, landingPath } from "@/lib/permissions";

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isApi = pathname.startsWith("/api/admin");

  // Allow the login page and the auth endpoint (login/logout) through
  if (pathname === "/admin/login" || pathname === "/api/admin/auth") {
    return NextResponse.next();
  }

  // Guard every other /admin page AND /api/admin endpoint. Gating the API
  // surface here is the single enforcement point — the route handlers hold the
  // data (customer PII, orders), and the page guard alone never protected them.
  if (
    pathname.startsWith("/admin") ||
    pathname.startsWith("/whatsapp") ||
    pathname.startsWith("/teste_pedido") ||
    isApi
  ) {
    const token = await parseSession(req.cookies.get("barbacue_admin")?.value ?? "");
    const session = token ? await resolveStaffSession(token) : null;
    if (!session) {
      if (isApi) {
        return NextResponse.json({ error: "unauthorized" }, { status: 401 });
      }
      const loginUrl = req.nextUrl.clone();
      loginUrl.pathname = "/admin/login";
      return NextResponse.redirect(loginUrl);
    }
    if (!canAccessPath(session, pathname)) {
      if (isApi) return NextResponse.json({ error: "Você não tem permissão para esta função." }, { status: 403 });
      return NextResponse.redirect(new URL(landingPath(session), req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*", "/whatsapp/:path*", "/teste_pedido/:path*"],
};
