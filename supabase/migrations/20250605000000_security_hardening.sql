-- Migration: security hardening (run on existing projects)

CREATE TABLE IF NOT EXISTS auth_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT NOT NULL REFERENCES farm_users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE farm_users ADD COLUMN IF NOT EXISTS pin_hash TEXT;

DROP POLICY IF EXISTS "anon_all_farm_users" ON farm_users;
DROP POLICY IF EXISTS "anon_all_customers" ON customers;
DROP POLICY IF EXISTS "anon_all_products" ON products;
DROP POLICY IF EXISTS "anon_all_invoices" ON invoices;
DROP POLICY IF EXISTS "anon_all_expenses" ON expenses;
DROP POLICY IF EXISTS "anon_all_deliveries" ON deliveries;
DROP POLICY IF EXISTS "anon_all_events" ON events;
DROP POLICY IF EXISTS "anon_all_stock_activity" ON stock_activity;

CREATE INDEX IF NOT EXISTS idx_auth_sessions_token ON auth_sessions(token);
