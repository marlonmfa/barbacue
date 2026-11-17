import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { db } from "@/db";
import { withRole } from "@/lib/admin-auth";
import { externalCategories, type ExternalAccount } from "@/lib/external-account-categories";

async function seed(): Promise<ExternalAccount[]> {
  const file = process.env.EXTERNAL_ACCOUNTS_SEED || path.resolve(process.cwd(), "../../secrets/auditoria/fila-contas-externas.json");
  return JSON.parse(await readFile(file, "utf8"));
}
async function ensureTable() {
  await db.$client.query(`CREATE TABLE IF NOT EXISTS financial_external_reviews (
    id text PRIMARY KEY, category text NOT NULL, status text NOT NULL,
    identity text NOT NULL DEFAULT '', notes text NOT NULL DEFAULT '',
    version integer NOT NULL DEFAULT 1, actor_id integer NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now())`);
}
export const GET = withRole("admin", async () => {
  try {
    const rows = await seed();
    await ensureTable();
    const result = await db.$client.query("SELECT id, category, status, identity, notes, version FROM financial_external_reviews");
    const reviews = new Map(result.rows.map(r => [r.id, r]));
    return NextResponse.json({ rows: rows.map(r => ({ ...r, ...reviews.get(r.id) })), categories: externalCategories }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("External account queue unavailable", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Fila indisponível. Verifique o acervo privado e o banco de dados." }, { status: 503 });
  }
});
const review = z.object({
  id: z.string().min(1).max(200), category: z.enum(externalCategories),
  status: z.enum(["pending", "investigating", "confirmed"]),
  identity: z.string().max(400), notes: z.string().max(4000), version: z.number().int().min(0),
}).refine(r => r.status !== "confirmed" || (r.identity.trim().length > 0 && r.category !== "A identificar" && r.notes.trim().length > 0), "Informe identificação, categoria e evidência antes de confirmar.");
export const POST = withRole("admin", async (req, _ctx, session) => {
  const parsed = review.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Verifique os campos. A confirmação exige identificação, categoria e evidência." }, { status: 422 });
  const r = parsed.data;
  try {
    if (!(await seed()).some(item => item.id === r.id)) return NextResponse.json({ error: "Item não encontrado." }, { status: 404 });
    await ensureTable();
    const result = await db.$client.query(`INSERT INTO financial_external_reviews (id,category,status,identity,notes,actor_id)
      SELECT $1,$2,$3,$4,$5,$6 WHERE $7 = 0
      ON CONFLICT (id) DO UPDATE SET category=$2,status=$3,identity=$4,notes=$5,actor_id=$6,
      version=financial_external_reviews.version+1,updated_at=now() WHERE financial_external_reviews.version=$7
      RETURNING version`, [r.id,r.category,r.status,r.identity.trim(),r.notes.trim(),session.userId,r.version]);
    if (!result.rowCount && r.version > 0) {
      const updated = await db.$client.query(`UPDATE financial_external_reviews SET category=$2,status=$3,identity=$4,notes=$5,actor_id=$6,version=version+1,updated_at=now() WHERE id=$1 AND version=$7 RETURNING version`, [r.id,r.category,r.status,r.identity.trim(),r.notes.trim(),session.userId,r.version]);
      if (updated.rowCount) return NextResponse.json({ version: updated.rows[0].version });
    }
    if (!result.rowCount) return NextResponse.json({ error: "Este item mudou em outra sessão. Atualize a fila." }, { status: 409 });
    return NextResponse.json({ version: result.rows[0].version });
  } catch { return NextResponse.json({ error: "Não foi possível salvar a classificação." }, { status: 503 }); }
});
