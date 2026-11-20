import { NextRequest, NextResponse } from "next/server";
import { resolveRequestStaff } from "@/lib/admin-auth";

import { canAccessPath, landingPath } from "@/lib/permissions";

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isApi = pathname.startsWith("/api/admin");
  const currentStaff = (pathname.startsWith("/admin") || pathname.startsWith("/api/admin") || pathname.startsWith("/whatsapp") || pathname.startsWith("/teste_pedido") || pathname === "/conta")
    ? await resolveRequestStaff(req.cookies.get("barbacue_admin")?.value, req.cookies.get("cogia_sessao")?.value)
    : null;
  if (pathname === "/conta" && currentStaff && req.method === "GET" && req.headers.get("accept")?.includes("text/html")) {
    return NextResponse.redirect(new URL("/admin", req.url));
  }
  const deliveryLink = pathname === "/admin/delivery" &&
    (req.nextUrl.searchParams.has("confirma") || req.nextUrl.searchParams.has("rota"));
  const host = (req.headers.get("x-forwarded-host") || req.headers.get("host") || "").toLowerCase();
  if (!deliveryLink && req.method === "GET" && (pathname.startsWith("/admin") || pathname === "/conta") && req.headers.get("accept")?.includes("text/html") && host === "barbacue.cog.ia.br" &&
      process.env.COGIA_SSO_IDENTITY_KEY && !req.cookies.get("cogia_sessao") && !req.cookies.get("cog_barbacue_checked")) {
    const destination = `https://barbacue.cog.ia.br${pathname === "/conta" ? "/conta" : "/admin"}`;
    const response = NextResponse.redirect(`https://cog.ia.br/api/sso/continuar?${new URLSearchParams({ destino: destination })}`, 303);
    response.cookies.set("cog_barbacue_checked", "1", { maxAge: 300, path: "/", httpOnly: true, secure: true, sameSite: "lax" });
    response.headers.set("Cache-Control", "no-store");
    return response;
  }

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
    const session = currentStaff;
    if (!session) {
      if (isApi) {
        return NextResponse.json({ error: "unauthorized" }, { status: 401 });
      }
      const loginUrl = req.nextUrl.clone();
      loginUrl.pathname = "/admin/login";
      return NextResponse.redirect(loginUrl);
    }
    const passwordChangePath = pathname === "/admin/change-password" || pathname === "/api/admin/change-password" || pathname === "/api/admin/change-password/email";
    if (session.mustChangePassword && !passwordChangePath) {
      if (isApi) return NextResponse.json({ error: "Altere sua senha para continuar.", mustChangePassword: true }, { status: 403 });
      const changePassword = new URL("/admin/change-password", req.url);
      if (deliveryLink) {
        for (const key of ["confirma", "rota"]) {
          const value = req.nextUrl.searchParams.get(key);
          if (value) changePassword.searchParams.set(key, value);
        }
      }
      return NextResponse.redirect(changePassword);
    }
    if (passwordChangePath) return NextResponse.next();
    if (!canAccessPath(session, pathname)) {
      if (isApi) return NextResponse.json({ error: "Você não tem permissão para esta função." }, { status: 403 });
      return NextResponse.redirect(new URL(landingPath(session), req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/conta", "/admin/:path*", "/api/admin/:path*", "/whatsapp/:path*", "/teste_pedido/:path*"],
};
