// Retorno do provedor: GET /api/auth/<provider>/callback?code=…&state=…
// A Apple devolve por POST (response_mode=form_post), com os mesmos campos no corpo.
import { NextRequest, NextResponse } from "next/server";
import { STATE_COOKIE, appleUserName, callbackUrl, fetchProfile, isProviderConfigured, parseProvider, publicOrigin, verifyState } from "@/lib/social-auth";
import { upsertSocialAccount } from "@/lib/social-accounts";
import { getMember, setMemberCookie } from "@/lib/member-auth";

type Params = { params: Promise<{ provider: string }> };

async function handle(req: NextRequest, { params }: Params, query: URLSearchParams) {
  const provider = parseProvider((await params).provider);
  const origin = publicOrigin(req.headers.get("x-forwarded-host"), req.headers.get("host"), req.headers.get("x-forwarded-proto"));
  if (!provider || !origin) return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });

  // 303 para que o navegador siga com GET mesmo após o POST da Apple.
  const redirect = (path: string) => NextResponse.redirect(`${origin}${path}`, 303);
  const fail = (code: string) => {
    const res = redirect(`/conta?erro=${code}`);
    res.cookies.set(STATE_COOKIE, "", { path: "/api/auth", maxAge: 0 });
    return res;
  };
  if (!isProviderConfigured(provider)) return fail("indisponivel");

  // Usuário cancelou na tela do provedor.
  if (query.get("error")) return fail("cancelado");
  const state = verifyState(req.cookies.get(STATE_COOKIE)?.value, query.get("state"), provider);
  if (!state) return fail("sessao");
  const code = query.get("code");
  if (!code) return fail("cancelado");

  try {
    const profile = await fetchProfile(provider, code, callbackUrl(origin, provider), fetch, { appleName: appleUserName(query.get("user")) });
    const current = await getMember().catch(() => null);
    const accountId = await upsertSocialAccount(profile, current?.id ?? null);
    const res = redirect(state.returnTo);
    res.cookies.set(STATE_COOKIE, "", { path: "/api/auth", maxAge: 0 });
    setMemberCookie(res, accountId);
    return res;
  } catch (error) {
    console.error(`[auth:${provider}] falha no login`, error);
    // Conta pessoal no Instagram costuma cair aqui ou já na tela da Meta.
    return fail(provider === "instagram" ? "instagram" : "falha");
  }
}

export function GET(req: NextRequest, ctx: Params) {
  return handle(req, ctx, req.nextUrl.searchParams);
}

export async function POST(req: NextRequest, ctx: Params) {
  const form = await req.formData().catch(() => null);
  const query = new URLSearchParams();
  for (const key of ["code", "state", "error", "user"]) {
    const value = form?.get(key);
    if (typeof value === "string") query.set(key, value);
  }
  return handle(req, ctx, query);
}
