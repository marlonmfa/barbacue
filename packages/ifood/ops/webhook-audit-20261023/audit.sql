-- Migração aditiva: não apaga eventos, pedidos, fila ou configurações existentes.
ALTER TABLE ifood_webhook_inbox
  ADD COLUMN IF NOT EXISTS order_id text,
  ADD COLUMN IF NOT EXISTS event_code text,
  ADD COLUMN IF NOT EXISTS event_full_code text,
  ADD COLUMN IF NOT EXISTS event_created_at timestamptz,
  ADD COLUMN IF NOT EXISTS local_order_id uuid,
  ADD COLUMN IF NOT EXISTS local_status_at_processing text;
CREATE INDEX IF NOT EXISTS ifood_webhook_order_idx
  ON ifood_webhook_inbox (order_id, received_at DESC);
-- Apenas o que ainda tem payload é recuperável; não inventar metadados históricos.
UPDATE ifood_webhook_inbox SET
  order_id=COALESCE(order_id, payload->>'orderId'),
  event_code=COALESCE(event_code, payload->>'code'),
  event_full_code=COALESCE(event_full_code, payload->>'fullCode')
WHERE payload IS NOT NULL;
