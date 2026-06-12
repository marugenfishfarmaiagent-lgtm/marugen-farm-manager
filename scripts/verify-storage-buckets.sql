-- Run in Supabase Dashboard → SQL Editor after migrations.
-- Confirms private image buckets exist (Section 5.1).

SELECT id, name, public, file_size_limit, created_at
FROM storage.buckets
WHERE id IN ('expense-receipts', 'koi-photos', 'delivery-photos')
ORDER BY id;

-- Expected: 3 rows, public = false for each.
-- If missing, run migrations in order:
--   20250615000000_expense_storage.sql
--   20250616000000_expense_storage_private.sql
--   20250617000000_koi_photos_storage.sql
-- Then: supabase functions deploy farm-api
