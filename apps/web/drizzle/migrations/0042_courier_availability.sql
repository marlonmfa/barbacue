ALTER TABLE staff_presence ADD COLUMN IF NOT EXISTS declared_available_until timestamptz;
