import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { betaSignups } from "@/db/schema";
import { betaSignupSchema } from "@/lib/beta-validation";

// Public endpoint: registers a beta tester from /beta. Re-submitting with the
// same WhatsApp updates the existing signup (people fix typos in email/name or
// switch phones) instead of erroring — the number is the identity.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = betaSignupSchema.safeParse(body);

  if (!parsed.success) {
    const message =
      parsed.error.issues[0]?.message ?? "Dados inválidos, revise o formulário";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const { name, whatsapp, email, platform } = parsed.data;

  const [signup] = await db
    .insert(betaSignups)
    .values({ name, whatsapp, email, platform })
    .onConflictDoUpdate({
      target: betaSignups.whatsapp,
      set: { name, email, platform },
    })
    .returning({ id: betaSignups.id, createdAt: betaSignups.createdAt });

  return NextResponse.json({ ok: true, id: signup.id }, { status: 201 });
}
