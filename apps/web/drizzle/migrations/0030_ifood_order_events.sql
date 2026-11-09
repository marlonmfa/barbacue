-- Eventos do iFood guardados pelo monitor (disputas HSD/HSS, código de entrega DDCR/DDCS e demais),
-- mais as ações locais sobre disputas. Aditiva: não altera tabelas existentes.
CREATE TABLE IF NOT EXISTS "ifood_order_events" (
  "id" text PRIMARY KEY,
  "order_external_id" text NOT NULL,
  "merchant_id" text,
  "brand" text,
  "code" text NOT NULL,
  "full_code" text,
  "dispute_id" text,
  "payload" jsonb NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "ifood_order_events_code_created_idx" ON "ifood_order_events" ("code", "created_at");
CREATE INDEX IF NOT EXISTS "ifood_order_events_order_idx" ON "ifood_order_events" ("order_external_id");
CREATE INDEX IF NOT EXISTS "ifood_order_events_dispute_idx" ON "ifood_order_events" ("dispute_id");
