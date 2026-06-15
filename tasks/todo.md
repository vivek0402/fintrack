# FinTrack Phase 5: Tax Intelligence (v0.15)
## Todo
- [x] P0: Task tracking setup
- [x] P1: Database migrations (035-037)
- [x] P2: Backend — tax profile + HRA/LTA optimizer routes
- [x] P3: Backend — advance tax calculator + ITR readiness score routes
- [x] P4: Backend — document vault routes (Supabase Storage)
- [x] P5: Frontend — extend /tax page with 3 new sections
- [x] P6: Frontend — /documents page (vault)

## Note
Spec said migrations "032-034" but those numbers are already used
(032_loan_prepayments.sql from Phase 3, 033_scenarios.sql / 034_milestones.sql from Phase 4).
Using 035-037 for Phase 5 instead.

## Features
HRA and LTA optimizer (F20), advance tax calculator (F18), ITR filing readiness
score (F19), financial document vault (F29).
New routes: extensions to /api/tax + new /api/documents.
New pages: /documents + major expansion of existing /tax page.
Depends on: Phase 2 (tax_investments, capital_transactions, /api/tax routes, /tax
page already exist and must remain intact).

## Manual setup required (not done by Claude Code)
In the Supabase dashboard, create a private Storage bucket named
`fintrack-documents` with an RLS policy restricting access to
`documents/{user_id}/*` for the authenticated user. Must be done before P4.
