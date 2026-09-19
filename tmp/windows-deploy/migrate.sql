BEGIN;
SET LOCAL ROLE barbacue;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- 0006_fancy_wallop.sql
CREATE TABLE "media_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mime" text NOT NULL,
	"data" "bytea" NOT NULL,
	"byte_size" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);


-- 0010_access_permissions.sql
ALTER TYPE "staff_role" ADD VALUE IF NOT EXISTS 'cashier';
--> statement-breakpoint
ALTER TYPE "staff_role" ADD VALUE IF NOT EXISTS 'kitchen';
--> statement-breakpoint
ALTER TYPE "staff_role" ADD VALUE IF NOT EXISTS 'employee';
--> statement-breakpoint
ALTER TABLE "staff_users" ADD COLUMN IF NOT EXISTS "job_title" text;
--> statement-breakpoint
ALTER TABLE "staff_users" ADD COLUMN IF NOT EXISTS "permissions" jsonb;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "customer_accounts" (
 "id" serial PRIMARY KEY, "name" text NOT NULL, "email" text NOT NULL UNIQUE,
 "password_hash" text NOT NULL, "created_at" timestamptz DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "coupons" ADD COLUMN IF NOT EXISTS "audience" text NOT NULL DEFAULT 'all' CHECK (audience IN ('all', 'visitor', 'member'));


-- 0011_self_service_printing.sql
ALTER TYPE "public"."order_type" ADD VALUE IF NOT EXISTS 'pickup';--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "self_service_request_id" uuid;
ALTER TABLE "orders" ADD COLUMN "self_service_request_hash" text;
ALTER TABLE "orders" ADD COLUMN "self_service_response" jsonb;
ALTER TABLE "orders" ADD CONSTRAINT "orders_self_service_request_id_unique" UNIQUE ("self_service_request_id");--> statement-breakpoint
CREATE TABLE "kitchen_print_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "order_id" uuid NOT NULL REFERENCES "orders"("id"),
  "ticket" jsonb NOT NULL,
  "status" text DEFAULT 'queued' NOT NULL CHECK ("status" IN ('queued', 'printing', 'printed', 'failed', 'uncertain')),
  "attempts" integer DEFAULT 0 NOT NULL CHECK ("attempts" >= 0),
  "lease_token" uuid,
  "lease_expires_at" timestamptz,
  "next_attempt_at" timestamptz DEFAULT now() NOT NULL,
  "last_error" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  "printed_at" timestamptz,
  CONSTRAINT "kitchen_print_jobs_order_id_unique" UNIQUE("order_id")
);--> statement-breakpoint
CREATE INDEX "kitchen_print_jobs_ready_idx" ON "kitchen_print_jobs" ("status", "next_attempt_at");--> statement-breakpoint
CREATE TABLE "kitchen_print_agent_state" (
  "id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
  "last_seen_at" timestamptz DEFAULT now() NOT NULL
);


-- 0012_delivery_and_roles.sql
ALTER TYPE "public"."staff_role" ADD VALUE IF NOT EXISTS 'waiter';--> statement-breakpoint
ALTER TYPE "public"."staff_role" ADD VALUE IF NOT EXISTS 'driver';--> statement-breakpoint
CREATE TABLE "delivery_settings" (
  "id" integer PRIMARY KEY DEFAULT 1 NOT NULL CHECK ("id" = 1),
  "enabled" boolean DEFAULT false NOT NULL,
  "provider" text DEFAULT 'osm' NOT NULL CHECK ("provider" = 'osm'),
  "origin_address" text,
  "origin_latitude" double precision CHECK ("origin_latitude" BETWEEN -90 AND 90),
  "origin_longitude" double precision CHECK ("origin_longitude" BETWEEN -180 AND 180),
  "base_fee_cents" integer DEFAULT 0 NOT NULL CHECK ("base_fee_cents" >= 0),
  "fee_per_km_cents" integer DEFAULT 0 NOT NULL CHECK ("fee_per_km_cents" >= 0),
  "min_fee_cents" integer DEFAULT 0 NOT NULL CHECK ("min_fee_cents" >= 0),
  "max_distance_meters" integer DEFAULT 10000 NOT NULL CHECK ("max_distance_meters" > 0),
  "updated_at" timestamptz DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "delivery_quotes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "brand" text NOT NULL,
  "address" text NOT NULL,
  "address_key" text NOT NULL,
  "provider" text NOT NULL CHECK ("provider" = 'osm'),
  "distance_meters" integer NOT NULL CHECK ("distance_meters" >= 0),
  "duration_seconds" integer NOT NULL CHECK ("duration_seconds" >= 0),
  "fee_cents" integer NOT NULL CHECK ("fee_cents" >= 0),
  "origin_latitude" double precision NOT NULL CHECK ("origin_latitude" BETWEEN -90 AND 90),
  "origin_longitude" double precision NOT NULL CHECK ("origin_longitude" BETWEEN -180 AND 180),
  "destination_latitude" double precision NOT NULL CHECK ("destination_latitude" BETWEEN -90 AND 90),
  "destination_longitude" double precision NOT NULL CHECK ("destination_longitude" BETWEEN -180 AND 180),
  "route_links" jsonb NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "expires_at" timestamptz NOT NULL
);--> statement-breakpoint
CREATE INDEX "delivery_quotes_expiry_idx" ON "delivery_quotes" ("expires_at");--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "delivery_quote_id" uuid REFERENCES "delivery_quotes"("id");
ALTER TABLE "orders" ADD COLUMN "delivery_fee_cents" integer DEFAULT 0 NOT NULL CHECK ("delivery_fee_cents" >= 0);
ALTER TABLE "orders" ADD COLUMN "delivery_distance_meters" integer;
ALTER TABLE "orders" ADD COLUMN "delivery_duration_seconds" integer;
ALTER TABLE "orders" ADD COLUMN "delivery_route" jsonb;
ALTER TABLE "orders" ADD COLUMN "delivery_driver_id" integer REFERENCES "staff_users"("id");
ALTER TABLE "orders" ADD COLUMN "delivery_status" text CHECK ("delivery_status" IN ('assigned','out_for_delivery','delivered'));
ALTER TABLE "orders" ADD COLUMN "dispatched_at" timestamptz;
ALTER TABLE "orders" ADD COLUMN "delivered_at" timestamptz;--> statement-breakpoint
CREATE INDEX "orders_driver_delivery_idx" ON "orders" ("delivery_driver_id", "delivery_status");


-- 0013_all_channel_printing.sql
-- Capture new orders from every integration at the database boundary.
-- Totem and QR retain their existing transactional version-1 ticket writer.
-- No historical order is backfilled or printed by applying this migration.
CREATE OR REPLACE FUNCTION enqueue_integrated_order_print() RETURNS trigger AS $$
DECLARE
  table_number integer;
  table_label text;
BEGIN
  IF NEW.channel IN ('kiosk', 'table_qr') OR NEW.status IN ('cancelled', 'delivered') THEN
    RETURN NEW;
  END IF;
  SELECT number, label INTO table_number, table_label FROM restaurant_tables WHERE id = NEW.table_id;
  INSERT INTO kitchen_print_jobs (order_id, ticket)
  VALUES (NEW.id, jsonb_build_object(
    'version', 2,
    'orderId', NEW.id,
    'orderNumber', upper(left(NEW.id::text, 8)),
    'brand', NEW.brand,
    'channel', coalesce(nullif(NEW.channel, ''), 'other'),
    'orderType', NEW.order_type,
    'tableNumber', table_number,
    'tableLabel', table_label,
    'customerName', NEW.customer_name,
    'customerPhone', NEW.customer_phone,
    'deliveryAddress', NEW.delivery_address,
    'items', NEW.items,
    'notes', NEW.notes,
    'createdAt', coalesce(NEW.created_at, now()),
    'status', coalesce(NEW.status::text, 'pending'),
    'subtotalCents', NEW.subtotal_cents,
    'discountCents', coalesce(NEW.discount_cents, 0),
    'deliveryFeeCents', NEW.delivery_fee_cents,
    'totalCents', NEW.total_cents,
    'changeForCents', NEW.change_for_cents,
    'payment', jsonb_build_object('method', NEW.payment_method, 'status', coalesce(NEW.payment_status::text, 'pending'), 'label', 'Situacao no recebimento'),
    'reprint', false
  )) ON CONFLICT (order_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER orders_print_on_insert AFTER INSERT ON orders
FOR EACH ROW EXECUTE FUNCTION enqueue_integrated_order_print();

COMMIT;
