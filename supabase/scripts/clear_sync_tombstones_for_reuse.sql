-- Optional step AFTER clear_invoices_and_koi.sql when you must reuse KOI-xxx / INV-xxx ids.
-- Run only when every device has synced (or is logged out) so deleted rows are not pushed back.
BEGIN;

DELETE FROM sync_tombstones
WHERE entity IN ('invoices', 'koi_fish', 'customer_koi');

COMMIT;
