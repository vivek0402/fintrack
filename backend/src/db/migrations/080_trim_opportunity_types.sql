-- Three opportunity detectors were removed as low-value: allocation_gap (a
-- generic rule of thumb), behavioral_pattern (repeats the Insights tab) and
-- salary_intelligence_insight (only a pointer to another screen). Clear the
-- cards they already created.
DELETE FROM opportunities
WHERE type IN ('allocation_gap', 'behavioral_pattern', 'salary_intelligence_insight');

-- The remaining detectors now link to the real pages instead of the old
-- redirect-only routes; point already-saved cards there too. Both statements
-- are no-ops on replay.
UPDATE opportunities SET action_route = '/debt-intelligence?tab=loans'
WHERE action_route = '/loans';

UPDATE opportunities SET action_route = '/savings-plan?tab=forecast'
WHERE action_route = '/forecast';
