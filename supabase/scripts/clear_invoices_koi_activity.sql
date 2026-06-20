-- Clear invoices, koi fish, and all stock activity log.
-- Keeps: products (stock counts + prices), customers, expenses,
--        deliveries, events, pond data, farm users, price list.
--
-- BEFORE RUNNING:
--   1. Log out (or close) ALL Marugen app tabs / devices.
--      Open browsers may push deleted rows back to cloud immediately.
--   2. Run in Supabase Dashboard → SQL Editor.
--   3. Review the SELECT previews in Step 0 before committing.
--
-- After running: re-open the app on all devices so they pull fresh state.

BEGIN;

-- ─── Step 0: preview counts before delete (check these look right) ───────────
SELECT 'invoices'      AS tbl, COUNT(*) AS rows FROM invoices
UNION ALL
SELECT 'koi_fish'      AS tbl, COUNT(*) AS rows FROM koi_fish
UNION ALL
SELECT 'customer_koi'  AS tbl, COUNT(*) AS rows FROM customer_koi
UNION ALL
SELECT 'stock_activity'AS tbl, COUNT(*) AS rows FROM stock_activity;

-- ─── Step 1: Invoices ─────────────────────────────────────────────────────────
DELETE FROM invoices;

-- ─── Step 2: Koi fish ────────────────────────────────────────────────────────
DELETE FROM customer_koi;
DELETE FROM koi_fish;

-- ─── Step 3: Activity log (all use / restock / sell history) ─────────────────
DELETE FROM stock_activity;

-- ─── Step 4: Reset customer totals (invoices gone → no spend history) ─────────
UPDATE customers
SET total_spent = 0,
    tier        = 'Bronze',
    updated_at  = now()
WHERE total_spent IS DISTINCT FROM 0
   OR tier       IS DISTINCT FROM 'Bronze';

-- ─── Step 5: Clean sync tombstones for cleared entities ──────────────────────
-- Keeps tombstones for products / customers / expenses / etc. intact.
DELETE FROM sync_tombstones
WHERE entity IN ('invoices', 'koi_fish', 'customer_koi', 'stock_activity');

-- ─── Step 6: Confirm final counts (should all be 0) ──────────────────────────
SELECT 'invoices'      AS tbl, COUNT(*) AS remaining FROM invoices
UNION ALL
SELECT 'koi_fish'      AS tbl, COUNT(*) AS remaining FROM koi_fish
UNION ALL
SELECT 'customer_koi'  AS tbl, COUNT(*) AS remaining FROM customer_koi
UNION ALL
SELECT 'stock_activity'AS tbl, COUNT(*) AS remaining FROM stock_activity;

COMMIT;
