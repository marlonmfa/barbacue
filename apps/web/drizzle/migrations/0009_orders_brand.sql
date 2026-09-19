ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "brand" text DEFAULT 'barbacue' NOT NULL;
