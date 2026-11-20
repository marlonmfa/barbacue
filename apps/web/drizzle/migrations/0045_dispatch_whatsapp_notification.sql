ALTER TABLE "dispatch_routes" ADD COLUMN "whatsapp_notification" jsonb;
ALTER TABLE "dispatch_routes" ADD COLUMN "confirmation_hash" text UNIQUE;
ALTER TABLE "orders" ADD COLUMN "delivery_confirmation_hash" text;
