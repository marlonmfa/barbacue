CREATE TABLE "restaurant_floor_plan" (
  "id" integer PRIMARY KEY CHECK ("id" = 1),
  "revision" integer NOT NULL DEFAULT 0,
  "elements" jsonb NOT NULL DEFAULT '[]'::jsonb
);
--> statement-breakpoint
INSERT INTO "restaurant_floor_plan" ("id") VALUES (1);
