import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { sanitizeDiagnostic, diagnosticFingerprint } from '../../../../packages/diagnostics/report.mjs';
const active = new Map<string, Promise<void>>();
export async function sendDiagnosticEmail(report: ReturnType<typeof sanitizeDiagnostic>, idempotencyKey: string) {
 const base = process.env.COGMAIL_API_URL, token = process.env.COGMAIL_API_TOKEN;
 const to = process.env.ERROR_REPORT_EMAIL || process.env.COGMAIL_MAILBOX;
 if (!base || !token || !to) throw new Error('Diagnostic email not configured');
 const url = new URL(`${base.replace(/\/$/, '')}/enviar`);
 if (url.protocol !== 'https:' && !['127.0.0.1', 'localhost'].includes(url.hostname)) throw new Error('HTTPS required');
 const response = await fetch(url, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20000), headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
  body: JSON.stringify({ para: [to], assunto: `Barbacue — erro ${report.platform} ${report.version}`, nome: 'Barbacue — diagnóstico', texto: JSON.stringify(report, null, 2) }) });
 if (!response.ok) throw new Error(`Email delivery failed (${response.status})`);
}
export async function deliverDiagnostic(input: ReturnType<typeof sanitizeDiagnostic>, userId: number, options: { directory?: string; send?: typeof sendDiagnosticEmail } = {}) {
 const report = sanitizeDiagnostic(input);
 const key = createHash('sha256').update(`${userId}:${diagnosticFingerprint(report)}:${Math.floor(Date.parse(report.time) / 600000)}`).digest('hex');
 if (active.has(key)) { await active.get(key); return; }
 const operation = (async () => {
  const directory = options.directory || process.env.DIAGNOSTICS_DIR || join(process.cwd(), 'private-diagnostics');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const file = join(directory, `${key}.json`);
  try { const saved = JSON.parse(await readFile(file, 'utf8')); if (saved.delivered) return; } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  const save = async (delivered: boolean) => { await writeFile(`${file}.tmp`, JSON.stringify({ report, delivered }), { mode: 0o600 }); await rename(`${file}.tmp`, file); };
  await save(false);
  await (options.send || sendDiagnosticEmail)(report, `barbacue-error-${key}`);
  await save(true);
 })();
 active.set(key, operation);
 try { await operation; } finally { active.delete(key); }
}
