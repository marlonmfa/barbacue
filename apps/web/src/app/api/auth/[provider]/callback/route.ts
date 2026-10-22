// Retorno da Meta: GET /api/auth/<provider>/callback?code=…&state=…
import { NextRequest, NextResponse } from "next/server";
import { STATE_COOKIE, callbackUrl, fetchProfile, isProviderConfigured, parseProvider, publicOrigin, verifyState } from "@/lib/social-auth";
import { upsertSocialAccount } from "@/lib/social-accounts";
import { getMember, setMemberCookie } from "@/lib/member-auth";

type Params = { params: Promise<{ provider: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const provider = parseProvider((await params).provider);
  const origin = publicOrigin(req.headers.get("x-forwarded-host"), req.headers.get("host"), req.headers.get("x-forwarded-proto"));
  if (!provider || !origin) return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });

  const fail = (code: string) => {
    const res = NextResponse.redirect(`${origin}/conta?erro=${code}`);
    res.cookies.set(STATE_COOKIE, "", { path: "/api/auth", maxAge: 0 });
    return res;
  };
  if (!isProviderConfigured(provider)) return fail("indisponivel");

  const query = req.nextUrl.searchParams;
  // Usuário cancelou na tela da Meta.
  if (query.get("error")) return fail("cancelado");
  const state = verifyState(req.cookies.get(STATE_COOKIE)?.value, query.get("state"), provider);
  if (!state) return fail("sessao");
  const code = query.get("code");
  if (!code) return fail("cancelado");

  try {
    const profile = await fetchProfile(provider, code, callbackUrl(origin, provider));
    const current = await getMember().catch(() => null);
    const accountId = await upsertSocialAccount(profile, current?.id ?? null);
    const res = NextResponse.redirect(`${origin}${state.returnTo}`);
    res.cookies.set(STATE_COOKIE, "", { path: "/api/auth", maxAge: 0 });
    setMemberCookie(res, accountId);
    return res;
  } catch (error) {
    console.error(`[auth:${provider}] falha no login`, error);
    // Conta pessoal no Instagram costuma cair aqui ou já na tela da Meta.
    return fail(provider === "instagram" ? "instagram" : "falha");
  }
}
