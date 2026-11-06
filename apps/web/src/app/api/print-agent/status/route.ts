import { sql } from 'drizzle-orm';
import { db } from '@/db';
import { authorizePrintAgent } from '@/lib/kitchen-print-auth';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  const denied = authorizePrintAgent(request);
  if (denied) return denied;
  const result = await db.execute<{ enabled: boolean }>(sql`SELECT EXISTS (
    SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE t.tgname='orders_print_on_insert' AND t.tgenabled IN ('O','A') AND c.relname='orders' AND n.nspname=current_schema()
  ) AS enabled`);
  return Response.json({ ticketVersions: [1, 2], allChannels: result.rows[0]?.enabled === true }, { headers: { 'Cache-Control': 'no-store' } });
}
