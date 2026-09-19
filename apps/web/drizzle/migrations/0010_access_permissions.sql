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
