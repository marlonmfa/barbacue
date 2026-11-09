import { NextResponse } from "next/server";
import { z } from "zod";
import { withRole } from "@/lib/admin-auth";
import { classifyTransaction, ExtratoError, importStatement, listTransactions } from "@/lib/financeiro/extratos";

const MAX_OFX_BYTES = 5_000_000;
const importBody = z.object({
  brand: z.enum(["barbacue", "chelas", "barbadog"]),
  bank: z.string().trim().min(2).max(60),
  ofx: z.string().min(20).max(MAX_OFX_BYTES),
});
const classifyBody = z.object({
  id: z.number().int().positive(),
  action: z.enum(["post", "ignore", "review"]),
  category: z.string().max(40).nullable().optional(),
  remember: z.boolean().optional(),
});

function fail(error: unknown, fallback: string) {
  if (error instanceof ExtratoError) return NextResponse.json({ error: error.message }, { status: error.status });
  console.error("[extratos]", error);
  return NextResponse.json({ error: fallback }, { status: 500 });
}

export const GET = withRole("admin", async (req) => {
  const status = new URL(req.url).searchParams.get("status") ?? "pending";
  const valid = ["pending", "posted", "ignored", "all"] as const;
  try {
    return NextResponse.json(await listTransactions(valid.includes(status as (typeof valid)[number]) ? (status as (typeof valid)[number]) : "pending"), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return fail(error, "Não foi possível ler os extratos. Confira se a migração 0031 foi aplicada.");
  }
});

export const POST = withRole("admin", async (req, _ctx, session) => {
  const parsed = importBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Envie a loja, o banco e um arquivo OFX de até 5 MB." }, { status: 422 });
  try {
    return NextResponse.json(await importStatement(parsed.data, session.userId));
  } catch (error) {
    return fail(error, "Não foi possível importar o extrato.");
  }
});

export const PATCH = withRole("admin", async (req, _ctx, session) => {
  const parsed = classifyBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Classificação inválida." }, { status: 422 });
  try {
    return NextResponse.json(await classifyTransaction(parsed.data, session.userId));
  } catch (error) {
    return fail(error, "Não foi possível salvar a classificação.");
  }
});
