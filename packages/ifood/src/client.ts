import { IFOOD_BASE, IfoodConfig, loadConfig } from "./config";
import { TokenProvider } from "./auth";
import { IfoodHttp } from "./http";
import {
  CancellationReason,
  IfoodEvent,
  IfoodMerchant,
  IfoodOrder,
} from "./types";

/**
 * Cliente único da Merchant API do iFood.
 * Endpoints conferidos em https://developer.ifood.com.br/pt-BR/docs/references
 */
export class IfoodClient {
  readonly config: IfoodConfig;
  private readonly http: IfoodHttp;

  constructor(config: IfoodConfig = loadConfig()) {
    this.config = config;
    this.http = new IfoodHttp(
      new TokenProvider(config.clientId, config.clientSecret)
    );
  }

  // ─────────────── Merchant ───────────────

  /** GET /merchant/v1.0/merchants — lojas que o app tem acesso. */
  listMerchants(): Promise<IfoodMerchant[]> {
    return this.http
      .request<IfoodMerchant[]>(`${IFOOD_BASE.merchant}/merchants`)
      .then((r) => r ?? []);
  }

  /** GET /merchant/v1.0/merchants/{merchantId} */
  getMerchant(merchantId = this.config.merchantId): Promise<IfoodMerchant | null> {
    return this.http.request<IfoodMerchant>(
      `${IFOOD_BASE.merchant}/merchants/${merchantId}`
    );
  }

  /** GET /merchant/v1.0/merchants/{merchantId}/status — aberto/fechado e motivos. */
  getMerchantStatus(merchantId = this.config.merchantId): Promise<unknown> {
    return this.http.request(
      `${IFOOD_BASE.merchant}/merchants/${merchantId}/status`
    );
  }

  // ─────────────── Events ───────────────

  /**
   * GET /events/v1.0/events:polling
   * Retorna até 2000 eventos novos. Rate limit: ~1 chamada a cada 30s por merchant.
   * Header x-polling-merchants restringe o polling a lojas específicas.
   */
  async pollEvents(opts: {
    types?: string[];
    groups?: string[];
    merchantIds?: string[];
  } = {}): Promise<IfoodEvent[]> {
    const merchants = opts.merchantIds ?? [this.config.merchantId];
    const events = await this.http.request<IfoodEvent[]>(
      `${IFOOD_BASE.events}/events:polling`,
      {
        query: {
          types: opts.types?.join(","),
          groups: opts.groups?.join(","),
        },
        headers: { "x-polling-merchants": merchants.join(",") },
      }
    );
    return events ?? [];
  }

  /**
   * POST /events/v1.0/events/acknowledgment
   * Confirma o recebimento. Eventos não confirmados voltam no próximo polling.
   * Envie em lotes de no máximo 2000 ids.
   */
  async acknowledgeEvents(eventIds: string[]): Promise<void> {
    if (eventIds.length === 0) return;
    for (let i = 0; i < eventIds.length; i += 2000) {
      const chunk = eventIds.slice(i, i + 2000).map((id) => ({ id }));
      await this.http.request(`${IFOOD_BASE.events}/events/acknowledgment`, {
        method: "POST",
        body: chunk,
      });
    }
  }

  // ─────────────── Order ───────────────

  /** GET /order/v1.0/orders/{id} */
  getOrder(orderId: string): Promise<IfoodOrder | null> {
    return this.http.request<IfoodOrder>(`${IFOOD_BASE.order}/orders/${orderId}`);
  }

  /** POST /order/v1.0/orders/{id}/confirm — precisa acontecer dentro do SLA de homologação. */
  confirm(orderId: string): Promise<void> {
    return this.orderAction(orderId, "confirm");
  }

  /** POST /order/v1.0/orders/{id}/startPreparation */
  startPreparation(orderId: string): Promise<void> {
    return this.orderAction(orderId, "startPreparation");
  }

  /** POST /order/v1.0/orders/{id}/readyToPickup */
  readyToPickup(orderId: string): Promise<void> {
    return this.orderAction(orderId, "readyToPickup");
  }

  /** POST /order/v1.0/orders/{id}/dispatch — pedido saiu para entrega (entrega própria). */
  dispatch(orderId: string): Promise<void> {
    return this.orderAction(orderId, "dispatch");
  }

  /** GET /order/v1.0/orders/{id}/cancellationReasons */
  getCancellationReasons(orderId: string): Promise<CancellationReason[]> {
    return this.http
      .request<CancellationReason[]>(
        `${IFOOD_BASE.order}/orders/${orderId}/cancellationReasons`
      )
      .then((r) => r ?? []);
  }

  /** POST /order/v1.0/orders/{id}/requestCancellation */
  async requestCancellation(
    orderId: string,
    reason: { cancellationCode: string; reason: string }
  ): Promise<void> {
    if (this.config.dryRun) {
      console.log(`[dry-run] requestCancellation ${orderId}`, reason);
      return;
    }
    await this.http.request(
      `${IFOOD_BASE.order}/orders/${orderId}/requestCancellation`,
      { method: "POST", body: reason }
    );
  }

  private async orderAction(orderId: string, action: string): Promise<void> {
    if (this.config.dryRun) {
      console.log(`[dry-run] POST /orders/${orderId}/${action}`);
      return;
    }
    await this.http.request(`${IFOOD_BASE.order}/orders/${orderId}/${action}`, {
      method: "POST",
    });
  }

  // ─────────────── Catalog ───────────────

  /** GET /catalog/v2.0/merchants/{merchantId}/catalogs */
  listCatalogs(merchantId = this.config.merchantId): Promise<
    Array<{ catalogId: string; context: string[]; status: string }>
  > {
    return this.http
      .request<Array<{ catalogId: string; context: string[]; status: string }>>(
        `${IFOOD_BASE.catalog}/merchants/${merchantId}/catalogs`
      )
      .then((r) => r ?? []);
  }

  /** GET /catalog/v2.0/merchants/{merchantId}/catalogs/{catalogId}/categories */
  listCategories(
    catalogId: string,
    merchantId = this.config.merchantId
  ): Promise<Array<{ id: string; name: string; [k: string]: unknown }>> {
    return this.http
      .request<Array<{ id: string; name: string }>>(
        `${IFOOD_BASE.catalog}/merchants/${merchantId}/catalogs/${catalogId}/categories`,
        { query: { includeItems: true } }
      )
      .then((r) => r ?? []);
  }

  /** POST /catalog/v2.0/merchants/{merchantId}/catalogs/{catalogId}/categories */
  async createCategory(
    catalogId: string,
    payload: { name: string; status?: "AVAILABLE" | "UNAVAILABLE"; index?: number; template?: string },
    merchantId = this.config.merchantId
  ): Promise<{ id: string } | null> {
    if (this.config.dryRun) {
      console.log(`[dry-run] createCategory`, payload);
      return null;
    }
    return this.http.request<{ id: string }>(
      `${IFOOD_BASE.catalog}/merchants/${merchantId}/catalogs/${catalogId}/categories`,
      { method: "POST", body: { status: "AVAILABLE", template: "DEFAULT", ...payload } }
    );
  }

  /**
   * PUT /catalog/v2.0/merchants/{merchantId}/items
   * Cria OU atualiza um item completo (produto + preço + categoria).
   * É o endpoint principal do sync de cardápio.
   */
  async upsertItem(payload: Record<string, unknown>, merchantId = this.config.merchantId) {
    if (this.config.dryRun) {
      console.log(`[dry-run] upsertItem`, payload.item ?? payload);
      return null;
    }
    return this.http.request(`${IFOOD_BASE.catalog}/merchants/${merchantId}/items`, {
      method: "PUT",
      body: payload,
    });
  }

  /** PATCH /catalog/v2.0/merchants/{merchantId}/products/status — disponibilidade em lote. */
  async batchUpdateStatus(
    items: Array<{ itemId?: string; productId?: string; status: "AVAILABLE" | "UNAVAILABLE" }>,
    merchantId = this.config.merchantId
  ) {
    if (this.config.dryRun) {
      console.log(`[dry-run] batchUpdateStatus`, items.length, "itens");
      return null;
    }
    return this.http.request(
      `${IFOOD_BASE.catalog}/merchants/${merchantId}/products/status`,
      { method: "PATCH", body: items }
    );
  }

  /** PATCH /catalog/v2.0/merchants/{merchantId}/products/price — preços em lote. */
  async batchUpdatePrices(
    items: Array<{ itemId?: string; productId?: string; price: { value: number; originalValue?: number } }>,
    merchantId = this.config.merchantId
  ) {
    if (this.config.dryRun) {
      console.log(`[dry-run] batchUpdatePrices`, items.length, "itens");
      return null;
    }
    return this.http.request(
      `${IFOOD_BASE.catalog}/merchants/${merchantId}/products/price`,
      { method: "PATCH", body: items }
    );
  }
}
