-- Marugen Farm Manager — full patch for project iqwypobdqnrpdkgebkds
-- Run once in: Supabase Dashboard → SQL Editor → New query → Run
-- Safe to re-run (uses IF NOT EXISTS / IF NOT EXISTS columns)

-- ── Security hardening ──
CREATE TABLE IF NOT EXISTS auth_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT NOT NULL REFERENCES farm_users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE farm_users ADD COLUMN IF NOT EXISTS pin_hash TEXT;
ALTER TABLE farm_users ALTER COLUMN pin DROP NOT NULL;

DROP POLICY IF EXISTS "anon_all_farm_users" ON farm_users;
DROP POLICY IF EXISTS "anon_all_customers" ON customers;
DROP POLICY IF EXISTS "anon_all_products" ON products;
DROP POLICY IF EXISTS "anon_all_invoices" ON invoices;
DROP POLICY IF EXISTS "anon_all_expenses" ON expenses;
DROP POLICY IF EXISTS "anon_all_deliveries" ON deliveries;
DROP POLICY IF EXISTS "anon_all_events" ON events;
DROP POLICY IF EXISTS "anon_all_stock_activity" ON stock_activity;

ALTER TABLE auth_sessions ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_auth_sessions_token ON auth_sessions(token);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires ON auth_sessions(expires_at);

-- ── Customers / deliveries address ──
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS postal_code TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS address TEXT DEFAULT '';

ALTER TABLE deliveries
  ADD COLUMN IF NOT EXISTS postal_code TEXT DEFAULT '';

-- ── Invoice discount + accounting booked ──
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS discount_type TEXT DEFAULT 'none';
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS discount_value NUMERIC DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS booked BOOLEAN DEFAULT false;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS booked_at TIMESTAMPTZ;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS booked_by TEXT DEFAULT '';
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS pdf_url TEXT DEFAULT '';

ALTER TABLE expenses ADD COLUMN IF NOT EXISTS booked BOOLEAN DEFAULT false;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS booked_at TIMESTAMPTZ;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS booked_by TEXT DEFAULT '';

-- ── Expense receipt images ──
ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS image_data TEXT,
  ADD COLUMN IF NOT EXISTS image_name TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS image_url TEXT DEFAULT '';

ALTER TABLE expenses ALTER COLUMN category DROP NOT NULL;
ALTER TABLE expenses ALTER COLUMN amount DROP NOT NULL;

-- ── Delivery invoice link + created_by ──
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS invoice_id TEXT DEFAULT '';
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS created_by TEXT DEFAULT '';
ALTER TABLE events ADD COLUMN IF NOT EXISTS created_by TEXT DEFAULT '';

-- ── Koi, pond, WhatsApp (cloud modules) ──
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

-- ── AI usage tracking ──
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
CREATE INDEX IF NOT EXISTS idx_ai_usage_date ON ai_usage_daily(usage_date);

-- ── Expense receipt storage bucket (Phase 3) ──
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'expense-receipts',
  'expense-receipts',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ── Invoice PDF archive (private bucket) ──
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'invoice-documents',
  'invoice-documents',
  false,
  10485760,
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ── Koi / customer koi photo storage (private bucket) ──
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'koi-photos',
  'koi-photos',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ── Expense budgets + RLS verification ──
CREATE TABLE IF NOT EXISTS expense_budgets (
  id TEXT PRIMARY KEY DEFAULT 'default',
  data JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO expense_budgets (id, data)
VALUES ('default', '{}')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE expense_budgets ENABLE ROW LEVEL SECURITY;
