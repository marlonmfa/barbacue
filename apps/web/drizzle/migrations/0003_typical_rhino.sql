CREATE TYPE "public"."staff_role" AS ENUM('admin', 'manager');--> statement-breakpoint
CREATE TABLE "closed_days" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "closed_days_date_unique" UNIQUE("date")
);
--> statement-breakpoint
CREATE TABLE "staff_users" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "staff_role" DEFAULT 'manager' NOT NULL,
	"active" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "staff_users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "store_settings" ALTER COLUMN "store_name" SET DEFAULT 'Barbacue';--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "promo_price_cents" integer;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "promo_starts_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "promo_ends_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "store_settings" ADD COLUMN "weekly_hours" jsonb;--> statement-breakpoint
ALTER TABLE "store_settings" ADD COLUMN "timezone" text DEFAULT 'America/Sao_Paulo';