import { IfoodClient } from './client';
import { loadConfig } from './config';

async function main() {
  const config = loadConfig();
  const client = new IfoodClient(config);
  let failed = false;
  const access = await client.getMerchantAccess();
  console.log(`Aplicação: ${config.clientId} — autenticação OK`);
  console.log(`iFood Developer — ${config.dryRun ? 'simulação' : 'produção'}; confirmação automática: ${config.autoConfirm}`);
  for (const m of config.merchants) {
    console.log(`\n${m.name} → ${m.brand} — ${m.id}`);
    const permission = access.find(a => a.id === m.id);
    if (!permission?.authorized) {
      failed = true;
      console.error('  PENDENTE: conceda ORDER e EVENTS a esta loja no aplicativo Food COG.');
      console.log(`  Módulos autorizados: ${permission?.modules.join(', ') || 'nenhum'}`);
      continue;
    }
    console.log('  ORDER e EVENTS autorizados.');
    try {
      const merchant = await client.getMerchant(m.id);
      if (!merchant) throw new Error('Loja não retornada pela API');
      console.log(`  Acesso autorizado: ${merchant.name}`);
      console.log(`  Status: ${JSON.stringify(await client.getMerchantStatus(m.id)).slice(0, 500)}`);
    } catch (err) {
      console.warn(`  Módulo Merchant indisponível; monitoramento usa ORDER/EVENTS: ${err instanceof Error ? err.message : 'erro desconhecido'}`);
    }
  }
  // Polling estabelece presença na loja; diagnóstico não deve iniciar operação.
  console.log('\nDiagnóstico sem polling, ACK, confirmação ou alteração de cardápio.');
  if (failed) process.exitCode = 1;
}
main().catch(err => {
  console.error(err instanceof Error ? err.message : 'Falha no diagnóstico');
  process.exitCode = 1;
});
