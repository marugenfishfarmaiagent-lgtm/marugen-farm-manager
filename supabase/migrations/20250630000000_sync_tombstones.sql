-- Tombstones prevent deleted rows (SQL or app) from being resurrected by stale device sync.

CREATE TABLE IF NOT EXISTS sync_tombstones (
  entity TEXT NOT NULL,
  record_id TEXT NOT NULL,
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (entity, record_id)
);

CREATE INDEX IF NOT EXISTS sync_tombstones_deleted_at_idx ON sync_tombstones (deleted_at DESC);

ALTER TABLE sync_tombstones ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION record_sync_tombstone()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO sync_tombstones (entity, record_id, deleted_at)
  VALUES (TG_ARGV[0], OLD.id::TEXT, now())
  ON CONFLICT (entity, record_id) DO UPDATE SET deleted_at = EXCLUDED.deleted_at;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS sync_tombstone_invoices ON invoices;
CREATE TRIGGER sync_tombstone_invoices
  AFTER DELETE ON invoices
  FOR EACH ROW EXECUTE FUNCTION record_sync_tombstone('invoices');

DROP TRIGGER IF EXISTS sync_tombstone_koi_fish ON koi_fish;
CREATE TRIGGER sync_tombstone_koi_fish
  AFTER DELETE ON koi_fish
  FOR EACH ROW EXECUTE FUNCTION record_sync_tombstone('koi_fish');

DROP TRIGGER IF EXISTS sync_tombstone_customer_koi ON customer_koi;
CREATE TRIGGER sync_tombstone_customer_koi
  AFTER DELETE ON customer_koi
  FOR EACH ROW EXECUTE FUNCTION record_sync_tombstone('customer_koi');

DROP TRIGGER IF EXISTS sync_tombstone_customers ON customers;
CREATE TRIGGER sync_tombstone_customers
  AFTER DELETE ON customers
  FOR EACH ROW EXECUTE FUNCTION record_sync_tombstone('customers');

DROP TRIGGER IF EXISTS sync_tombstone_products ON products;
CREATE TRIGGER sync_tombstone_products
  AFTER DELETE ON products
  FOR EACH ROW EXECUTE FUNCTION record_sync_tombstone('products');

DROP TRIGGER IF EXISTS sync_tombstone_expenses ON expenses;
CREATE TRIGGER sync_tombstone_expenses
  AFTER DELETE ON expenses
  FOR EACH ROW EXECUTE FUNCTION record_sync_tombstone('expenses');

DROP TRIGGER IF EXISTS sync_tombstone_deliveries ON deliveries;
CREATE TRIGGER sync_tombstone_deliveries
  AFTER DELETE ON deliveries
  FOR EACH ROW EXECUTE FUNCTION record_sync_tombstone('deliveries');

DROP TRIGGER IF EXISTS sync_tombstone_events ON events;
CREATE TRIGGER sync_tombstone_events
  AFTER DELETE ON events
  FOR EACH ROW EXECUTE FUNCTION record_sync_tombstone('events');

DROP TRIGGER IF EXISTS sync_tombstone_stock_activity ON stock_activity;
CREATE TRIGGER sync_tombstone_stock_activity
  AFTER DELETE ON stock_activity
  FOR EACH ROW EXECUTE FUNCTION record_sync_tombstone('stock_activity');

DROP TRIGGER IF EXISTS sync_tombstone_whatsapp_groups ON whatsapp_groups;
CREATE TRIGGER sync_tombstone_whatsapp_groups
  AFTER DELETE ON whatsapp_groups
  FOR EACH ROW EXECUTE FUNCTION record_sync_tombstone('whatsapp_groups');
