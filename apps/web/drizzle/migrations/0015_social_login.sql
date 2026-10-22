ALTER TABLE "customer_accounts" ALTER COLUMN "email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "customer_accounts" ALTER COLUMN "password_hash" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "customer_accounts" ADD COLUMN "instagram_id" text;--> statement-breakpoint
ALTER TABLE "customer_accounts" ADD COLUMN "instagram_username" text;--> statement-breakpoint
ALTER TABLE "customer_accounts" ADD COLUMN "facebook_id" text;--> statement-breakpoint
ALTER TABLE "customer_accounts" ADD CONSTRAINT "customer_accounts_instagram_id_unique" UNIQUE("instagram_id");--> statement-breakpoint
ALTER TABLE "customer_accounts" ADD CONSTRAINT "customer_accounts_facebook_id_unique" UNIQUE("facebook_id");