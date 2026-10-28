// Início do login social: GET /api/auth/instagram?returnTo=/cart
import { NextRequest, NextResponse } from "next/server";
import { STATE_COOKIE, STATE_MAX_AGE, authorizeUrl, callbackUrl, createState, isProviderConfigured, parseProvider, publicOrigin } from "@/lib/social-auth";
import { clientIp, rateLimit } from "@/lib/rate-limit";

type Params = { params: Promise<{ provider: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const provider = parseProvider((await params).provider);
  if (!provider) return NextResponse.json({ error: "Provedor desconhecido." }, { status: 404 });
  const origin = publicOrigin(req.headers.get("x-forwarded-host"), req.headers.get("host"), req.headers.get("x-forwarded-proto"));
  if (!origin) return NextResponse.json({ error: "Domínio não autorizado para login." }, { status: 400 });
  if (!isProviderConfigured(provider)) return NextResponse.redirect(`${origin}/conta?erro=indisponivel`);
  if (!rateLimit(`social-start:${clientIp(req)}`, 20, 60_000, 300_000).ok) return NextResponse.redirect(`${origin}/conta?erro=tentativas`);

  const { nonce, cookie } = createState(provider, req.nextUrl.searchParams.get("returnTo") ?? "/");
  const response = NextResponse.redirect(authorizeUrl(provider, callbackUrl(origin, provider), nonce));
  // A Apple volta com um POST vindo de appleid.apple.com: cookie Lax não seria enviado.
  const crossSitePost = provider === "apple" && origin.startsWith("https://");
  response.cookies.set(STATE_COOKIE, cookie, { httpOnly: true, secure: origin.startsWith("https://"), sameSite: crossSitePost ? "none" : "lax", path: "/api/auth", maxAge: STATE_MAX_AGE });
  return response;
}
