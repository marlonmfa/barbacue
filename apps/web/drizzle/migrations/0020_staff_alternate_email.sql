CREATE TABLE IF NOT EXISTS staff_alternate_emails (
  user_id integer PRIMARY KEY REFERENCES staff_users(id) ON DELETE CASCADE,
  email text NOT NULL,
  code_hash text,
  expires_at timestamptz NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0,
  verified_at timestamptz
);
