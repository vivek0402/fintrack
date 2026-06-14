# Prompts Log

## Prompt 0 — Task setup
Created /tasks folder and todo.md for NIM migration.
Status: Complete.

## Prompt 1: NIM provider migration
Status: Complete.

**Summary:** Integrated NVIDIA NIM as a 4th LLM provider in `backend/src/utils/ai.js`:
- Added `nimClient` (using the `openai` SDK, newly installed — `groq-sdk` failed against NIM's gateway with a 404).
- Added 5 new MODELS constants (DEEPSEEK_V4_FLASH, MINIMAX_M27, NEMOTRON_49B, LLAMA_3B, LLAMA_VISION_11B).
- Added `nim` branch to `executeOnProvider` with an explicit `NVIDIA_API_KEY` guard.
- Added `nim: ['groq1', 'gemini']` to FALLBACK_CHAIN, fixed a pre-existing fallback-model bug so nim→groq1 doesn't leak NIM model names to Groq.
- Migrated 11 routes (recurring, afford, tax-estimate, salary-allocation, salary-intelligence, health-report, life-event, report, personality, regret-patterns, forecast-insight) to NIM. Left `chat`, `parse-sms`, `quick-add`, `parse-split`, `forecast`, `forecast-calendar` untouched.
- Swapped `getVisionModel()` in `gemini.js` to call NIM Llama 3.2 11B Vision with a Gemini fallback, preserving the existing `generateContent(parts) -> {response:{text()}}` contract used by `routes/ai.js`.
- Added `NVIDIA_API_KEY` to `backend/.env`.
- Smoke-tested all new NIM models directly and via `aiComplete()`; verified fallback fires when the key is missing. `npm test` — 4 suites / 22 tests passing.
- See `tasks/lessons.md` for gotchas (groq-sdk vs openai SDK, reasoning-model token budgets, fallback-model fix).

## P0: Task tracking initialized for Phase 1.

## P1: Created migrations 021-024. Tables: investments, investment_transactions, net_worth_snapshots, pdf_import_jobs.

## P2: investments.js with 5 endpoints. Net worth analytics. Investment ratio. Tests passing.

## P3: pdfImport route created. pdf-parse + AI extraction + confirm bulk insert + history endpoint.

## P4: /investments page with portfolio summary, grouped holdings list, add/update/delete modals.

## P5: BankStatementImporter multi-step modal. Upload, parse, review, success flow.

## P6: /net-worth page, NetWorthWidget, investment ratio stat tile, nav links.

## Phase 1 complete. All 7 prompts executed. Features live: investment tracker, PDF importer, net worth page, dashboard widgets, investment ratio metric.

## P0: Phase 2 task tracking initialized.

## P1: Created migrations 025-027. Tables: cams_import_jobs (CAMS/CAS statement import), tax_deductions (80C/80D/etc per financial year), capital_gains_records (STCG/LTCG per sell transaction). Applied to DB successfully.

## P2: CAMS import route created. PDF extraction + AI parsing + upsert to investments table.

## P3: Wealth velocity and asset allocation analytics endpoints added.

## P4: tax.js route file created. 80C CRUD, capital gains computation, FY utility function. Tests passing.

## P5: CamsImporter multi-step modal created. /investments page has Import from CAMS button.

## P6: WealthVelocityWidget, AssetAllocationWidget, /wealth-intelligence page. Dashboard updated.

## P7: /tax page created — 80C Tracker (progress bar, stat tiles, entries table, add/edit/delete, auto-add candidates) and Capital Gains Summary (stat tiles, FIFO transactions table, info note, add-transaction page + backend route). "Tax" nav entry added to Sidebar and BottomNav.

## Phase 2 complete. CAMS import, wealth velocity, asset allocation, 80C tracker, capital gains — all live at v0.12.

## P0: Phase 3 (v0.13) task tracking initialized. Note: spec's migration numbers 028-029 collide with Phase 2 migrations (028/029/030 already used) — Phase 3 will use 031-032 instead.

## P1: Migrations 031-032 created. Tables: loans, loan_prepayments. Applied to DB and verified — correct column types/constraints, CASCADE FK from loan_prepayments.loan_id to loans.id. analytics.js GET /networth updated to sum real loans.outstanding_balance (was hardcoded 0).

## P2: loans.js created — reusable amortization engine (EMI derivation, monthly schedule generation with prepayment application, invalid-config guard against infinite loops), full CRUD (GET/POST/PATCH/DELETE, soft-delete via is_active), GET /:id/amortization, POST/GET /:id/prepayments with before/after schedule diff for months_saved and interest_saved. loanAPI added to frontend api.ts. Tests passing (7 suites/43 tests).

## P3: debt.js created. Extracted amortization engine into utils/amortization.js (shared between loans.js and debt.js). GET /payoff-optimizer runs a true month-by-month cascade simulation for avalanche (highest rate first) and snowball (smallest balance first) strategies, with freed-up EMIs rolling into the next target loan, compared against an independent-loans baseline. GET /prepayment-impact returns months/interest saved, prepayment penalty, and net savings. GET /credit-utilization classifies per-card and aggregate utilization (optimal/moderate/high/critical) with a paydown recommendation. GET /dti computes debt-to-income from 3-month average income, loan EMIs, and 5% card minimums (excellent/good/moderate/risky). debtAPI added to frontend api.ts. Tests passing (7 suites/43 tests).

## P4: /loans page with lazy amortization, prepayment logging, add/edit modals.
