CREATE TABLE "kitchen_print_devices" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"printers" jsonb NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kitchen_printer_routes" (
	"brand" text PRIMARY KEY NOT NULL,
	"device_id" uuid,
	"printer_name" text,
	"paper" integer DEFAULT 80 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "kitchen_print_jobs" ADD COLUMN "destination" jsonb;--> statement-breakpoint
ALTER TABLE "kitchen_printer_routes" ADD CONSTRAINT "kitchen_printer_routes_device_id_kitchen_print_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."kitchen_print_devices"("id") ON DELETE no action ON UPDATE no action;