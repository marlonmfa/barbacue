CREATE TABLE "dispatch_settings" (
  "id" integer PRIMARY KEY,
  "config" jsonb NOT NULL,
  "revision" integer DEFAULT 0 NOT NULL,
  "report" jsonb
);
--> statement-breakpoint
CREATE TABLE "dispatch_routes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "plan" jsonb NOT NULL,
  "origin_key" text NOT NULL,
  "departure_config" jsonb,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "started_at" timestamptz,
  "released_at" timestamptz,
  "driver_id" integer REFERENCES "staff_users"("id") ON DELETE SET NULL
);
--> statement-breakpoint
CREATE INDEX "dispatch_routes_queue_idx" ON "dispatch_routes" ("created_at")
  WHERE "started_at" IS NULL AND "released_at" IS NULL;
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "dispatch_route_id" uuid REFERENCES "dispatch_routes"("id"),
  ADD COLUMN "dispatch_position" integer;
--> statement-breakpoint
CREATE UNIQUE INDEX "orders_dispatch_position_idx" ON "orders" ("dispatch_route_id", "dispatch_position");
