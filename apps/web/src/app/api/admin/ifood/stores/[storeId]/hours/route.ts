import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withStaff } from "@/lib/admin-auth";
import { DAYS, openingHours, saveOpeningHours } from "@/lib/ifood-ops";
import { ifoodFailure, notFound, storeFrom, type StoreParams } from "@/lib/ifood-route";

export const GET = withStaff(async (_req: NextRequest, { params }: StoreParams) => {
  const store = await storeFrom(params); if (!store) return notFound();
  try { return NextResponse.json({ shifts: await openingHours(store) }, { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return ifoodFailure(error); }
});

const Body = z.object({ shifts: z.array(z.object({ dayOfWeek: z.enum(DAYS), start: z.string(), duration: z.number().int() }).strict()).max(70) }).strict();

// Substitui os horários da loja no iFood (todos os turnos da semana de uma vez).
export const PUT = withStaff(async (req: NextRequest, { params }: StoreParams, session) => {
  if (!["admin", "manager"].includes(session.role)) return NextResponse.json({ error: "Somente administradores e gerentes alteram horários." }, { status: 403 });
  const store = await storeFrom(params); if (!store) return notFound();
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Turnos inválidos." }, { status: 422 });
  try { await saveOpeningHours(store, parsed.data.shifts); return NextResponse.json({ ok: true }); }
  catch (error) { return ifoodFailure(error); }
});
