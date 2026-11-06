import { renewAdminCookie, cogRequestAllowed } from "@/lib/admin-auth";
import { resolveNativeCogEmail, NATIVE_COG_HEADER } from "@/lib/cog-native";
import { actorView } from "@/lib/session-view";
import { resolveRequestMember } from "@/lib/member-auth";
import { oidcConfig, requestOrigin, GRANT_COOKIE, CHECK_COOKIE } from "@/lib/cog-oidc";
import { NextRequest, NextResponse } from "next/server";
import { resolveRequestStaff } from "@/lib/admin-auth";

import { canAccessPath, landingPath } from "@/lib/permissions";

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const origin=requestOrigin(req.headers), federation=oidcConfig(origin);
  const nativeCogEmail=await resolveNativeCogEmail(req.headers.get(NATIVE_COG_HEADER));
  const nativeApp=req.headers.get('X-Barbacue-Native')==='1';
  const needsStaff=pathname.startsWith('/admin') || pathname.startsWith('/api/admin') || pathname.startsWith('/whatsapp') || pathname.startsWith('/teste_pedido');
  const currentStaff=(needsStaff || pathname==='/conta') ? await resolveRequestStaff(req.cookies.get('barbacue_admin')?.value,req.cookies.get('cogia_sessao')?.value,req.headers,req.cookies.get(GRANT_COOKIE)?.value) : null;
  const currentMember=pathname==='/conta' ? await resolveRequestMember(req.cookies.get('barbacue_member')?.value,req.cookies.get('cogia_sessao')?.value,req.headers,req.cookies.get(GRANT_COOKIE)?.value) : null;
  if(currentStaff && !cogRequestAllowed(currentStaff,req))return NextResponse.json({error:'Origem recusada.'},{status:403,headers:{'Cache-Control':'no-store'}});

  if(!currentStaff && !currentMember && !nativeApp && !nativeCogEmail && federation && req.method==='GET' && (pathname.startsWith('/admin') || pathname==='/conta') && pathname!=='/admin/change-password' &&
     req.headers.get('accept')?.includes('text/html') && !req.headers.get('rsc') && !req.cookies.get(CHECK_COOKIE)) {
    const response=NextResponse.redirect(new URL('/api/auth/cog/start?'+new URLSearchParams({next:pathname}),origin),303);
    response.headers.set('Cache-Control','no-store');return response;
  }
  const isApi = pathname.startsWith("/api/admin");
  const host=(req.headers.get('x-forwarded-host') || req.headers.get('host') || '').toLowerCase();
  if(!currentStaff && !currentMember && !nativeApp && !nativeCogEmail && req.method==='GET' && (pathname.startsWith('/admin') || pathname==='/conta') && req.headers.get('accept')?.includes('text/html') && host==='barbacue.cog.ia.br' &&
     process.env.COGIA_SSO_IDENTITY_KEY && !req.cookies.get('cogia_sessao') && !req.cookies.get('cog_barbacue_checked')){
    const response=NextResponse.redirect('https://cog.ia.br/api/sso/continuar?'+new URLSearchParams({destino:'https://barbacue.cog.ia.br'+(pathname==='/conta'?'/conta':'/admin')}),303);
    response.cookies.set('cog_barbacue_checked','1',{maxAge:300,path:'/',httpOnly:true,secure:true,sameSite:'lax'});
    response.headers.set('Cache-Control','no-store');return response;
  }

  if(federation && req.cookies.get(GRANT_COOKIE) && ['POST','PUT','PATCH','DELETE'].includes(req.method) &&
     req.headers.get('origin') && req.headers.get('origin')!==origin)
    return NextResponse.json({error:'Origem recusada.'},{status:403,headers:{'Cache-Control':'no-store'}});
  const expectedView=req.headers.get('X-Cog-View');
  if(expectedView && ['POST','PUT','PATCH','DELETE'].includes(req.method) &&
     !(req.method==='POST' && ['/api/admin/auth','/api/account'].includes(pathname))) {
    const args=[req.cookies.get('cogia_sessao')?.value,req.headers,req.cookies.get(GRANT_COOKIE)?.value] as const;
    const [staff,member]=await Promise.all([resolveRequestStaff(req.cookies.get('barbacue_admin')?.value,...args),resolveRequestMember(req.cookies.get('barbacue_member')?.value,...args)]);
    if(expectedView!==await actorView(origin,staff,member))return NextResponse.json({error:'A sessão mudou. Atualize a página antes de continuar.'},{status:409,headers:{'Cache-Control':'no-store'}});
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
      return NextResponse.redirect(new URL("/admin/change-password", req.url));
    }
    if (passwordChangePath) return NextResponse.next();
    if (!canAccessPath(session, pathname)) {
      if (isApi) return NextResponse.json({ error: "Você não tem permissão para esta função." }, { status: 403 });
      return NextResponse.redirect(new URL(landingPath(session), req.url));
    }
    const response = NextResponse.next();
    await renewAdminCookie(response, req.cookies.get("barbacue_admin")?.value ?? "", session);
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/pedir", "/conta", "/admin/:path*", "/api/admin/:path*", "/api/account", "/api/auth/cog/:path*", "/whatsapp/:path*", "/teste_pedido/:path*"],
};
