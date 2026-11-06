// Shared by browser, Electron and server. Never collect request bodies or cookies.
export function redact(value, limit = 4000) {
 return String(value ?? '').slice(0, limit * 2)
  .replace(/(?:Bearer\s+|\b(?:sk-|sk_proj_|sk-proj-))[A-Za-z0-9._-]+/gi, '[segredo]')
  .replace(/\b(password|senha|token|secret|cookie|authorization|api[_-]?key|encryptedToken)\b["']?\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;}]+)/gi, '$1=[segredo]')
  .replace(/https?:\/\/[^\s)"']+/gi, text => { try { const u = new URL(text); return `${u.origin}${u.pathname}`; } catch { return '[URL]'; } })
  .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email]')
  .replace(/(?:[A-Z]:\\Users\\|\/Users\/|\/home\/)[^\\/\s]+/gi, '[perfil]')
  .replace(/\b\d[\d .()+-]{9,}\d\b/g, '[numero]')
  .slice(0, limit);
}
export function sanitizeDiagnostic(input = {}) {
 const error = input.error;
 let route = String(input.route || '/');
 try { route = new URL(route, 'https://local.invalid').pathname; } catch { route = '/'; }
 return {
  id: /^[a-f0-9-]{36}$/i.test(input.id || '') ? input.id : '',
  time: Number.isFinite(Date.parse(input.time)) ? new Date(input.time).toISOString() : new Date().toISOString(),
  platform: input.platform === 'desktop' ? 'desktop' : 'browser',
  version: redact(input.version || 'web', 80),
  category: ['runtime','promise','render','network','api','printing','startup','process'].includes(input.category) ? input.category : 'runtime',
  route: redact(route, 200),
  message: redact(error?.message || input.message || 'Falha local sem mensagem', 1600),
  stack: redact(error?.stack || input.stack || '', 5000),
 };
}
export function diagnosticFingerprint(report) {
 return JSON.stringify([report.platform, report.version, report.category, report.route, report.message]);
}
