import { index, jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

export const anotaWebhookInbox = pgTable("anota_webhook_inbox", {
  id: uuid("id").defaultRandom().primaryKey(),
  brand: text("brand").notNull(),
  event: text("event").notNull(),
  providerOrderId: text("provider_order_id").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
}, table => [
  unique("anota_webhook_inbox_brand_event_order_unique").on(table.brand, table.event, table.providerOrderId),
  index("anota_webhook_inbox_pending_idx").on(table.processedAt, table.receivedAt),
]);
