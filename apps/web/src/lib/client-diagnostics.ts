'use client';
import { sanitizeDiagnostic, diagnosticFingerprint } from '../../../../packages/diagnostics/report.mjs';
type Report = ReturnType<typeof sanitizeDiagnostic>;
type Entry = Report & { delivery: string };
type Bridge = { retryErrors: () => Promise<unknown>; reportError: (input: Report) => Promise<{ok: boolean}>; diagnosticLog: () => Promise<{ok: boolean; value: Entry[]}>; saveErrorLog: () => Promise<{ok: boolean; value?: {saved: boolean}}> };
function bridge() { return (window as unknown as {workspace?: Bridge}).workspace; }
const key = 'barbacue-diagnostics-v1';
let memory: Entry[] = [], flushing = false;
let rawFetch: typeof fetch | undefined;
function load(): Entry[] { try { const value = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(value) ? value.slice(-100) : memory; } catch { return memory; } }
function save(entries: Entry[]) { memory = entries.slice(-100); try { localStorage.setItem(key, JSON.stringify(memory)); } catch {} window.dispatchEvent(new Event('barbacue:diagnostics')); }
export async function captureDiagnostic(input: { category?: string; error?: unknown; message?: string; route?: string; stack?: string }) {
 const report = sanitizeDiagnostic({ ...input, id: crypto.randomUUID(), platform: bridge() ? 'desktop' : 'browser', version: 'web-20261030.2', route: input.route || location.pathname });
 if (bridge()) { await bridge()!.reportError(report).catch(() => {}); return; }
 const entries = load();
 if (entries.some(e => diagnosticFingerprint(e) === diagnosticFingerprint(report) && Date.now() - Date.parse(e.time) < 600000)) return;
 save([...entries, { ...report, delivery: 'pending' }]);
 void flushDiagnostics();
}
export async function flushDiagnostics(manual = false) {
 if (bridge()) { if (manual) await bridge()!.retryErrors().catch(() => {}); return; }
 if (flushing || !navigator.onLine) return;
 flushing = true;
 try {
  for (const entry of load().filter(e => e.delivery === 'pending').slice(0, 6)) {
   let response;
   try { response = await (rawFetch || fetch)('/api/admin/diagnostics', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(sanitizeDiagnostic(entry)), signal: AbortSignal.timeout(25000) }); } catch { break; }
   const body = await response.json().catch(() => null);
   if (!response.ok || !body?.delivered) break;
   save(load().map(e => e.id === entry.id ? { ...e, delivery: 'sent' } : e));
  }
 } finally { flushing = false; }
}
export async function diagnosticLog(): Promise<Entry[]> {
 if (bridge()) { const result = await bridge()!.diagnosticLog(); return result.ok ? result.value : []; }
 return load().map(e => ({ ...sanitizeDiagnostic(e), delivery: e.delivery === 'sent' ? 'sent' : 'pending' }));
}
export async function saveErrorLog() {
 if (bridge()) { const result = await bridge()!.saveErrorLog(); if (!result.ok) throw Error('Não foi possível salvar o log.'); return; }
 const blob = new Blob([JSON.stringify(await diagnosticLog(), null, 2)], {type: 'application/json'});
 const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = `barbacue-erros-${new Date().toISOString().slice(0,10)}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function startClientDiagnostics() {
 const management = () => /^\/(admin(?:\/|$)|whatsapp(?:\/|$)|teste_pedido)/.test(location.pathname);
 const error = (event: ErrorEvent) => { if (management()) void captureDiagnostic({ category: 'runtime', error: event.error, message: event.message }); };
 const rejection = (event: PromiseRejectionEvent) => { if (management()) void captureDiagnostic({ category: 'promise', error: event.reason, message: event.reason instanceof Error ? event.reason.message : 'Operação local rejeitada' }); };
 const original = window.fetch.bind(window); rawFetch = original;
 const wrapped: typeof fetch = async (input, init) => {
  let route = ''; try { route = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.href).pathname; } catch {}
  const watch = management() && route.startsWith('/api/') && route !== '/api/admin/diagnostics';
  try { const response = await original(input, init); if (watch && response.status >= 500) void captureDiagnostic({ category: 'api', route, message: `API respondeu HTTP ${response.status}` }); return response; }
  catch (cause) { if (watch && !(cause instanceof Error && cause.name === 'AbortError')) void captureDiagnostic({ category: 'network', route, message: 'Falha de conexão com a API' }); throw cause; }
 };
 window.fetch = wrapped;
 const retry = () => { if (management()) void flushDiagnostics(); };
 window.addEventListener('error', error); window.addEventListener('unhandledrejection', rejection); window.addEventListener('online', retry); window.addEventListener('focus', retry);
 const timer = setInterval(retry, 60000); retry();
 return () => { window.removeEventListener('error', error); window.removeEventListener('unhandledrejection', rejection); window.removeEventListener('online', retry); window.removeEventListener('focus', retry); clearInterval(timer); if (window.fetch === wrapped) window.fetch = original; };
}
