-- Optional GST / tax amount on invoices (excluded from line items; added in totals).
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS tax NUMERIC DEFAULT 0;
