CREATE TABLE IF NOT EXISTS ai_provider_settings (
  id integer PRIMARY KEY CHECK (id = 1),
  encrypted_value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
