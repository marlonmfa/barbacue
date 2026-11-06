import { NextRequest, NextResponse } from 'next/server';
import { withStaff } from '@/lib/admin-auth';
import { rateLimit } from '@/lib/rate-limit';
import { deliverDiagnostic } from '@/lib/diagnostic-delivery';
import { sanitizeDiagnostic } from '../../../../../../../packages/diagnostics/report.mjs';
export const runtime = 'nodejs';
export const GET = withStaff(async () => NextResponse.json({ emailConfigured: Boolean(process.env.COGMAIL_API_URL && process.env.COGMAIL_API_TOKEN && (process.env.ERROR_REPORT_EMAIL || process.env.COGMAIL_MAILBOX)) }, { headers: { 'Cache-Control': 'no-store' } }));
export const POST = withStaff(async (request: NextRequest, _context: unknown, account) => {
 const origin = request.headers.get('origin');
 let validOrigin = !origin; try { validOrigin ||= new URL(origin!).host === (request.headers.get('x-forwarded-host') || request.headers.get('host')); } catch {}
 if (!validOrigin) return NextResponse.json({ error: 'Origem inválida' }, { status: 403 });
 const limit = rateLimit(`diagnostics:${account.userId}`, 6, 600000, 600000);
 if (!limit.ok) return NextResponse.json({ error: 'Aguarde antes de reenviar o diagnóstico.' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfterSec) } });
 const reader = request.body?.getReader(); if (!reader) return NextResponse.json({ error: 'Relatório ausente' }, { status: 400 });
 const chunks: Uint8Array[] = []; let size = 0;
 for (;;) { const { value, done } = await reader.read(); if (done) break; size += value.length; if (size > 24000) { await reader.cancel(); return NextResponse.json({ error: 'Relatório muito grande' }, { status: 413 }); } chunks.push(value); }
 let input;
 try { input = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return NextResponse.json({ error: 'Relatório inválido' }, { status: 400 }); }
 if (!input || typeof input.message !== 'string' || !/^[a-f0-9-]{36}$/i.test(input.id || '')) return NextResponse.json({ error: 'Relatório inválido' }, { status: 400 });
 const report = sanitizeDiagnostic(input);
 try { await deliverDiagnostic(report, account.userId); return NextResponse.json({ delivered: true, id: report.id }, { headers: { 'Cache-Control': 'no-store' } }); }
 catch { return NextResponse.json({ error: 'Envio indisponível. O registro local será mantido para nova tentativa.' }, { status: 503 }); }
});
