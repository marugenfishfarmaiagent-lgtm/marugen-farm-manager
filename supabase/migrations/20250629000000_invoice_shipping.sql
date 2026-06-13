-- Invoice shipping fee
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS shipping NUMERIC DEFAULT 0;
