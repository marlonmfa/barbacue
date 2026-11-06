CREATE TABLE IF NOT EXISTS "staff_presence" (
  "user_id" integer PRIMARY KEY REFERENCES "staff_users"("id") ON DELETE CASCADE,
  "available" boolean NOT NULL DEFAULT false,
  "last_seen_at" timestamp with time zone NOT NULL DEFAULT now()
);
