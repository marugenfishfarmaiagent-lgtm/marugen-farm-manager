CREATE TABLE IF NOT EXISTS ai_usage_daily (
  user_id BIGINT NOT NULL REFERENCES farm_users(id) ON DELETE CASCADE,
  usage_date DATE NOT NULL DEFAULT CURRENT_DATE,
  request_count INT NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, usage_date)
);

ALTER TABLE ai_usage_daily ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_ai_usage_date ON ai_usage_daily(usage_date);
