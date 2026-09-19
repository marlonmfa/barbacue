import { readFile } from 'node:fs/promises';
import { readConfig } from './config.mjs';
import { formatTicket } from './ticket.mjs';
import { Journal, acquireSingleton } from './journal.mjs';
import { createTransport } from './transports.mjs';
import { createApi, PrintAgent } from './agent.mjs';

async function main() {
  if (process.argv[2] === 'preview') {
    if (!process.argv[3]) throw new Error('Uso: node src/index.mjs preview caminho/ticket.json');
    const config = readConfig({ ...process.env, PRINT_TRANSPORT: 'dry-run' });
    process.stdout.write(formatTicket(JSON.parse(await readFile(process.argv[3], 'utf8')), config));
    return;
  }
  if (process.argv[2]) throw new Error('Comando desconhecido. Use start via npm ou preview com arquivo local.');
  const config = readConfig();
  if (config.transport === 'dry-run') {
    console.log('DRY-RUN: nenhum pedido foi reservado ou confirmado e nenhum byte foi enviado a impressora.');
    console.log('Para visualizar uma comanda ficticia: npm run preview --workspace=@barbacue/print-agent');
    return;
  }
  const release = await acquireSingleton(config.lockPort);
  let stopping = false;
  let wake;
  const stop = () => {
    stopping = true;
    wake?.();
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
  try {
    const journal = new Journal(config.stateDir);
    await journal.init();
    const agent = new PrintAgent({ ...config, api: createApi(config), journal, print: createTransport(config) });
    console.log(`Print-agent ativo (${config.transport}, ${config.columns} colunas). Diario: ${config.stateDir}`);
    while (!stopping) {
      let hasJob = false;
      try { hasJob = await agent.runOnce(); }
      catch (error) {
        // Sem incluir ticket, token, URL credenciada ou payload nos logs.
        console.error(`Print-agent: ${error.message}. A fila sera consultada novamente apos o intervalo.`);
      }
      if (!hasJob && !stopping) {
        await new Promise(resolve => {
          const timer = setTimeout(resolve, config.pollMs);
          wake = () => { clearTimeout(timer); resolve(); };
        });
        wake = undefined;
      }
    }
  } finally {
    process.off('SIGTERM', stop);
    process.off('SIGINT', stop);
    await release();
  }
}

main().catch(error => { console.error(`Print-agent: ${error.message}`); process.exitCode = 1; });
