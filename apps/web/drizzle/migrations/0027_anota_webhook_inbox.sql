CREATE TABLE IF NOT EXISTS "anota_webhook_inbox" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "brand" text NOT NULL,
  "event" text NOT NULL,
  "provider_order_id" text NOT NULL,
  "payload" jsonb NOT NULL,
  "received_at" timestamp with time zone DEFAULT now() NOT NULL,
  "processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "anota_webhook_inbox_brand_event_order_unique"
  ON "anota_webhook_inbox" USING btree ("brand", "event", "provider_order_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "anota_webhook_inbox_pending_idx"
  ON "anota_webhook_inbox" USING btree ("processed_at", "received_at");
