ALTER TABLE "customer_accounts" ADD COLUMN "google_id" text;--> statement-breakpoint
ALTER TABLE "customer_accounts" ADD COLUMN "apple_id" text;--> statement-breakpoint
ALTER TABLE "customer_accounts" ADD CONSTRAINT "customer_accounts_google_id_unique" UNIQUE("google_id");--> statement-breakpoint
ALTER TABLE "customer_accounts" ADD CONSTRAINT "customer_accounts_apple_id_unique" UNIQUE("apple_id");