-- Remove duplicate invoice-linked sell rows (keeps the oldest id per invoice note + product).
-- Run after deploying the stable stock-log-id fix.
DELETE FROM stock_activity sa
WHERE sa.type = 'sell'
  AND sa.note LIKE 'Invoice %'
  AND sa.id NOT IN (
    SELECT MIN(id)
    FROM stock_activity
    WHERE type = 'sell'
      AND note LIKE 'Invoice %'
    GROUP BY note, product_id
  );
