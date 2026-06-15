-- Clear all inventory activity log rows (sell / use / restock).
-- Product stock counts in `products` are NOT changed — only the history table.
--
-- BEFORE RUNNING: close all Marugen app tabs (or log out) on every device.
-- Otherwise open browsers may push deleted rows back to cloud.
--
-- Tombstones: DELETE triggers record sync_tombstones so devices drop local ghosts.
BEGIN;

DELETE FROM stock_activity;

DELETE FROM sync_tombstones
WHERE entity = 'stock_activity';

COMMIT;
