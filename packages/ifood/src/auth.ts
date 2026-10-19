import { IFOOD_BASE } from "./config";

/**
 * OAuth 2.0 client_credentials.
 * POST /authentication/v1.0/oauth/token  (application/x-www-form-urlencoded)
 * Campos: grantType, clientId, clientSecret.
 * O token expira em ~6 horas — renovamos com folga de 5 min.
 */
export interface TokenResponse {
  accessToken: string;
  expiresIn: number;
  type?: string;
}

export class TokenProvider {
  private token: string | null = null;
  private expiresAt = 0;
  private inflight: Promise<string> | null = null;

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string
  ) {}

  async getToken(): Promise<string> {
    if (this.token && Date.now() < this.expiresAt) return this.token;
    if (this.inflight) return this.inflight;

    this.inflight = this.fetchToken().finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  /** Força a renovação (usar ao receber 401). */
  invalidate(): void {
    this.token = null;
    this.expiresAt = 0;
  }

  private async fetchToken(): Promise<string> {
    const body = new URLSearchParams({
      grantType: "client_credentials",
      clientId: this.clientId,
      clientSecret: this.clientSecret,
    });

    const res = await fetch(`${IFOOD_BASE.auth}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) {
      throw new Error(`Falha ao obter token iFood (${res.status}); verifique credenciais e autorização no portal`);
    }

    const data = (await res.json()) as TokenResponse;
    if (!data.accessToken) {
      throw new Error("Resposta de token sem accessToken");
    }

    this.token = data.accessToken;
    // margem de 5 minutos antes do vencimento real
    this.expiresAt = Date.now() + Math.max(60, data.expiresIn - 300) * 1000;
    return this.token;
  }
}

export interface MerchantAccess { id: string; modules: string[]; authorized: boolean }

/** Diagnóstico das permissões do token obtido via HTTPS; não valida tokens externos. */
export function merchantAccessFromToken(token: string, merchantIds: string[]): MerchantAccess[] {
  let claims: { merchant_scoped?: boolean; merchant_scope?: string[]; scope?: string[] };
  try { claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')); }
  catch { throw new Error('Não foi possível verificar as permissões do token iFood'); }
  if (typeof claims.merchant_scoped !== 'boolean') throw new Error('Token iFood sem informação de escopo por loja');
  return merchantIds.map(id => {
    const modules = claims.merchant_scoped
      ? (claims.merchant_scope ?? []).filter(s => s.startsWith(`${id}:`)).map(s => s.slice(id.length + 1))
      : (claims.scope ?? []);
    return { id, modules, authorized: modules.includes('order') && modules.includes('events') };
  });
}
