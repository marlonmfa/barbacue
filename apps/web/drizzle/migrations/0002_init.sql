CREATE TYPE "public"."payment_method" AS ENUM('pix', 'cash', 'card_on_delivery');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('pending', 'paid', 'failed');--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "payment_method" "payment_method" DEFAULT 'pix';--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "payment_status" "payment_status" DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "change_for_cents" integer;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "channel" text DEFAULT 'click';--> statement-breakpoint
ALTER TABLE "store_settings" ADD COLUMN "pix_key" text;--> statement-breakpoint
ALTER TABLE "store_settings" ADD COLUMN "pix_merchant_name" text;--> statement-breakpoint
ALTER TABLE "store_settings" ADD COLUMN "pix_merchant_city" text;