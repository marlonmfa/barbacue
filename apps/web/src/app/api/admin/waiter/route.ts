import { NextResponse } from "next/server";
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { orders, restaurantFloorPlan, restaurantTables } from "@/db/schema";
import { withStaff } from "@/lib/admin-auth";

import { can } from "@/lib/permissions";
import { FLOOR_COLUMNS, FLOOR_ROWS, MAX_FLOOR_ELEMENTS, MAX_TABLE_NUMBER, overlaps, type FloorElement, type FloorRect } from "@/lib/floor-plan";

export const GET = withStaff(async (_req, _ctx, session) => {
  const { tables, rows, plan } = await db.transaction(async tx => {
    const tables = await tx.select({ id: restaurantTables.id, number: restaurantTables.number, label: restaurantTables.label, token: restaurantTables.token })
      .from(restaurantTables).where(eq(restaurantTables.active, true)).orderBy(asc(restaurantTables.number));
    const rows = await tx.select({ id: orders.id, brand: orders.brand, tableId: orders.tableId, tableNumber: restaurantTables.number, items: orders.items, notes: orders.notes, status: orders.status, createdAt: orders.createdAt })
      .from(orders).leftJoin(restaurantTables, eq(orders.tableId, restaurantTables.id))
      .where(and(eq(orders.orderType, "dine_in"), inArray(orders.status, ["pending", "confirmed", "preparing", "ready"])))
      .orderBy(asc(orders.createdAt)).limit(200);
    const [plan] = await tx.select({ revision: restaurantFloorPlan.revision, elements: restaurantFloorPlan.elements })
      .from(restaurantFloorPlan).where(eq(restaurantFloorPlan.id, 1));
    return { tables, rows, plan };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
  return NextResponse.json({ tables, plan, canManagePlan: can(session, "tables"), orders: rows.map(row => ({ ...row, items: Array.isArray(row.items) ? row.items.map((item: { name?: string; qty?: number; notes?: string | null }) => ({ name: item.name ?? "Item", qty: item.qty ?? 1, notes: item.notes ?? null })) : [] })) }, { headers: { "Cache-Control": "no-store" } });
});

const serveSchema = z.object({ id: z.string().uuid(), status: z.literal("delivered") }).strict();
export const PATCH = withStaff(async req => {
  const parsed = serveSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Informe o pedido pronto para servir." }, { status: 422 });
  // Compare-and-set protects against stale screens and prevents floor access
  // from completing delivery/pickup orders or bypassing preparation.
  const [updated] = await db.update(orders).set({ status: "delivered", deliveredAt: new Date() })
    .where(and(eq(orders.id, parsed.data.id), eq(orders.orderType, "dine_in"), eq(orders.status, "ready")))
    .returning({ id: orders.id, status: orders.status });
  if (!updated) return NextResponse.json({ error: "Este pedido não está pronto para servir ou já mudou de etapa. Atualize o salão." }, { status: 409 });
  return NextResponse.json(updated);
});


const rectFields = {
  id: z.string().uuid(),
  x: z.number().int().nonnegative(),
  y: z.number().int().nonnegative(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
};
const elementSchema = z.discriminatedUnion("kind", [
  z.object({ ...rectFields, kind: z.literal("area"), name: z.string().trim().min(1).max(60), locked: z.boolean() }).strict(),
  z.object({ ...rectFields, kind: z.literal("table"), tableId: z.number().int().positive().max(MAX_TABLE_NUMBER).nullable(), reference: z.string().trim().max(60).optional() }).strict(),
]);
const revisionSchema = z.number().int().nonnegative();
const planSchema = z.object({
  revision: revisionSchema,
  elements: z.array(elementSchema).max(MAX_FLOOR_ELEMENTS),
  unlockedAreaIds: z.array(z.string().uuid()).max(MAX_FLOOR_ELEMENTS).default([]),
}).strict();
const numberSchema = z.object({
  revision: revisionSchema,
  elementId: z.string().uuid(),
  number: z.number().int().positive().max(MAX_TABLE_NUMBER),
}).strict();

function floorError(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

function samePosition(a: FloorRect, b: FloorRect) {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

function validateElements(elements: FloorElement[], previous: FloorElement[], unlockedAreas: Set<string>) {
  const byId = new Map(elements.map(element => [element.id, element]));
  const tables = elements.filter(element => element.kind === "table");
  const linked = tables.flatMap(table => table.tableId === null ? [] : [table.tableId]);
  if (byId.size !== elements.length || new Set(linked).size !== linked.length) return "Cada mesa só pode aparecer uma vez na planta.";
  if (elements.some(element => element.x + element.width > FLOOR_COLUMNS || element.y + element.height > FLOOR_ROWS)) {
    return "Mantenha os elementos dentro dos limites da planta.";
  }
  if (tables.some((table, i) => tables.slice(i + 1).some(other => overlaps(table, other)))) return "As mesas não podem se sobrepor.";

  const previousById = new Map(previous.map(element => [element.id, element]));
  for (const area of previous) {
    if (area.kind !== "area" || !area.locked || unlockedAreas.has(area.id)) continue;
    const next = byId.get(area.id);
    if (next?.kind !== "area" || !next.locked || next.name !== area.name || !samePosition(area, next)) {
      return "Desbloqueie a área antes de editá-la ou removê-la.";
    }
    for (const element of [...previous, ...tables]) {
      if (element.kind !== "table" || !overlaps(area, element)) continue;
      const before = previousById.get(element.id);
      const after = byId.get(element.id);
      if (before?.kind !== "table" || after?.kind !== "table" || before.tableId !== after.tableId || !samePosition(before, after)) {
        return "Desbloqueie a área antes de alterar a disposição das mesas.";
      }
    }
  }
  return null;
}

const conflict = () => floorError("A planta foi atualizada em outro dispositivo. Saia da edição e abra a planta atualizada para tentar novamente.", 409);

export const PUT = withStaff(async (req, _ctx, session) => {
  if (!can(session, "tables")) return floorError("Você não tem permissão para editar a planta.", 403);
  const body = planSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return floorError("Dados da planta inválidos.", 422);
  const { revision, elements, unlockedAreaIds } = body.data;
  return db.transaction(async tx => {
    const [plan] = await tx.select().from(restaurantFloorPlan).where(eq(restaurantFloorPlan.id, 1)).for("update");
    if (plan.revision !== revision) return conflict();
    const invalid = validateElements(elements, plan.elements, new Set(unlockedAreaIds));
    if (invalid) return floorError(invalid, 422);

    const existing = new Set(plan.elements.flatMap(element => element.kind === "table" && element.tableId !== null ? [element.tableId] : []));
    const newLinks = elements.flatMap(element => element.kind === "table" && element.tableId !== null && !existing.has(element.tableId) ? [element.tableId] : []);
    if (newLinks.length) {
      const valid = await tx.select({ id: restaurantTables.id }).from(restaurantTables)
        .where(and(eq(restaurantTables.active, true), inArray(restaurantTables.id, newLinks))).for("share");
      if (valid.length !== newLinks.length) return floorError("Uma das mesas já não está ativa. Atualize o salão.", 409);
    }

    await tx.update(restaurantFloorPlan).set({ elements, revision: revision + 1 }).where(eq(restaurantFloorPlan.id, 1));
    return NextResponse.json({ elements, revision: revision + 1 });
  });
});

export const POST = withStaff(async (req, _ctx, session) => {
  if (!can(session, "tables")) return floorError("Você não tem permissão para numerar mesas.", 403);
  const body = numberSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return floorError("Informe um número de mesa válido.", 422);
  const { revision, elementId, number } = body.data;
  try {
    return await db.transaction(async tx => {
      const [plan] = await tx.select().from(restaurantFloorPlan).where(eq(restaurantFloorPlan.id, 1)).for("update");
      if (plan.revision !== revision) return floorError("A planta mudou em outro dispositivo. Confira a mesa e tente novamente.", 409);
      const element = plan.elements.find(item => item.id === elementId);
      if (element?.kind !== "table") return floorError("Mesa não encontrada na planta.", 404);
      const [linkedTable] = element.tableId === null ? [] : await tx.select().from(restaurantTables)
        .where(eq(restaurantTables.id, element.tableId)).for("update");
      if (linkedTable && !linkedTable.active) return floorError("Esta mesa está inativa. Reative-a no cadastro de mesas.", 409);
      const [table] = linkedTable
        ? await tx.update(restaurantTables).set({ number }).where(eq(restaurantTables.id, linkedTable.id)).returning()
        : await tx.insert(restaurantTables).values({ number }).returning();
      const elements = plan.elements.map(item => item.id === elementId ? { ...element, tableId: table.id } : item);
      await tx.update(restaurantFloorPlan).set({ elements, revision: revision + 1 }).where(eq(restaurantFloorPlan.id, 1));
      return NextResponse.json({ plan: { elements, revision: revision + 1 }, table });
    });
  } catch (error) {
    if ((error as { cause?: { code?: string } }).cause?.code === "23505") return floorError(`Já existe a mesa ${number}. Use outro número ou adicione a mesa cadastrada pela edição da planta.`, 409);
    throw error;
  }
});
