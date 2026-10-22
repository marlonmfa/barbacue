// Apply only the additive ERP migration on installations where earlier SQL
// migrations were applied manually. Does not replay or rewrite old migrations.
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import pg from "pg";
// Standalone production bundles receive DATABASE_URL through PM2 and do not
// ship dotenv. Load the optional development helper only when it is needed.
if (!process.env.DATABASE_URL) {
  const { config } = await import("dotenv");
  config({ path: fileURLToPath(new URL("../../../.env", import.meta.url)), quiet: true });
}
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 10000,
});
const client = await pool.connect();
const tag = "0014_handy_gamora";
const sql = readFileSync(
  new URL(`../drizzle/migrations/${tag}.sql`, import.meta.url),
  "utf8",
);
const journal = JSON.parse(
  readFileSync(
    new URL("../drizzle/migrations/meta/_journal.json", import.meta.url),
    "utf8",
  ),
);
const migration = journal.entries.find((e) => e.tag === tag);
try {
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(73149206)");
  await client.query("CREATE SCHEMA IF NOT EXISTS drizzle");
  await client.query(
    "CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (id serial primary key, hash text not null, created_at bigint)",
  );
  const applied = await client.query(
    "SELECT id FROM drizzle.__drizzle_migrations WHERE created_at = $1",
    [migration.when],
  );
  if (!applied.rowCount) {
    const existing = await client.query(
      "SELECT to_regclass('public.erp_recipes') AS recipes",
    );
    if (existing.rows[0].recipes)
      throw new Error(
        "ERP tables exist without migration history. Inspect before applying.",
      );
    for (const statement of sql.split("--> statement-breakpoint"))
      if (statement.trim()) await client.query(statement);
    await client.query(
      "INSERT INTO drizzle.__drizzle_migrations(hash, created_at) VALUES ($1,$2)",
      [createHash("sha256").update(sql).digest("hex"), migration.when],
    );
  }
  await client.query("COMMIT");
  const counts = await client.query(
    "SELECT brand, count(*)::int AS recipes FROM erp_recipes GROUP BY brand ORDER BY brand",
  );
  console.log(
    applied.rowCount
      ? "ERP migration already applied."
      : "ERP migration and catalog recipe import completed.",
  );
  console.table(counts.rows);
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}
