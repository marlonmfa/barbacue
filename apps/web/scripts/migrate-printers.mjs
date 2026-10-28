// Add only restaurant-printer routing to an existing installation. Earlier
// migrations, orders, volumes and operational configuration are left intact.
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

if (!process.env.DATABASE_URL) {
  const { config } = await import('dotenv');
  config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });
}
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const tag = '0017_restaurant_printers';
const source = await readFile(new URL(`../drizzle/migrations/${tag}.sql`, import.meta.url), 'utf8');
const journal = JSON.parse(await readFile(new URL('../drizzle/migrations/meta/_journal.json', import.meta.url), 'utf8'));
const migration = journal.entries.find(entry => entry.tag === tag);
if (!migration) throw new Error('Printer migration missing from journal');
const hash = createHash('sha256').update(source).digest('hex');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 });
const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(73149206)');
  await client.query('CREATE SCHEMA IF NOT EXISTS drizzle');
  await client.query('CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (id serial primary key, hash text not null, created_at bigint)');
  const { rows } = await client.query('SELECT hash FROM drizzle.__drizzle_migrations WHERE created_at=$1', [migration.when]);
  if (rows.length) {
    if (rows[0].hash !== hash) throw new Error('Migration history differs from this revision; inspect before continuing');
  } else {
    const check = await client.query(`SELECT to_regclass('public.kitchen_print_jobs') AS jobs,
      to_regclass('public.kitchen_print_devices') AS devices, to_regclass('public.kitchen_printer_routes') AS routes`);
    if (!check.rows[0].jobs || check.rows[0].devices || check.rows[0].routes) throw new Error('Existing printer schema requires inspection before applying migration');
    for (const statement of source.split('--> statement-breakpoint')) if (statement.trim()) await client.query(statement);
    await client.query('INSERT INTO drizzle.__drizzle_migrations(hash,created_at) VALUES($1,$2)', [hash, migration.when]);
  }
  await client.query('COMMIT');
  console.log(rows.length ? 'Restaurant-printer migration already applied.' : 'Restaurant-printer migration applied. Existing orders and default printing preserved.');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally { client.release(); await pool.end(); }
