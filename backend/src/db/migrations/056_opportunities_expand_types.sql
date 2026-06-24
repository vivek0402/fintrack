-- Phase 2 of docs/GROWTH_BRIEF_10000X.md (Money OS Consolidation): widens the
-- opportunities.type allow-list so detectors can surface signals already
-- computed by forecast/personality/tax-estimate/behavioral-patterns/
-- salary-intelligence through the same ranked feed, instead of those staying
-- siloed on their own pages that most users never visit.
-- Same drop-and-recreate pattern as migration 045 (inline CHECK constraints
-- have no ADD CONSTRAINT IF NOT EXISTS / ALTER in Postgres).

ALTER TABLE opportunities DROP CONSTRAINT IF EXISTS opportunities_type_check;
ALTER TABLE opportunities ADD CONSTRAINT opportunities_type_check
  CHECK (type IN (
    'idle_cash','credit_card_interest','high_interest_loan','tax_80c_gap',
    'spending_spike','allocation_gap','sip_underinvesting','emergency_fund_low',
    'forecast_budget_warning','personality_insight','advance_tax_due',
    'behavioral_pattern','salary_intelligence_insight'
  ));
