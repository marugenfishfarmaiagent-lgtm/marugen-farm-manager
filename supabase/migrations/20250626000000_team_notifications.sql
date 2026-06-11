-- Shared team activity feed so other devices can show bell alerts after cloud sync.

CREATE TABLE IF NOT EXISTS team_notifications (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  actor TEXT NOT NULL DEFAULT 'Unknown',
  actor_role TEXT NOT NULL DEFAULT 'staff',
  actor_user_id BIGINT REFERENCES farm_users(id) ON DELETE SET NULL,
  notification_type TEXT NOT NULL DEFAULT 'info',
  url TEXT NOT NULL DEFAULT '/?tab=dashboard',
  tag TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS team_notifications_created_at_idx ON team_notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS team_notifications_actor_user_id_idx ON team_notifications(actor_user_id);

ALTER TABLE team_notifications ENABLE ROW LEVEL SECURITY;
