import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withStaff } from "@/lib/admin-auth";
import { IfoodApiError, ifoodSettings, pauseStore, resumeStore } from "@/lib/ifood-api";

type Params = { params: Promise<{ storeId: string }> };

const PauseSchema = z.object({
  minutes: z.number().int().min(5).max(24 * 60),
  description: z.string().trim().min(1).max(100),
}).strict();

function store(storeId: string) {
  return ifoodSettings().stores.find(s => s.id === storeId) ?? null;
}

function failure(error: unknown) {
  if (error instanceof IfoodApiError) return NextResponse.json({ error: error.message }, { status: error.status });
  throw error;
}

// Pausa a loja no iFood criando uma interrupção a partir de agora.
export const POST = withStaff(async (req: NextRequest, { params }: Params) => {
  const target = store((await params).storeId);
  if (!target) return NextResponse.json({ error: "Loja não encontrada." }, { status: 404 });
  const parsed = PauseSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Informe de 5 minutos a 24 horas e um motivo." }, { status: 422 });
  try {
    return NextResponse.json({ interruption: await pauseStore(target, parsed.data.minutes, parsed.data.description) });
  } catch (error) { return failure(error); }
});

// Reabre a loja removendo a interrupção indicada.
export const DELETE = withStaff(async (req: NextRequest, { params }: Params) => {
  const target = store((await params).storeId);
  if (!target) return NextResponse.json({ error: "Loja não encontrada." }, { status: 404 });
  const interruptionId = req.nextUrl.searchParams.get("interruption") ?? "";
  if (!/^[\w-]{1,64}$/.test(interruptionId)) return NextResponse.json({ error: "Interrupção inválida." }, { status: 422 });
  try {
    await resumeStore(target, interruptionId);
    return NextResponse.json({ ok: true });
  } catch (error) { return failure(error); }
});
