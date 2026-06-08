-- Remaining security hardening: sync timestamps, DB rate limits, optional setup secret support

CREATE TABLE IF NOT EXISTS api_rate_limits (
  bucket_key TEXT PRIMARY KEY,
  hit_count INT NOT NULL DEFAULT 0,
  reset_at TIMESTAMPTZ NOT NULL
);

ALTER TABLE api_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_api_rate_limits_reset ON api_rate_limits(reset_at);

ALTER TABLE customers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE products ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE events ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE stock_activity ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE koi_fish ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE customer_koi ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE whatsapp_groups ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE farm_pond_data ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Invoice PDF archive disabled in app; bucket may remain empty (remove via Storage API if desired).
