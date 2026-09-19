CREATE TABLE IF NOT EXISTS "brand_catalog_products" (
	"id" serial PRIMARY KEY NOT NULL,
	"brand" text NOT NULL,
	"external_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"category" text NOT NULL,
	"price_cents" integer NOT NULL,
	"original_price_cents" integer,
	"image_url" text,
	"ifood_url" text,
	"available" boolean DEFAULT true NOT NULL,
	"source" text DEFAULT 'custom' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "brand_catalog_products_brand_external_unique" UNIQUE("brand", "external_id")
);
