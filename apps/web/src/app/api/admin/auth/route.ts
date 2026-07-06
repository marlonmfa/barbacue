import { NextRequest, NextResponse } from "next/server";
import {
  setAdminCookie,
  clearAdminCookie,
  isValidAdminPassword,
  assertSecretsConfigured,
} from "@/lib/admin-auth";
import { authenticateStaff } from "@/lib/staff-auth";
import { rateLimit, clientIp } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  // Refuse to authenticate at all if the server is misconfigured (placeholder
  // secrets) — better a loud 500 than a silently-guessable admin.
  try {
    assertSecretsConfigured();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Servidor mal configurado." },
      { status: 500 },
    );
  }

  // Brute-force guard: per-IP attempt budget, then a lockout with backoff. The
  // password-only master path is the most sensitive, so the same bucket covers both.
  const ip = clientIp(req);
  const limit = rateLimit(`admin-login:${ip}`, 8, 60_000, 5 * 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Muitas tentativas. Tente novamente em alguns minutos." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } },
    );
  }

  const { username, password } = await req
    .json()
    .catch(() => ({ username: "", password: "" }));

  // Single generic error for every failure mode so the response can't be used to
  // enumerate valid usernames or distinguish the master path.
  const GENERIC = "Credenciais inválidas";

  if (username && String(username).trim()) {
    const session = await authenticateStaff(String(username), String(password ?? ""));
    if (!session) {
      return NextResponse.json({ error: GENERIC }, { status: 401 });
    }
    const res = NextResponse.json({ ok: true, role: session.role });
    await setAdminCookie(res, session);
    return res;
  }

  if (!isValidAdminPassword(String(password ?? ""))) {
    return NextResponse.json({ error: GENERIC }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true, role: "admin" });
  await setAdminCookie(res, { userId: 0, role: "admin" });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  clearAdminCookie(res);
  return res;
}
