-- Clear all invoice + koi fish data (test reset). Keeps customers, products, expenses, etc.
-- sync_tombstones triggers record deletions so stale devices cannot resurrect these rows.
BEGIN;

DELETE FROM customer_koi;
DELETE FROM koi_fish;
DELETE FROM invoices;

UPDATE customers
SET total_spent = 0,
    tier = 'Bronze',
    updated_at = now()
WHERE total_spent IS DISTINCT FROM 0 OR tier IS DISTINCT FROM 'Bronze';

COMMIT;
