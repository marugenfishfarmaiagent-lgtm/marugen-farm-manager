-- Clear invoices + koi fish stock only (test reset).
-- Includes: sold koi (Koi Fish → Sold tab), customer koi, invoice-linked inventory sells.
-- Keeps: customers, products, expenses, deliveries, events, pond data, etc.
--
-- BEFORE RUNNING: close all Marugen app tabs (or log out) on every device.
-- Otherwise open browsers may push deleted koi back to cloud.
--
-- Tombstones: DELETE triggers record sync_tombstones so devices drop local ghosts.
-- Do NOT wipe those tombstones here — see clear_sync_tombstones_for_reuse.sql if you
-- need to reuse the same KOI-xxx / INV-xxx ids after a reset.
BEGIN;

DELETE FROM customer_koi;
DELETE FROM koi_fish;
DELETE FROM invoices;

-- Product stock log lines created by invoices (sell / cancel restock)
DELETE FROM stock_activity
WHERE type IN ('sell', 'restock')
  AND (note LIKE 'Invoice %' OR note LIKE 'Invoice cancelled %');

-- Invoice stock-log tombstones only (optional hygiene; koi/invoice tombstones stay)
DELETE FROM sync_tombstones
WHERE entity = 'stock_activity';

UPDATE customers
SET total_spent = 0,
    tier = 'Bronze',
    updated_at = now()
WHERE total_spent IS DISTINCT FROM 0 OR tier IS DISTINCT FROM 'Bronze';

COMMIT;
