ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "source_created_at" timestamptz, ADD COLUMN IF NOT EXISTS "archived_at" timestamptz;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "staff_presence" (
  "user_id" integer PRIMARY KEY REFERENCES "staff_users"("id") ON DELETE CASCADE,
  "available" boolean NOT NULL DEFAULT false,
  "last_seen_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE orders ADD COLUMN delivery_access_token uuid NOT NULL DEFAULT gen_random_uuid();
--> statement-breakpoint
CREATE UNIQUE INDEX orders_delivery_access_token_unique ON orders(delivery_access_token);
--> statement-breakpoint
CREATE TABLE delivery_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id),
  sender text NOT NULL CHECK (sender IN ('store', 'driver')),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX delivery_messages_order_idx ON delivery_messages(order_id, created_at);
--> statement-breakpoint
CREATE TABLE "order_schedules" ("id" uuid PRIMARY KEY,
  "brand" text NOT NULL CHECK ("brand" IN ('barbacue', 'barbadog', 'chelas')),
  "scheduled_at" timestamptz NOT NULL,
  "state" text NOT NULL DEFAULT 'pending' CHECK ("state" IN ('pending', 'accepted', 'cancelled', 'released')),
  "order_id" uuid UNIQUE REFERENCES "orders"("id"),
  "details" jsonb NOT NULL,
  "revision" integer NOT NULL DEFAULT 0,
  "request_hash" text NOT NULL,
  "created_by" integer REFERENCES "staff_users"("id") ON DELETE SET NULL,
  "updated_by" integer REFERENCES "staff_users"("id") ON DELETE SET NULL,
  "cancellation_reason" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CHECK (("state" = 'released') = ("order_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX "order_schedules_brand_slot_idx" ON "order_schedules" ("brand", "scheduled_at");
