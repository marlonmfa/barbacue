import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  setAdminCookie,
  clearAdminCookie,
  assertSecretsConfigured,
  parseSession,
  resolveStaffSession,
  resolveRequestStaff,
} from "@/lib/admin-auth";
import { authenticateStaff } from "@/lib/staff-auth";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { endCogSession } from "@/lib/cog-sso";

const LoginSchema = z.object({
  username: z.string().trim().min(1).max(254),
  password: z.string().min(1).max(256),
});

// The desktop renders its own local UI and resolves the current account through
// the same HttpOnly online session. No password, hash or signing key is exposed.
export async function GET(req: NextRequest) {
  const session = await resolveRequestStaff(req.cookies.get("barbacue_admin")?.value, req.cookies.get("cogia_sessao")?.value);
  const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401, headers });
  const { userId, role, name, jobTitle, permissions, mustChangePassword } = session;
  return NextResponse.json({ session: { userId, role, name, jobTitle, permissions, mustChangePassword }, desktopApiVersion: 1 }, { headers });
}

export async function POST(req: NextRequest) {
  // Sessions need a signing secret; passwords belong to individual accounts.
  try {
    assertSecretsConfigured();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Servidor mal configurado." },
      { status: 500 },
    );
  }

  // Brute-force guard: per-IP attempt budget, then a lockout with backoff.
  const ip = clientIp(req);
  const limit = rateLimit(`admin-login:${ip}`, 8, 60_000, 5 * 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Muitas tentativas. Tente novamente em alguns minutos." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } },
    );
  }

  const parsed = LoginSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Informe seu usuário ou e-mail e sua senha." }, { status: 422 });
  }
  const { username, password } = parsed.data;

  // Single generic error for every failure mode so the response can't be used to
  // enumerate valid usernames.
  const GENERIC = "Credenciais inválidas";

  const session = await authenticateStaff(username, password);
  if (!session) {
    return NextResponse.json({ error: GENERIC }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true, role: session.role, mustChangePassword: session.mustChangePassword });
  await setAdminCookie(res, session);
  return res;
}

export async function DELETE(req: NextRequest) {
  const central = req.cookies.get("cogia_sessao")?.value;
  try { await endCogSession(central); } catch { return NextResponse.json({ error: "Não foi possível encerrar a sessão Cog. Tente novamente." }, { status: 503 }); }
  const res = NextResponse.json({ ok: true });
  if (central && process.env.COGIA_SSO_IDENTITY_KEY) res.cookies.set("cogia_sessao", "", { domain: "cog.ia.br", path: "/", maxAge: 0, httpOnly: true, secure: true, sameSite: "lax" });
  clearAdminCookie(res);
  return res;
}
