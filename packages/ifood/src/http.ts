import { TokenProvider } from "./auth";

export class IfoodHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly url: string,
    public readonly body: string
  ) {
    super(`iFood ${status} em ${url}: ${body.slice(0, 500)}`);
    this.name = "IfoodHttpError";
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface RequestOptions {
  method?: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  /** Content-Type do body. Default: application/json */
  contentType?: string;
  /** Tentativas totais em erros transitórios (429/5xx/rede). */
  retries?: number;
  headers?: Record<string, string>;
}

/**
 * Cliente HTTP com:
 *  - injeção do Bearer token (renovação automática em 401)
 *  - retry exponencial em 429 / 5xx / erro de rede, respeitando Retry-After
 *  - 204/empty -> null
 */
export class IfoodHttp {
  constructor(private readonly tokens: TokenProvider) {}

  async request<T = unknown>(url: string, opts: RequestOptions = {}): Promise<T | null> {
    const {
      method = "GET",
      query,
      body,
      contentType = "application/json",
      retries = 4,
      headers = {},
    } = opts;

    const target = new URL(url);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined) target.searchParams.set(k, String(v));
      }
    }

    let attempt = 0;
    let lastErr: unknown;

    while (attempt < retries) {
      attempt++;
      try {
        const token = await this.tokens.getToken();
        const res = await fetch(target.toString(), {
          method,
          headers: {
            Authorization: `Bearer ${token}`,
            ...(body !== undefined ? { "Content-Type": contentType } : {}),
            ...headers,
          },
          body:
            body === undefined
              ? undefined
              : contentType === "application/json"
                ? JSON.stringify(body)
                : (body as any),
        });

        if (res.status === 401 && attempt < retries) {
          this.tokens.invalidate();
          continue;
        }

        if (res.status === 429 || res.status >= 500) {
          const retryAfter = Number(res.headers.get("retry-after"));
          const waitMs = Number.isFinite(retryAfter) && retryAfter > 0
            ? retryAfter * 1000
            : Math.min(30_000, 2 ** attempt * 500);
          if (attempt < retries) {
            await sleep(waitMs);
            continue;
          }
        }

        if (!res.ok) {
          throw new IfoodHttpError(
            res.status,
            target.pathname,
            await res.text().catch(() => "")
          );
        }

        if (res.status === 204) return null;
        const text = await res.text();
        if (!text) return null;
        return JSON.parse(text) as T;
      } catch (err) {
        lastErr = err;
        // Erros HTTP definitivos (4xx que não 401/429) não devem repetir
        if (err instanceof IfoodHttpError) throw err;
        if (attempt >= retries) break;
        await sleep(Math.min(30_000, 2 ** attempt * 500));
      }
    }

    throw lastErr instanceof Error
      ? lastErr
      : new Error(`Falha na requisição ${method} ${target.pathname}`);
  }
}
