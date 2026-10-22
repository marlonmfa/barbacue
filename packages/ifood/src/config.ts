import * as path from "path";
import * as dotenv from "dotenv";
import { loadMerchants, MerchantConnection } from "./merchants";

dotenv.config({ path: path.join(__dirname, "../../../.env") });

/**
 * Bases oficiais das APIs iFood (Merchant API).
 * Fonte: https://developer.ifood.com.br/pt-BR/docs/references
 * Sandbox e produção usam as MESMAS URLs — o que muda são as credenciais do app.
 */
export const IFOOD_BASE = {
  auth: "https://merchant-api.ifood.com.br/authentication/v1.0",
  merchant: "https://merchant-api.ifood.com.br/merchant/v1.0",
  events: "https://merchant-api.ifood.com.br/events/v1.0",
  order: "https://merchant-api.ifood.com.br/order/v1.0",
  catalog: "https://merchant-api.ifood.com.br/catalog/v2.0",
  shipping: "https://merchant-api.ifood.com.br/shipping/v1.0",
  logistics: "https://merchant-api.ifood.com.br/logistics/v1.0",
  financial: "https://merchant-api.ifood.com.br/financial/v3.0",
  review: "https://merchant-api.ifood.com.br/review/v2.0",
} as const;

function required(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) {
    throw new Error(
      `Variável de ambiente ausente: ${name}. Preencha no .env da raiz do monorepo.`
    );
  }
  return v.trim();
}

export interface IfoodConfig {
  merchants: MerchantConnection[];
  autoConfirm: boolean;
  clientId: string;
  clientSecret: string;
  /** merchantId (UUID) da loja no iFood. Obtenha via GET /merchants. */
  merchantId: string;
  /** Intervalo do polling em ms. O iFood recomenda ~30s (rate limit: 1 req/30s por merchant). */
  pollIntervalMs: number;
  /** Se true, apenas loga as ações sem chamar endpoints que mudam estado. */
  dryRun: boolean;
}

export function loadConfig(): IfoodConfig {
  const merchants = loadMerchants();
  const pollIntervalMs = Number(process.env.IFOOD_POLL_INTERVAL_MS?.trim() || 30_000);
  if (!Number.isFinite(pollIntervalMs) || pollIntervalMs < 30_000 || pollIntervalMs > 300_000) throw new Error('IFOOD_POLL_INTERVAL_MS deve estar entre 30000 e 300000');
  return {
    merchants,
    autoConfirm: process.env.IFOOD_AUTO_CONFIRM === 'true',
    clientId: required("IFOOD_CLIENT_ID"),
    clientSecret: required("IFOOD_CLIENT_SECRET"),
    merchantId: merchants.find(m => m.brand === "barbacue")?.id ?? merchants[0].id,
    pollIntervalMs,
    dryRun: process.env.IFOOD_DRY_RUN !== "false",
  };
}
