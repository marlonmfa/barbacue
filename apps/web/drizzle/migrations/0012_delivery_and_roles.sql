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
