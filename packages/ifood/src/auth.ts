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
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Falha ao obter token iFood (${res.status}): ${text}`);
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
