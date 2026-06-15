-- Clear invoices + koi fish stock only (test reset).
-- Keeps: customers, products, expenses, deliveries, events, pond data, etc.
--
-- IMPORTANT: Also clears sync_tombstones for these entities so re-used invoice ids
-- (e.g. INV20260614-01) are not hidden after SQL delete + re-create.
BEGIN;

DELETE FROM customer_koi;
DELETE FROM koi_fish;
DELETE FROM invoices;

DELETE FROM sync_tombstones
WHERE entity IN ('invoices', 'koi_fish', 'customer_koi');

UPDATE customers
SET total_spent = 0,
    tier = 'Bronze',
    updated_at = now()
WHERE total_spent IS DISTINCT FROM 0 OR tier IS DISTINCT FROM 'Bronze';

COMMIT;
