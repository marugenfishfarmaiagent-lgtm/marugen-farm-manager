-- Marugen Koi Farm — Supabase Schema (production-hardened)
-- Run in: Supabase Dashboard → SQL Editor

CREATE TABLE IF NOT EXISTS farm_users (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'staff')),
  pin_hash TEXT,
  pin TEXT,
  active BOOLEAN DEFAULT true,
  permissions JSONB NOT NULL DEFAULT '[]',
  is_system BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT NOT NULL REFERENCES farm_users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS customers (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  whatsapp TEXT,
  area TEXT,
  postal_code TEXT DEFAULT '',
  address TEXT DEFAULT '',
  fish_types JSONB DEFAULT '[]',
  tier TEXT DEFAULT 'Bronze',
  notes TEXT DEFAULT '',
  total_spent NUMERIC DEFAULT 0
);

CREATE TABLE IF NOT EXISTS products (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT,
  sku TEXT,
  price NUMERIC DEFAULT 0,
  cost NUMERIC DEFAULT 0,
  unit TEXT DEFAULT 'unit',
  stock NUMERIC DEFAULT 0,
  min_stock NUMERIC DEFAULT 0,
  description TEXT DEFAULT '',
  track_stock BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  customer_id BIGINT,
  customer_name TEXT,
  customer_phone TEXT DEFAULT '',
  customer_whatsapp TEXT DEFAULT '',
  customer_address TEXT DEFAULT '',
  items JSONB DEFAULT '[]',
  total NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'pending',
  date DATE,
  due_date DATE,
  notes TEXT DEFAULT '',
  discount_type TEXT DEFAULT 'none',
  discount_value NUMERIC DEFAULT 0,
  booked BOOLEAN DEFAULT false,
  booked_at TIMESTAMPTZ,
  booked_by TEXT DEFAULT '',
  created_by TEXT DEFAULT '',
  pdf_url TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS expenses (
  id BIGSERIAL PRIMARY KEY,
  category TEXT,
  amount NUMERIC,
  date DATE,
  note TEXT DEFAULT '',
  added_by TEXT DEFAULT '',
  image_data TEXT,
  image_name TEXT DEFAULT '',
  image_url TEXT DEFAULT '',
  booked BOOLEAN DEFAULT false,
  booked_at TIMESTAMPTZ,
  booked_by TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS deliveries (
  id TEXT PRIMARY KEY,
  invoice_id TEXT DEFAULT '',
  customer_id BIGINT,
  customer_name TEXT,
  area TEXT,
  postal_code TEXT DEFAULT '',
  address TEXT,
  schedule TEXT,
  status TEXT DEFAULT 'scheduled',
  items TEXT DEFAULT '',
  driver TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  created_by TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS events (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  date DATE,
  time TEXT,
  type TEXT DEFAULT 'other',
  note TEXT DEFAULT '',
  created_by TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS stock_activity (
  id BIGSERIAL PRIMARY KEY,
  product_id BIGINT,
  product_name TEXT,
  type TEXT,
  qty NUMERIC,
  value NUMERIC,
  note TEXT DEFAULT '',
  date DATE,
  added_by TEXT DEFAULT ''
);

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

-- RLS: deny direct anon access — all data via Edge Functions (service role)
ALTER TABLE farm_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE koi_fish ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_koi ENABLE ROW LEVEL SECURITY;
ALTER TABLE farm_pond_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_groups ENABLE ROW LEVEL SECURITY;

-- No policies = anon role cannot read/write (service role bypasses RLS)

CREATE TABLE IF NOT EXISTS ai_usage_daily (
  user_id BIGINT NOT NULL REFERENCES farm_users(id) ON DELETE CASCADE,
  usage_date DATE NOT NULL DEFAULT CURRENT_DATE,
  request_count INT NOT NULL DEFAULT 0,
  input_tokens BIGINT NOT NULL DEFAULT 0,
  output_tokens BIGINT NOT NULL DEFAULT 0,
  total_tokens BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, usage_date)
);

ALTER TABLE ai_usage_daily ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_auth_sessions_token ON auth_sessions(token);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires ON auth_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_ai_usage_date ON ai_usage_daily(usage_date);
