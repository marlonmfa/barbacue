import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { orders } from "@/db/schema";
import { withStaff } from "@/lib/admin-auth";
import { isBrand } from "@/lib/brands";

const ArchiveBatch = z.object({
  brand: z.string().refine(isBrand).nullable(),
  ids: z.array(z.guid()).min(1),
}).strict();

export const POST = withStaff(async request => {
  const parsed = ArchiveBatch.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Confira os pedidos e o restaurante antes de arquivar." }, { status: 422 });

  const { brand, ids } = parsed.data;
  const result = await db.update(orders).set({ archivedAt: new Date() }).where(and(
    isNull(orders.archivedAt),
    brand === null ? undefined : eq(orders.brand, brand),
    sql`${orders.id} = ANY(${sql.param(ids)}::uuid[])`,
  ));
  return Response.json({ archived: result.rowCount ?? 0 });
});
