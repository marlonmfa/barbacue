import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withStaff } from "@/lib/admin-auth";
import { answerReview, reviews } from "@/lib/ifood-ops";
import { ifoodFailure, notFound, storeFrom, type StoreParams } from "@/lib/ifood-route";

export const GET = withStaff(async (req: NextRequest, { params }: StoreParams) => {
  const store = await storeFrom(params); if (!store) return notFound();
  const page = Math.min(50, Math.max(1, Number(req.nextUrl.searchParams.get("page")) || 1));
  try { return NextResponse.json(await reviews(store, page), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return ifoodFailure(error); }
});

const Body = z.object({ reviewId: z.string().trim().min(1).max(80), text: z.string().trim().min(10).max(300) }).strict();

// Resposta pública da loja a uma avaliação do iFood.
export const POST = withStaff(async (req: NextRequest, { params }: StoreParams) => {
  const store = await storeFrom(params); if (!store) return notFound();
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Escreva de 10 a 300 caracteres." }, { status: 422 });
  try { await answerReview(store, parsed.data.reviewId, parsed.data.text); return NextResponse.json({ ok: true }); }
  catch (error) { return ifoodFailure(error); }
});
