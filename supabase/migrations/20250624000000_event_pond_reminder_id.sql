-- Link calendar events to pond management reminders (one-way sync from Pond Mgmt).
ALTER TABLE events ADD COLUMN IF NOT EXISTS pond_reminder_id TEXT DEFAULT '';
