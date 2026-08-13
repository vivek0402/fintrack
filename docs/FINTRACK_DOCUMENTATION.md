# FinTrack — Project Documentation

**Last Updated:** 2026-06-24 (current main branch — post v0.10.0, plus the Financial Plan Builder and 10000x Growth Brief Phase 0-2 work below)

---

## Architecture Overview

- **Frontend:** Next.js 16 (App Router), TypeScript, Zustand, Axios, Recharts, Capacitor Android
- **Backend:** Express.js, PostgreSQL (Supabase Transaction Pooler port 6543), JWT auth
- **AI Providers:** Groq (GPT_OSS_120B, GPT_OSS_20B, QWEN27B), NVIDIA NIM (deepseek-v4-flash, minimax-m2.7, nemotron-49b, llama-3.2-3b/11b-vision), Gemini 2.0 Flash (vision + fallback)
- **Storage:** Supabase Storage bucket (`fintrack-documents`) for the document vault
- **Push:** Firebase Cloud Messaging (FCM) for Android push notifications
- **Deploy:** Vercel (frontend), Render/Railway (backend)

---

## Completed Features

### Core Finance
- [x] User authentication (register → OTP verify → login)
- [x] Transactions (create, read, update, delete, regret toggle, pagination, payment method)
- [x] Advanced search (token-based filters: `amount:`, `category:`, `type:`, `tag:`, `date:`, `notes:` + saved filter views)
- [x] Bulk operations (recategorize, tag, delete, split, CSV export of selection)
- [x] Categories (CRUD, default categories seeded on register)
- [x] Budgets (create/upsert, delete, spending progress)
- [x] Smart Budget Auto-Adjust (rollover, zero-based mode, 3-month recalculation, health chips)
- [x] Analytics (monthly summary, trends, yearly, forecast, Year in Review, Sankey flow, spending heatmap, category trajectory)
- [x] Recurring transactions (cron job processes daily)
- [x] One-time expense planning
- [x] Savings goals (CRUD, fund allocation)
- [x] Savings Automation Planner (guided challenges + goal projections)
- [x] Financial Health Score (composite score, dashboard widget + dedicated `/health-score` page)
- [x] Proactive Financial Coach (real-time dashboard alerts for budget, pace, bills, balance, goals)
- [x] Expense splits (group split tracking)
- [x] Expense groups (multi-person group expenses)
- [x] Bank accounts, credit cards, and wallets (multiple accounts, default selection)
- [x] Net Worth snapshots (`/net-worth` page with MoM velocity tracking)
- [x] Custom date range reports (CSV export)
- [x] In-app notification center + push notifications (FCM), 14 smart reminder types with server-side dedupe
- [x] PDF bank statement import (AI-powered extraction from uploaded bank statement PDF)
- [x] Regret Score system (weekly check sheet + analytics + AI patterns)

### Investments
- [x] Investment portfolio tracker (mutual funds, stocks, FDs, PPF, NPS, gold, crypto, other)
- [x] Unrealized gain/loss computed from purchase price vs current NAV
- [x] Portfolio summary with totals and asset-type groupings
- [x] Investment transactions (buy/sell/dividend/SIP per holding)
- [x] CAMS mutual fund import (parse CAMS CAS PDF to import holdings)
- [x] Wealth Intelligence (`/wealth-intelligence`): MoM net worth trend + asset allocation vs recommended

### Loans & Debt Intelligence
- [x] Loan tracker (home, car, personal, student) with full amortization schedule
- [x] EMI calculator and prepayment simulation
- [x] Prepayment recording + impact analysis (months saved, interest saved)
- [x] Debt payoff optimizer: Avalanche / Snowball / Cascade strategies with monthly plan
- [x] Credit card utilization analysis (per-card + aggregate)
- [x] Debt-to-income (DTI) ratio computed from current income + active EMIs
- [x] Loan prepayments history

### Tax Center (India)
- [x] Tax profile (salary, HRA, employer PF, city type, regime preference per financial year)
- [x] Section 80C deduction tracker (PPF, ELSS, EPF, LI, NSC, FD, NPS, home loan, tuition) with ₹1.5L cap
- [x] Capital gains tracking (equity, debt, property) with STCG/LTCG computation
- [x] Advance tax payments (quarterly records, challan numbers)
- [x] Old vs New regime comparison (slab breakdown, recommended choice, savings tips)
- [x] ITR readiness checklist (progress tracking for filing)
- [x] HRA exemption estimate
- [x] LTA eligibility estimate
- [x] AI-powered quick tax estimate (`/tax-estimate`) — AI narrates the comparison

### Financial Planning
- [x] Financial Plan Builder (`/planning`) — guided plan covering monthly income, risk profile, emergency fund target/current balance, a primary goal, and loan payoff inputs; AI-generated narrative; recalculates on data drift
- [x] FIRE calculator (corpus needed, years-to-FIRE, step-up + extra-payment scenarios, portfolio projection)
- [x] SIP calculator (goal-based + growth-based, lumpsum alternative, wealth ratio)
- [x] 12-month cash flow forecast (income, expenses, EMIs, savings)
- [x] Financial scenario modeling (`/scenarios`): SIP compounding, new loan impact, expense cut, salary raise
- [x] Saved scenarios (persist + reload past simulations)

### Milestones
- [x] Hierarchical financial milestones (create sub-milestones with parent links)
- [x] Feasibility check (monthly savings needed, on-track flag based on 3-month avg savings)
- [x] Progress tracking (current amount vs target, status transitions)
- [x] Priority-ordered milestone list

### Documents Vault
- [x] Upload financial documents (Form 16, ITR, salary slips, bank statements, insurance, investment proofs, advance tax challans, rent receipts)
- [x] Supabase Storage backend (private bucket, signed download URLs on demand)
- [x] Financial year tagging and filtering
- [x] Formats: PDF, JPG, PNG, XLSX (up to 20MB)

### AI Features

See `docs/AI_FEATURES.md` for the complete provider/model/endpoint map and fallback details.

| Route | Method | Feature | Model / Provider |
|-------|--------|---------|-----------------|
| `/api/ai/chat` | POST | AI Finance Chat | openai/gpt-oss-120b (groq1) |
| `/api/ai/report` | POST | Monthly narrative report | minimax-m2.7 (nim) |
| `/api/ai/afford` | POST | "Can I afford this?" | deepseek-v4-flash (nim) |
| `/api/ai/predict` | POST | Alias for /afford | deepseek-v4-flash (nim) |
| `/api/ai/parse-sms` | POST | Bank SMS parser | openai/gpt-oss-20b (groq1) |
| `/api/ai/quick-add` | POST | Natural language quick add | openai/gpt-oss-20b (groq2) |
| `/api/ai/parse-image` | POST | Receipt OCR | llama-3.2-11b-vision (nim) / Gemini fallback |
| `/api/ai/parse-split` | POST | Split text parser | openai/gpt-oss-20b (groq1) |
| `/api/ai/detect-patterns` | GET | Recurring pattern detection | deepseek-v4-flash (nim) |
| `/api/ai/recurring` | GET | Alias for /detect-patterns | deepseek-v4-flash (nim) |
| `/api/ai/salary-intelligence` | GET | Salary day analysis | deepseek-v4-flash (nim) |
| `/api/ai/personality` | POST | Financial personality profile | nemotron-super-49b (nim) |
| `/api/ai/tax-estimate` | GET | Indian income tax estimate (AI narration) | deepseek-v4-flash (nim) |
| `/api/ai/regret-patterns` | GET | Regret spending analysis | llama-3.2-3b (nim) |
| `/api/ai/life-event` | POST | Life event savings plan | minimax-m2.7 (nim) |
| `/api/ai/forecast-calendar` | GET | 30-day spending forecast + AI insight | llama-3.2-3b (nim) |
| `/api/ai/health-report` | POST | Financial health report card | minimax-m2.7 (nim) |
| `/api/ai/salary-allocation` | POST | 50/30/20 allocation plan | deepseek-v4-flash (nim) |
| `/api/ai/agent/message` | POST | Specialized domain agent chat | openai/gpt-oss-120b (groq1) |
| `/api/ai/opportunities/detect` | POST | Financial opportunity detection (13 types) | rule-based, no LLM |
| `/api/planning/narrative` | POST | Financial plan AI narrative | deepseek-v4-flash (nim) |
| `/api/import/bank-statement` | POST | PDF bank statement extraction (with duplicate flagging) | openai/gpt-oss-20b (groq1) |

**4 Specialized Agents** (debt_coach, investment_advisor, tax_planner, budget_master) with persistent `agent_conversations` history.

### AI Infrastructure
- [x] Multi-provider routing (`utils/ai.js`) — Groq, Gemini, and NVIDIA NIM
- [x] Fallback chains: `groq1`→`groq2`→`gemini`, `groq2`→`groq1`→`gemini`, `gemini`→`groq1`→`groq2`, `nim`→`groq1`→`gemini`
- [x] 429 rate limit detection + automatic provider switching
- [x] Qwen3/DeepSeek `<think>` tag stripping from all responses
- [x] 6-hour AI response cache (per-user, per-route) in `users.ai_cache` JSONB
- [x] 24-hour cache for personality profile
- [x] JSON fence stripping (` ```json ``` ` → clean JSON) on all responses
- [x] 30 req/hour per-user rate limit on all AI endpoints (keyed by JWT user ID)

### PWA / Mobile
- [x] Capacitor Android APK wrapping the Next.js PWA
- [x] Bottom navigation + collapsible sidebar
- [x] Dark / Light themes via CSS custom properties (`data-theme` on `<html>`)
- [x] FCM push notifications registered via `POST /api/notifications/register-token`

---

## Security Measures

- **Auth:** JWT (HS256), expiry checked by `jsonwebtoken` verify
- **Rate limiting:** 200 req/15min global, 30 req/15min auth, 30 req/hour AI (per user by JWT ID), 10 req/10min OTP
- **OTP:** 10-minute expiry, 60-second resend cooldown, 5-attempt brute-force lockout (server-side counter)
- **Passwords:** bcrypt (10 rounds)
- **CORS:** Allowlist only via `CORS_ALLOWED_ORIGINS` env var (no wildcard)
- **Helmet:** Enabled (`contentSecurityPolicy: false` for API compatibility, HSTS enforced)
- **SQL:** All parameterized queries (`$1, $2, …`) — zero string interpolation
- **Error responses:** Global handler returns generic `{ error: 'Internal server error' }` — no stack traces
- **Secrets:** All loaded from environment variables, never hardcoded
- **Input validation:** `utils/validation.js` validates amounts, dates, enums at route level
- **File uploads:** Memory-only (never written to disk), 10MB general / 20MB documents
- **Supabase Storage:** Documents stored in a private bucket; only signed URLs served to clients

---

## Database Migrations

| File | Description |
|------|-------------|
| `001_initial_schema.sql` | Core tables (users, transactions, categories, budgets, goals) |
| `002_otp_verifications.sql` | OTP table |
| `003_splits.sql` | Expense splits |
| `004_regret_score.sql` | Transaction regret flag |
| `005_expense_groups.sql` | Multi-person groups |
| `006_life_events.sql` | Life event savings goals extension |
| `007_bank_accounts.sql` | Multiple bank accounts |
| `008_ai_cache.sql` | `users.ai_cache JSONB` column |
| `009_otp_security.sql` | `otp_verifications.attempts` column (brute-force protection) |
| `010_performance_indexes.sql` | Composite indexes for common query patterns |
| `011_one_time_expenses.sql` | One-time expense planning table |
| `012_one_time_expense_items.sql` | Line items for one-time expenses |
| `013_transaction_payment_method.sql` | Payment method column on transactions |
| `014_one_time_expense_transaction_link.sql` | Links one-time expenses to transactions |
| `015_bank_account_balance_as_of.sql` | `balance_as_of` tracking for bank accounts |
| `016_credit_cards.sql` | Credit card accounts |
| `017_wallets.sql` | UPI wallet accounts |
| `018_bank_accounts_type_lastfour.sql` | Account type + last-4-digits columns |
| `019_fcm_tokens.sql` | `user_fcm_tokens` for push notifications |
| `020_notification_log.sql` | `notification_log` for server-side dedup |
| `021_investments.sql` | Investment portfolio table |
| `022_investment_transactions.sql` | Per-investment transaction log |
| `023_net_worth_snapshots.sql` | Monthly net worth snapshots |
| `024_pdf_import_jobs.sql` | Bank statement PDF import job tracking |
| `025_cams_import_jobs.sql` | CAMS mutual fund import job tracking |
| `026_tax_deductions.sql` | Section 80C deduction records |
| `027_capital_gains_records.sql` | Capital gains (STCG/LTCG) records |
| `028_cams_import_jobs_holdings_found.sql` | Holdings-found count column on CAMS jobs |
| `029_tax_investments.sql` | Tax-specific investment records |
| `030_capital_transactions.sql` | Capital asset transactions |
| `031_loans.sql` | Loan tracker table |
| `032_loan_prepayments.sql` | Loan prepayment history |
| `033_scenarios.sql` | Saved financial scenarios |
| `034_milestones.sql` | Financial life milestones |
| `035_tax_profiles.sql` | User tax profile (salary, HRA, regime preference) |
| `036_advance_tax_payments.sql` | Quarterly advance tax payments |
| `037_documents.sql` | Financial document vault metadata |
| `038_agent_conversations.sql` | AI agent conversation history |
| `039_opportunities.sql` | AI-detected financial opportunities |
| `040_briefings.sql` | Weekly financial briefings table |
| `041_ai_report_cache.sql` | Dedicated AI report cache table |
| `042_daily_briefings.sql` | Daily financial briefings table |
| `043_daily_briefings_updated_at.sql` | `updated_at` column on daily briefings |
| `044_daily_briefings_refresh_log.sql` | Refresh log array on daily briefings |
| `045_agent_conversations_general_type.sql` | Widens agent type check to include `general` |
| `046_categories_investment_flag.sql` | `is_investment_category` flag on categories |
| `047_investments_market_data_columns.sql` | Scheme code + price source columns for live NAV updates |
| `048_investments_unique_scheme_code.sql` | Prevents duplicate mutual fund holdings |
| `049_notifications.sql` | In-app notification feed (server-synced, replaces localStorage-only bell) |
| `050_opportunities_unique_active_type.sql` | Partial unique index backing atomic opportunity upsert |
| `051_financial_plans.sql` | `financial_plans` + `financial_plan_expenses` tables (Financial Plan Builder) |
| `052_financial_plan_expenses_category.sql` | `category_id` column on financial plan expenses |
| `053_transaction_source.sql` | `transactions.source` column (manual/sms/pdf_import/cams_import) |
| `054_transaction_deletions_log.sql` | `transaction_deletions` audit table |
| `055_onboarding_variant.sql` | `users.onboarding_variant` — deterministic A/B cohort for import-first onboarding |
| `056_opportunities_expand_types.sql` | Widens `opportunities.type` to 13 detector types |

---

## Environment Variables

### Backend
```
DATABASE_URL=          # Supabase Transaction Pooler (port 6543, ?pgbouncer=true)
JWT_SECRET=            # 64-char random string — MUST be rotated from any default
JWT_EXPIRES_IN=7d

# AI providers
GROQ_API_KEY=          # Primary Groq key (chat, parse-sms, parse-split)
GROQ_API_KEY_2=        # Secondary Groq key (quick-add, load-sharing, fallback)
GEMINI_API_KEY=        # Google Gemini (vision fallback + non-NIM fallback)
NVIDIA_API_KEY=        # NVIDIA NIM (primary for 11 AI routes + receipt vision; optional — falls back)

# Email (OTP)
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
EMAIL_FROM=

# Supabase Storage (required for document vault)
SUPABASE_URL=          # https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=  # service_role key (not anon)

# Firebase (optional — push notifications)
FIREBASE_SERVICE_ACCOUNT_KEY=  # JSON string of the service account

# CORS
CORS_ALLOWED_ORIGINS=  # Comma-separated: https://your-frontend.vercel.app,capacitor://localhost
NODE_ENV=production
```

### Frontend
```
NEXT_PUBLIC_API_URL=   # https://your-backend.onrender.com
```

---

## AI Routing Architecture

```
Request → aiComplete(routeKey, messages)
    → lookup ROUTES[routeKey] (provider, model, maxTokens, temp)
    → try primary provider
        ├─ success → stripThinkTags(result) → return
        └─ 429/rate-limit → try FALLBACK_CHAIN[provider][0]
            ├─ success → log fallback → return
            └─ 429 → try FALLBACK_CHAIN[provider][1]
                ├─ success → return
                └─ all exhausted → throw last error
```

Fallback chains:
- `groq1` → `groq2` → `gemini`
- `groq2` → `groq1` → `gemini`
- `gemini` → `groq1` → `groq2`
- `nim` → `groq1` → `gemini` (also used if `NVIDIA_API_KEY` is unset or the NIM call errors)

---

## Lessons Learned

- **getCached TTL should be parameterised** — personality changes slowly (24h), tax estimate can be stale for 6h; made `getCached(pool, userId, key, ttlMs)` configurable.
- **Route aliases prevent spec drift** — spec named `/predict` and `/recurring`; code evolved to `/afford` and `/detect-patterns`. Added aliases so both names work.
- **AI rate limiter must be per-user, not per-IP** — shared office/VPN IPs trigger false positives on per-IP. JWT user ID as key is more accurate.
- **OTP brute-force requires server-side counting** — IP-level rate limiting alone isn't sufficient; `attempts` counter invalidates OTP after 5 wrong guesses regardless of IP.
- **Supabase Storage requires `service_role` key** — `anon` key cannot write to buckets server-side; use `SUPABASE_SERVICE_ROLE_KEY` in the backend only (never expose to frontend).
- **Amortization edge cases** — zero-interest loans and loans with `emi_amount` already set need explicit handling; the `amortization.js` util returns `{ invalid: true }` for degenerate inputs.
- **Tax computation is regime-specific** — Old regime has deductions (80C, HRA, standard deduction), New regime has slabs only; the `taxComputation.js` module handles both and returns side-by-side results.
- **Canonical-function-export pattern scales beyond tax** — `tax.js` already exported its computation functions for `agents.js` to reuse instead of recomputing; `debt.js` now does the same (`computeCreditUtilization`, `computeDtiBreakdown`), eliminating duplicated DTI/utilization math that had drifted between the standalone `/debt-intelligence` page and the `debt_coach` agent.
- **Orphaned pages are a recurring failure mode, not a one-off** — `/forecast`, `/personality`, `/salary-intelligence`, and `/planning` were each fully built (backend route + frontend page) but never linked from any nav component. Worth a periodic audit: grep every `app/<route>/page.tsx` against `Sidebar.tsx`/`BottomNav.tsx` for a matching `href`.
