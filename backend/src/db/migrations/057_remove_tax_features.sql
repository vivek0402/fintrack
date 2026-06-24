-- Removes the tax intelligence feature set (tax profile/HRA/LTA/advance tax/
-- 80C/ITR readiness/capital gains) and its supporting tables, now that the
-- /tax pages, routes, tax_planner agent, and opportunity detectors have been
-- deleted from the app.

DROP TABLE IF EXISTS advance_tax_payments;
DROP TABLE IF EXISTS tax_profiles;
DROP TABLE IF EXISTS tax_investments;
DROP TABLE IF EXISTS tax_deductions;
DROP TABLE IF EXISTS capital_transactions;
DROP TABLE IF EXISTS capital_gains_records;

-- Recategorize any existing tax-document rows to 'other' before tightening
-- the constraint below, so the migration doesn't fail on pre-existing data
-- (and so the underlying uploaded file is preserved, just relabeled).
UPDATE documents SET type = 'other'
  WHERE type IN ('form_16', 'itr_copy', 'advance_tax_challan', 'rent_receipt');

-- Drop the now-tax-specific document types (Form 16, ITR copy, advance tax
-- challan, rent receipt), keeping the general financial document types.
ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_type_check;
ALTER TABLE documents ADD CONSTRAINT documents_type_check
  CHECK (type IN (
    'salary_slip','bank_statement','insurance_policy','investment_proof','other'
  ));

-- These opportunity types are detector-generated, not user data — safe to
-- drop the rows outright now that detectTax80cGap/detectAdvanceTaxDue are gone.
DELETE FROM opportunities WHERE type IN ('tax_80c_gap', 'advance_tax_due');

-- Drop the tax-driven opportunity types from the allow-list added in 056.
ALTER TABLE opportunities DROP CONSTRAINT IF EXISTS opportunities_type_check;
ALTER TABLE opportunities ADD CONSTRAINT opportunities_type_check
  CHECK (type IN (
    'idle_cash','credit_card_interest','high_interest_loan',
    'spending_spike','allocation_gap','sip_underinvesting','emergency_fund_low',
    'forecast_budget_warning','personality_insight',
    'behavioral_pattern','salary_intelligence_insight'
  ));
