-- Server-side copy of the profile page's notification toggles
-- ({budgetAlerts, billReminders, goalAlerts, weeklySummary}: booleans) so
-- server pushes can respect them. NULL = never set = push everything.
ALTER TABLE users ADD COLUMN IF NOT EXISTS notification_prefs JSONB;
