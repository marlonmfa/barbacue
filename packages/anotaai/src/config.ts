import * as path from 'node:path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.join(__dirname, '../../../.env') });

export type Brand = 'barbacue' | 'barbadog' | 'chelas';
export const BRANDS: Brand[] = ['barbacue', 'barbadog', 'chelas'];
/** Uma loja (página) da Anota AI, identificada pelo idpage (claim do Token da unidade) e ligada a uma marca. */
export interface AnotaPageConfig { pageId: string; brand: Brand; name: string }
export interface AnotaConfig {
  clientId: string; clientSecret: string; pages: AnotaPageConfig[];
  /** Padrão 60 s: o Food COG também consulta as mesmas lojas e o limite da Anota AI é 1 listagem/30 s por loja. */
  pollIntervalMs: number;
  /** on: mudanças de status em /admin/orders viram accept/ready/finalize/cancel na Anota AI. Só um sistema deve ter isto ligado. */
  actions: boolean;
  /** Igual ao monitor iFood: só grava no banco com ANOTAAI_DRY_RUN=false. */
  dryRun: boolean;
  /** Pedidos criados antes disto não entram (evita imprimir pedidos antigos na primeira partida). ms epoch. */
  importSince: number;
}

/** ANOTAAI_PAGES_JSON = [{"pageId":"<24 hex>","brand":"barbacue","name":"Barbacue"}, ...] */
export function parsePages(raw: string | undefined): AnotaPageConfig[] {
  const list = JSON.parse(raw?.trim() || '[]') as Partial<AnotaPageConfig>[];
  if (!Array.isArray(list)) throw new Error('ANOTAAI_PAGES_JSON deve ser uma lista');
  const pages = list.map(p => {
    if (!p.pageId || !/^[0-9a-f]{24}$/i.test(p.pageId)) throw new Error(`pageId inválido em ANOTAAI_PAGES_JSON: ${p.pageId}`);
    if (!p.brand || !BRANDS.includes(p.brand)) throw new Error(`marca inválida em ANOTAAI_PAGES_JSON: ${p.brand}`);
    return { pageId: p.pageId.toLowerCase(), brand: p.brand, name: p.name?.trim() || p.brand };
  });
  if (new Set(pages.map(p => p.pageId)).size !== pages.length) throw new Error('pageId repetido em ANOTAAI_PAGES_JSON');
  return pages;
}

export function loadConfig(env = process.env): AnotaConfig {
  const pollIntervalMs = Number(env.ANOTAAI_POLL_INTERVAL_MS?.trim() || 60_000);
  if (!Number.isFinite(pollIntervalMs) || pollIntervalMs < 30_000 || pollIntervalMs > 300_000) throw new Error('ANOTAAI_POLL_INTERVAL_MS deve estar entre 30000 e 300000');
  const clientId = env.ANOTAAI_CLIENT_ID?.trim(), clientSecret = env.ANOTAAI_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) throw new Error('Configure ANOTAAI_CLIENT_ID e ANOTAAI_CLIENT_SECRET no .env da raiz do monorepo');
  return { clientId, clientSecret, pages: parsePages(env.ANOTAAI_PAGES_JSON), pollIntervalMs,
    actions: (env.ANOTAAI_ACTIONS?.trim() || 'on') !== 'off', dryRun: env.ANOTAAI_DRY_RUN !== 'false',
    importSince: parseSince(env.ANOTAAI_IMPORT_SINCE) };
}

/** ANOTAAI_IMPORT_SINCE (ISO). Sem valor, vale o momento em que o monitor iniciou: nada do passado entra. */
export function parseSince(raw: string | undefined, now = Date.now()) {
  if (!raw?.trim()) return now;
  const t = Date.parse(raw.trim());
  if (!Number.isFinite(t)) throw new Error('ANOTAAI_IMPORT_SINCE deve ser uma data ISO');
  return t;
}
