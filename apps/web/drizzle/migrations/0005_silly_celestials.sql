CREATE TYPE "public"."beta_platform" AS ENUM('ios', 'android');--> statement-breakpoint
CREATE TABLE "beta_signups" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"whatsapp" text NOT NULL,
	"email" text NOT NULL,
	"platform" "beta_platform" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "beta_signups_whatsapp_unique" UNIQUE("whatsapp")
);
