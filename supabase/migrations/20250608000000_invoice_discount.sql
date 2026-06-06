-- Invoice discount fields (fixed amount or percentage)
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS discount_type TEXT DEFAULT 'none';
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS discount_value NUMERIC DEFAULT 0;
