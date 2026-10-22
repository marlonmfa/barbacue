export { IfoodClient } from "./client";
export { TokenProvider } from "./auth";
export { IfoodHttp, IfoodHttpError } from "./http";
export { IFOOD_BASE, loadConfig } from "./config";
export type { IfoodConfig } from "./config";
export { runPoller, defaultHandler, pollCycle } from "./poller";
export type { OrderHandler } from "./poller";
export type {
  IfoodEvent,
  IfoodOrder,
  IfoodOrderItem,
  IfoodMerchant,
  CancellationReason,
} from "./types";

export { DEFAULT_MERCHANTS, loadMerchants, resolveMerchant } from "./merchants";
export type { MerchantConnection, IfoodBrand } from "./merchants";
