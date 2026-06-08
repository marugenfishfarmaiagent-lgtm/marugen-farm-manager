-- One-time legacy cleanup (2025-06). Do NOT auto-delete on migrate — use supabase/scripts/restore_product_catalog.sql
-- and manual SQL in Dashboard if a controlled wipe is ever needed again.
SELECT 1;
