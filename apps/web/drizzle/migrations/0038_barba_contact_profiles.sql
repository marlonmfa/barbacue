ALTER TABLE staff_users
  ADD COLUMN IF NOT EXISTS whatsapp_phone text UNIQUE,
  ADD COLUMN IF NOT EXISTS vehicle_model text,
  ADD COLUMN IF NOT EXISTS vehicle_color text,
  ADD COLUMN IF NOT EXISTS vehicle_plate text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS barba_contact_profiles (
  phone text PRIMARY KEY,
  role text NOT NULL CHECK (role IN ('admin', 'manager', 'driver', 'customer')),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
-- Preserve original phone strings; use one canonical matching key across channels.
CREATE OR REPLACE FUNCTION customer_phone_key(value text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$
  SELECT CASE WHEN digits ~ '^55[0-9]{10,11}$' THEN digits
              WHEN digits ~ '^[0-9]{10,11}$' THEN '55' || digits END
  FROM (SELECT regexp_replace(value, '[^0-9]', '', 'g') AS digits) p
$$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS orders_barba_customer_phone_idx
  ON orders (customer_phone_key(customer_phone))
  WHERE status IN ('confirmed', 'preparing', 'ready', 'delivered') AND channel IS DISTINCT FROM 'test';
