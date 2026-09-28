-- Monthly recurring items with no day_of_month used their current due date
-- as the only anchor, so one clamp (31 -> Feb 28) moved them to the 28th for
-- good. POST/PUT /api/recurring now always store a day for monthly items;
-- this pins existing ones to the day they are currently due on. Rows that
-- already drifted keep today's day: scripts/repair-recurring-anchors.js finds
-- those. Idempotent: only touches rows that still have no day.
UPDATE recurring_transactions
SET day_of_month = EXTRACT(DAY FROM next_due_date)::int
WHERE frequency = 'monthly' AND day_of_month IS NULL;
