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
  for (;;) {
    const started = Date.now();
    let ok = true;
    if (!cfg.pages.length) await health({ state: 'waiting_pages', lastCheck: started });
    for (const page of cfg.pages) {
      try {
        const r = await syncPage(client, store, page, cfg);
        if (r.created || r.updated || r.pushed) console.log(`[anotaai] ${page.name}: ${r.created} novos, ${r.updated} atualizados, ${r.pushed} ações`);
        for (const e of r.errors) { ok = false; console.error(`[anotaai] ${e}`); }
      } catch (e) {
        ok = false; console.error(`[anotaai] ${page.name}: ${(e as Error).message}`);
      }
    }
    if (cfg.pages.length) await health({ state: ok ? 'ok' : 'error', lastCheck: started, ...(ok ? { lastSuccess: started } : {}) }).catch(() => undefined);
    await delay(Math.max(1000, cfg.pollIntervalMs - (Date.now() - started)));
  }
}

if (require.main === module) main().catch(e => { console.error('[anotaai]', e); process.exit(1); });
