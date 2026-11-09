-- Extratos bancários importados (OFX) e regras aprendidas de classificação.
-- Aditiva e idempotente: não altera tabelas existentes. Aplicar com psql na publicação,
-- como 0024/0027/0030 (fora do journal do drizzle).
CREATE TABLE IF NOT EXISTS "bank_transactions" (
  "id" serial PRIMARY KEY,
  "brand" text NOT NULL,
  "bank" text NOT NULL,
  "account" text NOT NULL,
  "fitid" text NOT NULL,
  "posted_date" date NOT NULL,
  "amount_cents" integer NOT NULL,
  "description" text NOT NULL,
  "counterparty" text,
  "document" text,
  "status" text NOT NULL DEFAULT 'pending',
  "category" text,
  "rule" text,
  "finance_id" integer REFERENCES "erp_finance"("id"),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "bank_transactions_unique" UNIQUE ("bank", "account", "fitid")
);
CREATE INDEX IF NOT EXISTS "bank_transactions_status_idx" ON "bank_transactions" ("status", "posted_date");

CREATE TABLE IF NOT EXISTS "bank_rules" (
  "id" serial PRIMARY KEY,
  "pattern" text NOT NULL,
  "direction" text NOT NULL,
  "action" text NOT NULL,
  "category" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "bank_rules_unique" UNIQUE ("pattern", "direction")
);
