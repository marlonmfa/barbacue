import { AnotaClient, ORDERS_PREFIX } from './client';
import type { AnotaConfig, AnotaPageConfig } from './config';
import { actionsFor, type AnotaListDoc, type AnotaOrder } from './map';
import { RANK, anotaLocalId, localOfCheck, toBarbacueOrder, type LocalStatus, type OrderStore } from './order-store';

export const CANCEL_REQUESTED = 'Anota AI: o cliente pediu o cancelamento deste pedido';
const ACTION_LABEL = { accept: 'aceitar', ready: 'pronto/despachado', finalize: 'concluir', cancel: 'cancelar' } as const;
/** Nota visível no painel quando a Anota AI recusa uma ação (texto estável: appendNote não repete). */
export function actionFailedNote(action: keyof typeof ACTION_LABEL, message: string) {
  const why = message.replace(/^Anota AI \S+ \S+ \d+: /, '').replace(/\s+/g, ' ').slice(0, 160);
  return `Anota AI não registrou "${ACTION_LABEL[action]}": ${why}. A loja tenta de novo a cada ciclo; se persistir, atualizar no painel da Anota AI.`;
}
const UPPER: Record<LocalStatus, string> = { pending: 'PENDING', confirmed: 'CONFIRMED', preparing: 'PREPARING', ready: 'READY', delivered: 'DELIVERED', cancelled: 'CANCELED' };

/** Pedidos do dia da loja (todas as páginas). excludeIfood=1: o Barbacue já recebe o iFood pela Merchant API. */
async function listToday(client: AnotaClient, pageId: string) {
  const out: AnotaListDoc[] = [];
  for (let p = 1; p <= 10; p++) {
    const r = await client.fetch<{ info?: { docs?: AnotaListDoc[]; limit?: number } }>(`${ORDERS_PREFIX}/ping/list?${new URLSearchParams({ currentpage: String(p), excludeIfood: '1' })}`, { pageId });
    const docs = r?.info?.docs || [];
    out.push(...docs);
    if (docs.length < (r?.info?.limit || 100)) break;
  }
  return out;
}

/** Pedidos de dias anteriores que ficaram abertos no painel saem da listagem do dia; conferimos um a um. */
export const STALE_WINDOW_MS = 3 * 86_400_000;
export const STALE_PER_CYCLE = 10;

export type PageResult = { created: number; updated: number; pushed: number; errors: string[] };

/**
 * Concilia uma loja: importa pedidos novos, aplica no painel o que avançou na Anota AI e, com
 * ANOTAAI_ACTIONS=on, leva para a Anota AI o que avançou no painel (aceitar → pronto → finalizar, cancelar).
 * Sem estado próprio: a comparação é entre o check da listagem e o status da linha em `orders`.
 */
export async function syncPage(client: AnotaClient, store: OrderStore, page: AnotaPageConfig, cfg: Pick<AnotaConfig, 'actions' | 'dryRun'> & { importSince?: number }): Promise<PageResult> {
  const res: PageResult = { created: 0, updated: 0, pushed: 0, errors: [] };
  const docs = (await listToday(client, page.pageId)).filter(d => d?._id && /^[0-9a-f]{24}$/i.test(d._id));
  // Abertos no painel que não vieram na listagem do dia (ex.: viraram o dia em "pronto"): status atual via /ping/get.
  for (const ext of await store.openOutside(page.brand, docs.map(d => anotaLocalId(d._id)), Date.now() - STALE_WINDOW_MS, STALE_PER_CYCLE)) {
    try {
      const det = await client.fetch<{ info?: AnotaOrder }>(`${ORDERS_PREFIX}/ping/get/${ext}`, { pageId: page.pageId });
      if (det?.info && typeof det.info.check === 'number') docs.push({ _id: ext, check: det.info.check } as AnotaListDoc);
    } catch (e) {
      res.errors.push(`${page.name} ${ext} (pedido de dia anterior): ${(e as Error).message}`);
    }
  }
  const local = await store.statuses(docs.map(d => anotaLocalId(d._id)));
  for (const d of docs) {
    const id = anotaLocalId(d._id);
    try {
      const cur = local.get(id);
      const remote = localOfCheck(d.check);
      if (!cur) {
        if (d.check === 3 || d.check === 4 || d.check === 5) continue; // encerrados antes de o Barbacue acompanhar a loja
        const det = await client.fetch<{ info?: AnotaOrder }>(`${ORDERS_PREFIX}/ping/get/${d._id}`, { pageId: page.pageId });
        if (!det?.info) continue;
        // Primeira partida e reinícios: pedidos anteriores ao corte não entram (não imprimem na cozinha).
        const created = Date.parse(String(det.info.createdAt ?? ""));
        if (cfg.importSince && (!Number.isFinite(created) || created < cfg.importSince)) continue;
        const order = toBarbacueOrder({ ...det.info, _id: d._id }, page);
        if (!cfg.dryRun && await store.insert(order, localOfCheck(det.info.check ?? d.check) || 'pending')) res.created++;
        continue;
      }
      if (d.check === 6) { if (!cfg.dryRun) await store.appendNote(id, CANCEL_REQUESTED); continue; }
      if (remote && remote !== cur && (remote === 'cancelled' || RANK[remote] > RANK[cur]) && cur !== 'cancelled' && cur !== 'delivered') {
        // Mudou fora do Barbacue (painel/robô da Anota AI, cliente, negado em 15 min).
        if (!cfg.dryRun && await store.advance(id, remote)) res.updated++;
        continue;
      }
      if (!cfg.actions || cfg.dryRun) continue;
      const push = async (a: keyof typeof ACTION_LABEL) => {
        try {
          await client.fetch(`${ORDERS_PREFIX}/order/${a}/${d._id}`, { method: 'POST', pageId: page.pageId, ...(a === 'cancel' ? { body: { justification: 'Cancelado pela loja' } } : {}) });
          res.pushed++;
          return true;
        } catch (e) {
          const msg = (e as Error).message;
          res.errors.push(`${page.name} ${d._id} ação ${a} recusada: ${msg}`);
          await store.appendNote(id, actionFailedNote(a, msg)).catch(() => undefined);
          return false;
        }
      };
      if (cur === 'cancelled') {
        if (d.check !== 4 && d.check !== 5) await push('cancel');
        continue;
      }
      for (const a of actionsFor(UPPER[cur], d.check)) if (!await push(a)) break;
    } catch (e) {
      res.errors.push(`${page.name} ${d._id}: ${(e as Error).message}`);
    }
  }
  return res;
}
