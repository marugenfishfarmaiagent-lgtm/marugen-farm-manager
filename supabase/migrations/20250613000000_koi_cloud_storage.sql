-- Koi Fish, Customer Koi, Pond Management, WhatsApp groups — cloud storage

CREATE TABLE IF NOT EXISTS koi_fish (
  id TEXT PRIMARY KEY,
  photo TEXT,
  name TEXT DEFAULT '',
  variety TEXT NOT NULL DEFAULT '',
  size NUMERIC,
  grade TEXT DEFAULT '',
  pond_name TEXT DEFAULT '',
  price NUMERIC DEFAULT 0,
  notes TEXT DEFAULT '',
  status TEXT DEFAULT 'available',
  date_added DATE,
  sold_to BIGINT,
  sold_date DATE,
  sold_price NUMERIC,
  sell_disposition TEXT,
  keep_pond_name TEXT,
  death_date DATE,
  death_cause TEXT,
  death_photo TEXT
);

CREATE TABLE IF NOT EXISTS customer_koi (
  id TEXT PRIMARY KEY,
  customer_id BIGINT,
  customer_name TEXT DEFAULT '',
  koi_id TEXT DEFAULT '',
  photo TEXT,
  fish_name TEXT DEFAULT '',
  variety TEXT DEFAULT '',
  size NUMERIC,
  pond_name TEXT DEFAULT '',
  purchase_date DATE,
  purchase_price NUMERIC DEFAULT 0,
  notes TEXT DEFAULT '',
  status TEXT DEFAULT 'in_pond',
  collected_date DATE,
  death_date DATE,
  death_cause TEXT,
  death_photo TEXT,
  death_notes TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS farm_pond_data (
  id TEXT PRIMARY KEY DEFAULT 'default',
  data JSONB NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS whatsapp_groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  link TEXT NOT NULL DEFAULT ''
);

INSERT INTO farm_pond_data (id, data)
VALUES ('default', '{}')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE koi_fish ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_koi ENABLE ROW LEVEL SECURITY;
ALTER TABLE farm_pond_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_groups ENABLE ROW LEVEL SECURITY;
