CREATE TABLE IF NOT EXISTS courier_pay_shifts (
  driver_id integer NOT NULL REFERENCES staff_users(id),
  operating_day date NOT NULL,
  confirmed boolean NOT NULL DEFAULT true,
  recorded_by integer NOT NULL REFERENCES staff_users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS courier_pay_shifts_day_driver_idx
  ON courier_pay_shifts (operating_day, driver_id);
