-- Assign team: staff targets on calendar/delivery records and targeted team notifications.

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS assigned_user_ids BIGINT[] NOT NULL DEFAULT '{}';

ALTER TABLE deliveries
  ADD COLUMN IF NOT EXISTS assigned_user_ids BIGINT[] NOT NULL DEFAULT '{}';

ALTER TABLE team_notifications
  ADD COLUMN IF NOT EXISTS target_user_ids BIGINT[] DEFAULT NULL;

CREATE INDEX IF NOT EXISTS team_notifications_target_user_ids_idx
  ON team_notifications USING GIN (target_user_ids);
