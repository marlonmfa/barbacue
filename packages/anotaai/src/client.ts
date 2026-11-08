import http from 'node:http';
import https from 'node:https';

// Gateway de parceiros da Anota AI (OAuth client_credentials + x-page-id por loja).
// Portado de food.cog.ia.br src/lib/anotaai/client.ts: Content-Length sempre, User-Agent,
// token de 1 h reaproveitado e success:false tratado como erro.
export const ANOTA_BASE = () => (process.env.ANOTAAI_API_BASE || 'https://gateway-partners.anota.ai').replace(/\/$/, '');
export const ORDERS_PREFIX = '/api-old/partnerauth/v2';
const UA = () => `barbacue-anotaai/1.0 (${process.env.NODE_ENV === 'production' ? 'production' : 'development'}; Node.js/${process.versions.node})`;

export class AnotaError extends Error { constructor(public status: number, msg: string) { super(msg); } }

/** O gateway exige Content-Length em toda requisição (0 sem corpo, inclusive GET); o fetch nativo omite em GET. */
function send(url: string, method: string, headers: Record<string, string>, body: string): Promise<{ status: number; text: string }> {
  const u = new URL(url);
  const lib = u.protocol === 'http:' ? http : https;
  return new Promise((resolve, reject) => {
    const req = lib.request(u, { method, headers: { ...headers, 'content-length': String(Buffer.byteLength(body)) }, timeout: 20000 }, res => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode || 0, text: Buffer.concat(chunks).toString('utf8') }));
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error(`Anota AI ${method} ${u.pathname}: tempo esgotado`)));
    req.on('error', reject);
    req.end(body);
  });
}

export class AnotaClient {
  private cached: { token: string; exp: number } | null = null;
  constructor(private creds: { clientId: string; clientSecret: string }) {}

  /** Um access token para o parceiro (vale 1 h; rota de token limitada a 15 req/min). */
  async token(): Promise<string> {
    if (this.cached && this.cached.exp > Date.now()) return this.cached.token;
    const body = new URLSearchParams({ grant_type: 'client_credentials', client_id: this.creds.clientId, client_secret: this.creds.clientSecret }).toString();
    const r = await send(`${ANOTA_BASE()}/integ/integ-oauth-api/oauth-client/token`, 'POST', { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json', 'user-agent': UA() }, body);
    if (r.status < 200 || r.status >= 300) throw new AnotaError(r.status, `Anota AI token ${r.status}: ${r.text.slice(0, 300)}`);
    const j = JSON.parse(r.text || '{}') as { accessToken?: string; access_token?: string; expiresIn?: number; expires_in?: number };
    const token = j.accessToken || j.access_token || '';
    if (!token) throw new AnotaError(500, 'Anota AI não devolveu accessToken');
    this.cached = { token, exp: Date.now() + Math.max(60, (j.expiresIn || j.expires_in || 3600) - 120) * 1000 };
    return token;
  }

  /** Chamada autenticada; renova o token uma vez em 401. Erros de negócio vêm como 200 + success:false. */
  async fetch<T = unknown>(path: string, init: { method?: string; body?: unknown; pageId?: string } = {}): Promise<T> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const token = await this.token();
      const body = init.body !== undefined ? JSON.stringify(init.body) : '';
      const r = await send(`${ANOTA_BASE()}${path}`, init.method || 'GET', {
        accept: 'application/json', 'content-type': 'application/json', 'user-agent': UA(),
        authorization: `Bearer ${token}`, ...(init.pageId ? { 'x-page-id': init.pageId } : {}),
      }, body);
      if (r.status === 401 && attempt === 0) { this.cached = null; continue; }
      let j: unknown = null; try { j = r.text ? JSON.parse(r.text) : null; } catch { /* corpo não-JSON */ }
      const fail = j as { success?: boolean; message?: string; err?: string } | null;
      if (r.status < 200 || r.status >= 300 || fail?.success === false) throw new AnotaError(r.status, `Anota AI ${init.method || 'GET'} ${path} ${r.status}: ${(fail?.message || fail?.err || r.text).slice(0, 300)}`);
      return j as T;
    }
    throw new AnotaError(401, 'Anota AI recusou o token do parceiro');
  }
}
