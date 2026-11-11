import { rename, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { AnotaClient } from './client';
import { loadConfig } from './config';
import { pgStore } from './order-store';
import { syncPage } from './sync';

const HEALTH = process.env.ANOTAAI_HEALTH_FILE || '/tmp/anotaai-health.json';
async function health(h: object) {
  await writeFile(`${HEALTH}.tmp`, JSON.stringify(h)); await rename(`${HEALTH}.tmp`, HEALTH);
}

async function main() {
  const cfg = loadConfig();
  const client = new AnotaClient(cfg);
  const store = pgStore();
  await store.check();
  console.log(`[anotaai] monitor: ${cfg.pages.length} loja(s), a cada ${cfg.pollIntervalMs / 1000}s, ações ${cfg.actions ? 'ligadas' : 'desligadas'}${cfg.dryRun ? ', DRY RUN' : ''}`);
  let lastSuccess: number | undefined;
  for (;;) {
    const started = Date.now();
    let ok = true, lastError: string | undefined;
    if (!cfg.pages.length) await health({ state: 'waiting_pages', lastCheck: started });
    for (const page of cfg.pages) {
      try {
        const r = await syncPage(client, store, page, cfg);
        if (r.created || r.updated || r.pushed) console.log(`[anotaai] ${page.name}: ${r.created} novos, ${r.updated} atualizados, ${r.pushed} ações`);
        for (const e of r.errors) { ok = false; lastError = e; console.error(`[anotaai] ${e}`); }
      } catch (e) {
        ok = false; lastError = `${page.name}: ${(e as Error).message}`; console.error(`[anotaai] ${lastError}`);
        if (/\b401\b/.test(lastError)) console.error('[anotaai] 401 na Anota AI: conferir CLIENT_ID/SECRET do parceiro Food COG e o vínculo da loja no Portal de Integração');
      }
    }
    if (ok) lastSuccess = started;
    // O healthcheck do compose usa lastSuccess: 10 min sem ciclo limpo deixa o contêiner unhealthy.
    if (cfg.pages.length) await health({ state: ok ? 'ok' : 'error', lastCheck: started, lastSuccess, ...(lastError ? { lastError: lastError.slice(0, 300) } : {}) }).catch(() => undefined);
    await delay(Math.max(1000, cfg.pollIntervalMs - (Date.now() - started)));
  }
}

if (require.main === module) main().catch(e => { console.error('[anotaai]', e); process.exit(1); });
