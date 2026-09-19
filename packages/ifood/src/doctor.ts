import { IfoodClient } from "./client";
import { loadConfig } from "./config";

/**
 * Diagnóstico da integração:
 *   npm run doctor --workspace=packages/ifood
 *
 * Valida credenciais, lista as lojas visíveis pelo app e mostra o catálogo.
 * Use antes de rodar o poller ou o sync de cardápio.
 */
async function main() {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    console.error("✗", (err as Error).message);
    process.exit(1);
  }

  const client = new IfoodClient(config);

  console.log("1) Autenticando…");
  const merchants = await client.listMerchants();
  console.log(`   ✓ token OK — ${merchants.length} loja(s) autorizada(s):`);
  for (const m of merchants) console.log(`     • ${m.name ?? "(sem nome)"} — ${m.id}`);

  const configured = merchants.find((m) => m.id === config.merchantId);
  if (!configured) {
    console.warn(
      `   ⚠ IFOOD_MERCHANT_ID (${config.merchantId}) não está na lista acima.` +
        " Copie um dos ids mostrados para o .env."
    );
  }

  console.log("\n2) Status da loja…");
  try {
    console.log("   ", JSON.stringify(await client.getMerchantStatus()).slice(0, 400));
  } catch (err) {
    console.warn("   ⚠ não foi possível ler o status:", (err as Error).message);
  }

  console.log("\n3) Catálogos…");
  try {
    const catalogs = await client.listCatalogs();
    for (const c of catalogs) {
      console.log(`   • ${c.catalogId} — contexto: ${(c.context ?? []).join(", ")} — ${c.status}`);
      const cats = await client.listCategories(c.catalogId);
      console.log(`     ${cats.length} categoria(s): ${cats.map((x) => x.name).slice(0, 10).join(", ")}`);
    }
  } catch (err) {
    console.warn("   ⚠ módulo Catalog indisponível para este app:", (err as Error).message);
  }

  console.log("\n4) Polling de eventos (1 ciclo)…");
  const events = await client.pollEvents();
  console.log(`   ✓ ${events.length} evento(s) pendente(s) — nenhum ACK foi enviado.`);

  console.log("\nTudo pronto.");
}

main().catch((err) => {
  console.error("\n✗ Falhou:", err);
  process.exit(1);
});
