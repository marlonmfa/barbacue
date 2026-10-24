-- Aplicação explícita e aditiva; não altera pedidos, impressão, contas ou dados anteriores.
CREATE TABLE IF NOT EXISTS ifood_webhook_inbox (
  event_id text PRIMARY KEY,
  merchant_id uuid NOT NULL,
  payload jsonb,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ifood_webhook_pending_idx
  ON ifood_webhook_inbox (next_attempt_at, received_at) WHERE processed_at IS NULL;
