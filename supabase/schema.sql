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
  description TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  customer_id BIGINT,
  customer_name TEXT,
  items JSONB DEFAULT '[]',
  total NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'pending',
  date DATE,
  due_date DATE,
  notes TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS expenses (
  id BIGSERIAL PRIMARY KEY,
  category TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  date DATE,
  note TEXT DEFAULT '',
  added_by TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS deliveries (
  id TEXT PRIMARY KEY,
  customer_id BIGINT,
  customer_name TEXT,
  area TEXT,
  address TEXT,
  schedule TEXT,
  status TEXT DEFAULT 'scheduled',
  items TEXT DEFAULT '',
  driver TEXT DEFAULT '',
  notes TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS events (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  date DATE,
  time TEXT,
  type TEXT DEFAULT 'other',
  note TEXT DEFAULT ''
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

-- No policies = anon role cannot read/write (service role bypasses RLS)

CREATE INDEX IF NOT EXISTS idx_auth_sessions_token ON auth_sessions(token);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires ON auth_sessions(expires_at);
