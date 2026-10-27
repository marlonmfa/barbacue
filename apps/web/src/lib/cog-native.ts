import { cache } from "react";
/** Opaque native access is resolved server-to-server; never infer roles from it. */
export const NATIVE_COG_HEADER = 'X-Barbacue-Cog';
export function createNativeCogTransport(fetcher: typeof fetch = globalThis.fetch) {
  const valid = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
  async function resolve(token: string | null | undefined): Promise<string | null> {
    if (!valid(token)) return null;
    try {
      const response = await fetcher('https://id.cog.ia.br/userinfo', { headers: { Authorization: `Bearer ${token}` }, redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(5000) });
      if (!response.ok) return null;
      const user = await response.json();
      return user.aud === 'barbacue-native' && user.email_verified === true && typeof user.sub === 'string' && user.sub && typeof user.email === 'string' && /^[^\s@]+@[^\s@]+$/.test(user.email.trim())
        ? user.email.trim().toLowerCase() : null;
    } catch { return null; }
  }
  async function end(token: string | null | undefined): Promise<void> {
    if (!valid(token)) throw new Error('Sessão Cog indisponível. Sua sessão local foi mantida.');
    const response = await fetcher('https://id.cog.ia.br/revoke', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: 'barbacue-native', token }).toString(), redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error('Não foi possível sair da Cog. Sua sessão local foi mantida.');
  }
  return { resolve, end };
}
export const nativeCog = createNativeCogTransport();

export const resolveNativeCogEmail = cache((token: string | null | undefined) => nativeCog.resolve(token));
