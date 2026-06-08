-- Persist invoice customer contact + creator (survives reload / multi-device sync)
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS customer_phone TEXT DEFAULT '';
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS customer_whatsapp TEXT DEFAULT '';
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS customer_address TEXT DEFAULT '';
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS created_by TEXT DEFAULT '';
