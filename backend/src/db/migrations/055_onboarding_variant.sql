-- Phase 1 of docs/GROWTH_BRIEF_10000X.md: A/B cohort for the new import-first
-- onboarding step. Assigned deterministically from email at registration
-- (see auth.js /register) so it never needs a feature-flag service. The
-- 'control' cohort's onboarding must stay pixel-identical to today's -- that's
-- what makes the retention comparison (backend/scripts/retention-report.js)
-- meaningful.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS onboarding_variant VARCHAR(20) NOT NULL DEFAULT 'control'
    CHECK (onboarding_variant IN ('control', 'treatment'));
