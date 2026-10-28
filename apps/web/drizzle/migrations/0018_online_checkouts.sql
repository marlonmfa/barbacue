CREATE TABLE IF NOT EXISTS "online_checkouts" (
  "id" uuid PRIMARY KEY NOT NULL,
  "request_hash" text NOT NULL,
  "access_token_hash" text NOT NULL,
  "order_id" uuid NOT NULL UNIQUE REFERENCES "orders"("id"),
  "environment" text NOT NULL,
  "customer_id" text,
  "payment_id" text UNIQUE,
  "payment_attempted_at" timestamp with time zone,
  "provider_status" text,
  "pix" jsonb,
  "last_checked_at" timestamp with time zone,
  "paid_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- The existing all-channel INSERT trigger must not print an unpaid online order.
-- Payment confirmation writes the ticket atomically with production release.
DROP TRIGGER IF EXISTS orders_print_on_insert ON orders;
--> statement-breakpoint
CREATE TRIGGER orders_print_on_insert AFTER INSERT ON orders
FOR EACH ROW WHEN (NEW.channel IS DISTINCT FROM 'online')
EXECUTE FUNCTION enqueue_integrated_order_print();
