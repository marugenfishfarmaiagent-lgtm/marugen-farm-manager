-- RLS verification: ensure all business tables deny direct anon access.
-- Data flows through Edge Functions (service role). No policies = anon cannot read/write.

CREATE TABLE IF NOT EXISTS expense_budgets (
  id TEXT PRIMARY KEY DEFAULT 'default',
  data JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO expense_budgets (id, data)
VALUES ('default', '{}')
ON CONFLICT (id) DO NOTHING;

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'farm_users',
    'auth_sessions',
    'customers',
    'products',
    'invoices',
    'expenses',
    'deliveries',
    'events',
    'stock_activity',
    'koi_fish',
    'customer_koi',
    'farm_pond_data',
    'whatsapp_groups',
    'ai_usage_daily',
    'api_rate_limits',
    'expense_budgets'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
  END LOOP;
END $$;
