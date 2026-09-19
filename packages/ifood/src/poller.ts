import { IfoodClient } from "./client";
import { IfoodEvent, IfoodOrder } from "./types";
import { loadConfig } from "./config";
import { storeIfoodEvent } from "./order-store";

/**
 * Loop de polling de eventos do iFood.
 *
 *   npm run poll --workspace=packages/ifood
 *
 * Regras que a homologação cobra:
 *  - Chamar GET /events:polling a cada ~30s (não mais rápido: rate limit).
 *  - Fazer ACK de TODO evento processado, senão ele volta indefinidamente.
 *  - Confirmar (POST /confirm) pedidos PLC dentro do SLA.
 *  - Nunca derrubar o loop por causa de um evento com erro.
 */

const CODES: Record<string, string> = {
  PLC: "Pedido feito (placed)",
  CFM: "Confirmado",
  RTP: "Pronto para retirada",
  DSP: "Despachado",
  CON: "Concluído",
  CAN: "Cancelado",
  SPE: "Cancelamento solicitado pelo cliente",
  SPS: "Cancelamento solicitado — aguardando",
};

export type OrderHandler = (
  event: IfoodEvent,
  order: IfoodOrder | null,
  client: IfoodClient
) => Promise<void>;

/** Handler padrão: confirma pedidos novos e loga as transições. */
export const defaultHandler: OrderHandler = async (event, order, client) => {
  const label = CODES[event.code] ?? event.code;
  const display = order?.displayId ?? event.orderId.slice(0, 8);

  await storeIfoodEvent(event, order);

  switch (event.code) {
    case "PLC": {
      console.log(`[${display}] ${label} — confirmando…`);
      await client.confirm(event.orderId);
      await storeIfoodEvent({ ...event, code: "CFM" }, null);
      console.log(`[${display}] confirmado`);
      break;
    }
    case "CAN":
      console.warn(`[${display}] CANCELADO pelo iFood/cliente`);
      break;
    default:
      console.log(`[${display}] ${label}`);
  }
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runPoller(handler: OrderHandler = defaultHandler) {
  const config = loadConfig();
  const client = new IfoodClient(config);

  const merchant = await client.getMerchant();
  console.log(
    `iFood poller iniciado — loja: ${merchant?.name ?? config.merchantId}` +
      (config.dryRun ? " [DRY RUN]" : "")
  );

  let stopping = false;
  const stop = () => {
    if (stopping) process.exit(1);
    stopping = true;
    console.log("\nEncerrando após o ciclo atual…");
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  while (!stopping) {
    const startedAt = Date.now();
    try {
      const events = await client.pollEvents();
      if (events.length) console.log(`→ ${events.length} evento(s)`);

      const processed: string[] = [];
      for (const event of events) {
        try {
          const needsOrder = ["PLC", "CFM", "PRS", "RTP", "DSP", "CON", "CAN"].includes(event.code);
          const order = needsOrder ? await client.getOrder(event.orderId) : null;
          await handler(event, order, client);
          processed.push(event.id);
        } catch (err) {
          // Não damos ACK: o evento volta no próximo ciclo para nova tentativa.
          console.error(`Erro no evento ${event.id} (${event.code}):`, err);
        }
      }

      await client.acknowledgeEvents(processed);
    } catch (err) {
      console.error("Erro no ciclo de polling:", err);
    }

    const elapsed = Date.now() - startedAt;
    await sleep(Math.max(1000, config.pollIntervalMs - elapsed));
  }

  console.log("Poller encerrado.");
}

if (require.main === module) {
  runPoller().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
