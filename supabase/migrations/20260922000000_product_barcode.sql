-- Add barcode column to products (feature added in the frontend without a
-- matching column, so scanned/typed barcodes were silently dropped on every
-- cloud sync and never actually persisted).
ALTER TABLE products ADD COLUMN IF NOT EXISTS barcode TEXT DEFAULT '';
