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
