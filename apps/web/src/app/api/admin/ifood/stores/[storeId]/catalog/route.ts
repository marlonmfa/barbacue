import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withStaff } from "@/lib/admin-auth";
import { setItemAvailability, setItemPrice, storeCatalog } from "@/lib/ifood-ops";
import { ifoodFailure, notFound, storeFrom, type StoreParams } from "@/lib/ifood-route";

export const GET = withStaff(async (_req: NextRequest, { params }: StoreParams) => {
  const store = await storeFrom(params); if (!store) return notFound();
  try { return NextResponse.json(await storeCatalog(store), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return ifoodFailure(error); }
});

const Patch = z.object({
  itemId: z.string().trim().min(1).max(80),
  available: z.boolean().optional(),
  priceCents: z.number().int().positive().max(10_000_000).optional(),
  originalPriceCents: z.number().int().positive().max(10_000_000).nullable().optional(),
}).strict().refine(v => v.available !== undefined || v.priceCents !== undefined);

// Disponibilidade e preço de um item no iFood.
export const PATCH = withStaff(async (req: NextRequest, { params }: StoreParams) => {
  const store = await storeFrom(params); if (!store) return notFound();
  const parsed = Patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Informe o item e a mudança." }, { status: 422 });
  try {
    if (parsed.data.available !== undefined) await setItemAvailability(store, parsed.data.itemId, parsed.data.available);
    if (parsed.data.priceCents !== undefined) await setItemPrice(store, parsed.data.itemId, parsed.data.priceCents, parsed.data.originalPriceCents);
    return NextResponse.json({ ok: true });
  } catch (error) { return ifoodFailure(error); }
});
