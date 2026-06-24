# FinTrack Changelog

All notable changes are documented here. Each version describes what was built, why decisions were made, and what files were affected.

---

## [0.11.0] — 2026-06-24 — Financial Plan Builder, 10000x Growth Brief (Phase 0-2), Orphaned-Page Fixes

### Financial Planning

- **Financial Plan Builder** (`/planning`) — a guided plan covering monthly income, risk profile
  (safety/balanced/growth), emergency fund target and current balance, a primary goal, and loan
  payoff inputs. Generates an AI narrative summary (`POST /api/planning/narrative`, cached on the
  plan row) and recalculates projections when underlying financial data drifts
  (`POST /api/planning/recalculate` / `/apply-recalculation`). Migrations `051_financial_plans.sql`,
  `052_financial_plan_expenses_category.sql`.
- The page shipped with zero navigation entries anywhere in the app — reachable only by typing
  the URL directly. Fixed by adding "Financial Plan" to the existing "Plan" group in both
  `Sidebar.tsx` and `BottomNav.tsx`. This is the same orphaned-page pattern found and fixed earlier
  for `/forecast`, `/personality`, and `/salary-intelligence`.

### Growth Brief — Phase 0: Instrumentation

Per `docs/GROWTH_BRIEF_10000X.md` — before any UX changes, instrument the data needed to tell
whether manual entry is friction or auto-import is a trust problem.

- `transactions.source` column (`manual`/`sms`/`pdf_import`/`cams_import`) tagged at every
  creation call site (migration `053_transaction_source.sql`).
- `transaction_deletions` audit log — hard deletes previously left no trace; now logged with
  source before removal (migration `054_transaction_deletions_log.sql`).
- `backend/scripts/source-trust-report.js` — edit/delete rate by source, run manually.

### Growth Brief — Phase 1: Zero-Entry Core Loop (A/B test)

- **SMS Importer** (`frontend/components/transactions/SmsImporter.tsx`) — paste a bank/UPI SMS,
  AI parses it, review-and-edit one row, save. Previously `parseSMS()` existed in `lib/api.ts`
  with zero call sites; this closes that gap. Tags `source: 'sms'`.
- **PDF import duplicate detection** — bulk bank-statement import now flags likely duplicates
  (date+amount+type match against existing transactions) with a badge in the review grid before
  confirming.
- **Treatment-only onboarding import step** — a new step between Theme and Budgets offering
  SMS/PDF/CAMS import, shown only to the `treatment` cohort, with an always-visible
  "skip, I'll add manually" escape hatch. Control cohort's onboarding is unchanged.
- **A/B cohort assignment** — `users.onboarding_variant`, assigned deterministically from a hash
  of the user's email at registration (migration `055_onboarding_variant.sql`) — no feature-flag
  service, and re-registering an unverified account can't reshuffle cohort.
- `backend/scripts/retention-report.js` — 7d/30d return rate by cohort, run manually.

### Growth Brief — Phase 2: Money OS Consolidation

- **Opportunities feed expanded from 8 to 13 detector types** — added `detectForecastWarning`,
  `detectPersonalityInsight`, `detectAdvanceTaxDue` (now reuses `tax.js`'s canonical
  `computeAdvanceTaxEstimate` installment schedule instead of a hardcoded deadline table),
  `detectBehavioralPattern`, `detectSalaryIntelligenceInsight`. Widened `opportunities.type`
  check constraint (migration `056_opportunities_expand_types.sql`). All detectors are
  deterministic — no LLM calls.
- **Daily brief now consumes the opportunities feed** — `getDailyBriefData()` queries the top
  active opportunity the same way the weekly brief already did; `actionOfTheDay` now prioritizes
  it over the previous hardcoded logic.
- **Tax/debt duplication resolved** — `debt.js` now exports `computeCreditUtilization` and
  `computeDtiBreakdown`; `agents.js`'s `fetchDebtCoachData` calls them instead of independently
  recomputing the same DTI/utilization math. (The equivalent tax-side duplication was investigated
  and found not to exist — `agents.js` already reused `tax.js`'s canonical functions.)
- Verified `/forecast`, `/personality`, `/salary-intelligence` had no standalone nav entries before
  concluding there was no nav-cleanup work left to do for them.

### Documentation

- `docs/GROWTH_BRIEF_10000X.md` committed for the first time (was previously untracked).
- Corrected a stale claim in `docs/AI_FEATURES.md`: the Opportunities engine was documented as
  using `aiComplete()`; it has never made an LLM call — every detector is a deterministic query
  against the user's financial data.

---

## [0.10.0] — 2026-06-12 — Major Feature Wave: Health Score, Coach, Notifications, Calendar, NIM

A large batch of features (114 commits since v0.9.0), summarized by theme rather than per-commit.

### Financial Wellness

- **Financial Health Score** — a 0–100 composite score from savings rate, budget adherence,
  goal progress, emergency fund, and credit utilization. New dashboard widget
  (`HealthScoreWidget`) plus a dedicated `/health-score` page with a gauge, trend
  chart, and per-metric breakdown (`lib/healthScore.ts`). Hidden on the dashboard
  for new users with no transaction history.
- **Proactive Financial Coach** — `CoachAlerts` component on the dashboard surfaces
  real-time alerts: budget >85% spent, projected monthly overspend pace, recurring
  bills due within 3 days, low account balances, and goals stalled >30 days.
- **Smart Budget Auto-Adjust** — budgets page now shows a suggestions banner
  (`SuggestionsBanner`) offering rollover of unused budget, a zero-based budgeting
  mode, and recalculation from a 3-month average, plus color-coded per-category
  health chips.
- **Savings Automation Planner** (`/savings-plan`) — guided savings challenges
  (No Eating Out Week, Coffee Challenge, Weekend No-Spend) with auto-savings goal
  projections and localStorage-backed achievement tracking.
- **Regret Score system (Parts A–E)** — weekly `RegretCheckSheet` prompts the user
  to mark transactions >₹200 from the past 7 days as "keep" or "regret"; results
  feed a new `RegretAnalysis` component on the analytics page and the existing
  `/api/ai/regret-patterns` insights.

### Analytics & Calendar

- **Year in Review** (`/year-review`) — annual summary with totals, top category,
  cached spending personality, and three new visualizations:
  - `SankeyFlow` — category-to-merchant money flow diagram
  - `SpendingHeatmap` — calendar-grid daily spending intensity
  - `CategoryTrajectory` — month-by-month trend for top categories
- **Calendar rewrite** (`/calendar`) — added heatmap, recurring-bill overlay, and
  AI forecast view modes with a day-detail sheet (172 → 718 lines).

### Transactions

- **Advanced Search** — `AdvancedSearchBar` adds token-based filtering
  (`amount:`, `category:`, `type:`, `tag:`, `date:`, `notes:`) with date presets
  and localStorage-saved filter views.
- **Bulk Operations** — `BulkOpsPanel` enables multi-select bulk recategorize,
  bulk tag, bulk delete (with confirmation), single-transaction split, and CSV
  export of the selection.

### Notifications

- **In-app notification center + push notifications** — `NotificationBell` /
  `NotificationCenter` components (moved to the home header beside the greeting),
  FCM token registration (`POST/DELETE /api/notifications/register-token`,
  migration `019_fcm_tokens.sql`), and a `notification_log` table
  (migration `020_notification_log.sql`) for server-side dedupe.
- **14 new smart notifications** — inactivity reminders, high-transaction-count
  alerts, an 8pm daily reminder, and budget/goal/bill-due triggers via cron,
  all deduplicated through `notifyOnce()`.

### AI

- **NVIDIA NIM as 4th LLM provider** — see `docs/AI_FEATURES.md` for the full
  provider/model breakdown. 11 AI routes migrated to NIM models; receipt vision
  now tries NIM Llama 3.2 11B Vision before falling back to Gemini.

### Backend Hardening

- Notification dedupe via `notifyOnce()` (atomic, `notification_log` UNIQUE
  constraint), consolidating ~9 duplicated dedupe blocks across
  `index.js`, `transactions.js`, `recurring.js`, and `goals.js`.
- Input validation (amount, type, date, frequency) added to transactions, goals,
  and recurring routes.
- Pagination (`limit`/`offset`) added to `GET /api/transactions` and a
  configurable limit on `/api/transactions/search`.
- CORS allowlist moved to `CORS_ALLOWED_ORIGINS` env var (with fallback).
- New jest + supertest test suite covering auth middleware and core routes.

### Mobile / Android

- Android home-screen widgets (Quick Add + Budget Overview) were built with a
  Capacitor bridge plugin, WorkManager refresh, and JWT sync — then **fully
  removed** in a later commit (`f3c988b`) and are not part of the current app.
- Bottom-nav "More" sheet gained swipe gestures and restored several pages that
  had gone missing from the sheet.
- Fixed a Capacitor SSR bundle break via dynamic import on Android builds.

### New Database Migrations

| File | Description |
|------|-------------|
| `011_one_time_expenses.sql` | One-time expense planning table |
| `012_one_time_expense_items.sql` | Line items for one-time expenses |
| `013_transaction_payment_method.sql` | Payment method column on transactions |
| `014_one_time_expense_transaction_link.sql` | Links one-time expenses to transactions |
| `015_bank_account_balance_as_of.sql` | "Balance as of" tracking for bank accounts |
| `016_credit_cards.sql` | Credit card accounts |
| `017_wallets.sql` | UPI wallet accounts |
| `018_bank_accounts_type_lastfour.sql` | Account type + last-4-digits columns |
| `019_fcm_tokens.sql` | `user_fcm_tokens` table for push notifications |
| `020_notification_log.sql` | `notification_log` table for dedupe |

---

## [0.9.0] — 2026-04-07 — Security Audit, AI Hardening & Missing Routes

This version was a comprehensive audit-and-repair session. Every backend route, auth flow, AI router, and frontend API method was read, cross-referenced against the spec, and either confirmed correct or fixed. The goal was production-readiness: no information leakage, no rate-limit gaps, no missing routes.

### What We Built

**Two missing AI backend routes**

The spec defined `/api/ai/quick-add` and `/api/ai/tax-estimate` but neither existed in `backend/src/routes/ai.js`. Both were implemented from scratch:

- **`POST /api/ai/quick-add`** — accepts a free-text string like "spent 250 on lunch today" and returns structured JSON (`type`, `amount`, `description`, `category`, `date`) using `llama-3.1-8b-instant`. The result is cached per-user for 6 hours. This powers the natural language transaction entry flow on the frontend.

- **`GET /api/ai/tax-estimate`** — queries the user's income transactions for the current Indian financial year (April–March), then asks `llama-4-scout` to compute Old Regime vs New Regime tax liability side-by-side. Returns gross income, per-regime breakdown (standard deduction, 80C, taxable income, tax, cess, total), recommended regime, savings difference, slab breakdown, and 3–5 saving tips. Cached for 6 hours; `?force=true` bypasses cache.

**`frontend/app/tax-estimate/page.tsx`** was created as a full page — prompt screen → loading state → Old vs New regime comparison cards → slab breakdown list → tips → disclaimer. All inline styles, CSS variables only, calls `aiAPI.taxEstimate()`.

**Route aliases for spec alignment**

The spec named routes `/predict` and `/recurring` but the codebase had evolved to `/afford` and `/detect-patterns`. Added aliases so both names work without breaking existing callers.

**OTP brute-force protection**

Previously, OTP verification had no attempt counter — an attacker could keep guessing until expiry. Added a server-side `attempts` column (migration `009_otp_security.sql`). The `verifyOTP()` function now:
1. Reads current attempt count before checking the OTP
2. Rejects immediately if `attempts >= 5` and deletes the OTP row
3. Increments `attempts` on every wrong guess

This works regardless of IP — a determined attacker rotating IPs still hits the same counter.

**Per-user AI rate limiter**

Replaced the global IP-based rate limit on AI routes with a 30-req/hour per-user limiter keyed by JWT user ID. This prevents shared office/VPN IPs from triggering false positives while still protecting the AI endpoints from abuse. Applied via `app.use('/api/ai', aiLimiter, require('./routes/ai'))`.

**Configurable cache TTL**

`getCached()` in `routes/ai.js` previously hardcoded a 6-hour TTL for every route. Made TTL a parameter (`getCached(pool, userId, key, ttlMs)`). Personality profile now caches for 24 hours (it changes slowly), while all other routes remain at 6 hours.

**DB performance indexes** (migration `010_performance_indexes.sql`)

Added six composite indexes covering the most frequent query patterns:
- `(user_id, date DESC)` on transactions — powers all paginated transaction lists
- `(user_id, EXTRACT(MONTH), EXTRACT(YEAR))` on transactions — powers monthly filtering
- `(user_id, month, year)` on budgets — powers budget lookup per month
- `(user_id)` on categories — powers category dropdown
- `(user_id, type)` on transactions — powers income vs expense split queries
- `(user_id, is_active)` on recurring_transactions — powers the cron job active-only filter

**Security hardening in `backend/src/index.js`**

- Global error handler rewritten to never send `err.message` or stack traces to clients — always returns generic `{ error: 'Internal server error' }`
- Body size limit: `express.json({ limit: '10mb' })` — was unlimited, allowing arbitrarily large payloads
- Helmet configured with `contentSecurityPolicy: false, crossOriginEmbedderPolicy: false` for API compatibility
- `express.urlencoded({ extended: true, limit: '10mb' })` added alongside JSON body parser

**Frontend API additions** (`frontend/lib/api.ts`)

- `aiAPI.taxEstimate(force?)` — GET with optional `?force=true`
- `aiAPI.quickAdd(text)` — POST with `{ text }`

### What We Fixed

| Bug | Root Cause | Fix |
|-----|-----------|-----|
| Personality page blank | Stale cache not being invalidated on schema change | Added cache invalidation logic + lowered forecast threshold |
| Forecast page blank | Same stale cache issue | Same fix |
| AI Chat 401 errors | Page was using raw `axios` with wrong localStorage key | Switched to `aiAPI.chat()` from `frontend/lib/api.ts` which uses the correct interceptor |
| AI Chat history always empty | `history: []` hardcoded on line 66 of `ai-chat/page.tsx` | Changed to `history: messages` (state before current message appended) |
| Recurring PUT 500 error | `updated_at=NOW()` included but column doesn't exist in schema | Removed `updated_at` from the SET clause |
| Goals PUT 404 always | Query used table name `goals` — actual table is `savings_goals` | Fixed table name |

### Files Changed
- `backend/src/routes/ai.js` — quick-add, tax-estimate, aliases, 24h personality TTL
- `backend/src/routes/auth.js` — OTP attempt counter
- `backend/src/routes/goals.js` — correct table name in PUT
- `backend/src/routes/recurring.js` — removed `updated_at` from PUT
- `backend/src/utils/ai.js` — added `tax-estimate` route config
- `backend/src/index.js` — rate limiter, body limits, helmet, error handler
- `backend/src/db/migrations/009_otp_security.sql` — `attempts` column
- `backend/src/db/migrations/010_performance_indexes.sql` — 6 composite indexes
- `frontend/app/tax-estimate/page.tsx` — new page
- `frontend/app/ai-chat/page.tsx` — history fix
- `frontend/app/forecast/page.tsx` — cache fix
- `frontend/lib/api.ts` — taxEstimate, quickAdd

---

## [0.8.0] — 2026-04-07 — Missing Features: Fonts, CSS Tokens, Edit UIs, Nav

This version restored seven features that were either missing or broken, identified by diffing the codebase against `DESIGN.md` and navigating every page manually.

### What We Built

**Design system fonts** (`frontend/app/globals.css`, `frontend/app/layout.tsx`)

The app was loading only Sora and DM Sans — the design system specified Cabinet Grotesk, Satoshi, and DM Mono. Replaced the `@import` in `globals.css` with Fontshare (Cabinet Grotesk + Satoshi) and Google Fonts (DM Mono). Added `<link rel="preconnect">` tags in `layout.tsx` for faster font loading. Fixed a follow-up bug where duplicate `@import` lines and wrong preconnect ordering caused FOUC.

**CSS token sync** (`frontend/app/globals.css`)

The `:root` variables had drifted from `DESIGN.md`. Updated `--bg-primary`, `--bg-secondary`, `--bg-card`, `--bg-hover`, `--bg-border`, `--text-primary`, `--text-secondary`, `--text-muted` to match the spec exactly. Also added `--bg-border-strong` as a new token for use in future components.

**Recurring transactions — inline edit** (`backend/src/routes/recurring.js`, `frontend/app/recurring/page.tsx`, `frontend/lib/api.ts`)

There was no way to edit a recurring transaction once created — only toggle active/inactive or delete. Added:
- Backend `PUT /api/recurring/:id` — validates type/amount/description/frequency, updates row, returns updated record
- `recurringAPI.update()` in `api.ts`
- Edit state (`editingId`, `editForm`, `editLoading`, `editError`) in the page
- Pencil icon button on each card that opens an inline edit form pre-filled with current values
- Form submits via `handleEditSubmit`, reloads data on success, shows error inline on failure

**Goals — inline edit** (`backend/src/routes/goals.js`, `frontend/app/goals/page.tsx`, `frontend/lib/api.ts`)

Same pattern as recurring. Added `PUT /api/goals/:id` (updates name, target_amount, deadline, color), `goalsAPI.update()`, and an inline edit form on each goal card with a color picker (GOAL_COLORS pill selector) and deadline date input.

**Budgets — inline edit** (`frontend/app/budgets/page.tsx`)

The backend already upserts budgets via `ON CONFLICT (user_id, category_id, month, year) DO UPDATE`, so no backend change was needed. Added a Pencil icon button on each budget row that reveals an amount input in place of the displayed amount. Saving re-calls `budgetsAPI.create()` with the same `category_id` and new amount — the upsert handles the update cleanly.

**AI Chat navigation** (`frontend/components/layout/BottomNav.tsx`, `frontend/components/layout/Sidebar.tsx`)

The AI Chat page existed but was unreachable from any navigation entry. Added `{ href: '/ai-chat', icon: MessageSquare, label: 'AI Chat' }` to:
- BottomNav's TOOLS section (visible in the More sheet on mobile)
- Sidebar's navItems list (between Personality and Profile on desktop)

### Files Changed
- `frontend/app/globals.css` — font imports, CSS token values
- `frontend/app/layout.tsx` — font preconnect + stylesheet links
- `backend/src/routes/recurring.js` — PUT route
- `backend/src/routes/goals.js` — PUT route
- `frontend/app/recurring/page.tsx` — edit state + form
- `frontend/app/goals/page.tsx` — edit state + form
- `frontend/app/budgets/page.tsx` — edit state + form
- `frontend/components/layout/BottomNav.tsx` — AI Chat entry
- `frontend/components/layout/Sidebar.tsx` — AI Chat entry
- `frontend/lib/api.ts` — recurringAPI.update, goalsAPI.update

---

## [0.7.0] — 2026-04-02 — Design System Document

### What We Built

**`DESIGN.md`** — a full Industrial/Refined aesthetic design system document establishing:
- Color palette with exact hex values for all CSS variables
- Typography hierarchy (Cabinet Grotesk for headings, Satoshi for body, DM Mono for numbers)
- Spacing scale and border radius conventions
- Component patterns for cards, modals, buttons, inputs
- Animation and transition standards

This document became the authoritative source of truth that `CLAUDE.md` now enforces: "Always read DESIGN.md before making any visual or UI decisions."

Added `.worktrees/` and `.gstack/` to `.gitignore`. Fixed a Turbopack/webpack conflict warning in Next.js 16 that appeared in dev console.

---

## [0.6.0] — 2026-03-27 to 2026-03-30 — Bank Accounts, Expense Groups, AI Scale

This was the largest feature sprint — three major feature areas added simultaneously, plus significant AI infrastructure improvements.

### What We Built

**Bank accounts** (`backend/src/routes/accounts.js`, `frontend/components/profile/BankAccountsSection.tsx`)

Users can now manage multiple bank accounts (e.g. HDFC Savings, ICICI Credit Card):
- `GET /api/accounts` — list all accounts for user
- `POST /api/accounts` — create account with name, icon, color, starting balance
- `PATCH /api/accounts/:id` — update account details
- `PATCH /api/accounts/:id/set-default` — set as default account
- `DELETE /api/accounts/:id` — delete account
- New transactions are automatically linked to the default account
- Bank accounts section appears at top of Profile page
- Account balances summary card shown at top of Analytics page
- Read-only balance card on Analytics
- Migration `007_bank_accounts.sql` adds the `bank_accounts` table and `account_id` column on transactions

**Expense groups** (`backend/src/routes/groups.js`, `frontend/app/groups/page.tsx`)

Multi-person expense groups with integrated bill splitting and settlement tracking:
- Groups have a name, emoji, description, optional budget, and members list
- Each group can have splits (who paid, how much, shares per member)
- Settle individual shares; view suggested settlement summary
- Full CRUD: create group, add splits, update splits, settle shares, delete group
- Migration `005_expense_groups.sql` — `expense_groups`, `group_members`, `group_splits`, `group_shares` tables
- Fixed UUID type mismatch in migration (user_id must be UUID not integer)
- Splits edit feature added separately: inline edit on splits page

**Multi-model AI infrastructure** (`backend/src/utils/ai.js`, `backend/src/utils/groq.js`)

Replaced the single-model setup with a unified AI router (`utils/ai.js`) that:
- Maps route keys to specific providers, models, token limits, and temperatures
- Supports automatic fallback chain on 429: groq1 → groq2 → gemini
- Two separate Groq API keys (`GROQ_API_KEY` and `GROQ_API_KEY_2`) used to double the rate limit headroom
- Models distributed by workload: `llama-3.3-70b-versatile` (chat), `llama-4-scout` (reports, salary), `qwen3-32b` (forecast), `gemini-2.0-flash` (vision)
- 6-hour AI response cache in `users.ai_cache` JSONB column (migration `008_ai_cache.sql`)
- Qwen3/DeepSeek `<think>` reasoning tags automatically stripped from responses

**Salary allocation AI** (`backend/src/routes/ai.js`, `frontend/app/analytics/page.tsx`)

`POST /api/ai/salary-allocation` — reads user's income and spending patterns, asks Gemini 2.0 Flash to produce a personalised 50/30/20 allocation plan with category-level recommendations. Cached per-user. Shown as an AI plan card in the Analytics tab.

**Onboarding walkthrough tour** (`frontend/components/ui/WalkthroughTour.tsx`)

Step-by-step tour that runs once after first login, highlighting key sections of the dashboard with a `?` button that can replay it at any time.

**Per-page help sheets** (`frontend/components/ui/PageHelp.tsx`)

Replaced the global floating help FAB with a small `?` icon in each page's header. Clicking it opens a bottom sheet with page-specific guidance (what this page does, how to use each feature). Rendered via `createPortal` to fix fixed positioning issues on mobile.

### What We Fixed

- Salary allocation SQL had a nested aggregate error — rewritten with a CTE
- `saved_amount` column name in savings_goals was wrong in salary-allocation query
- CORS updated for Capacitor APK (Android WebView origin)
- AI chat input scrolls off-screen on mobile keyboard open — fixed to stay above nav
- Filter popover: right-aligned, full-width on mobile, month grid in 3 columns
- Date calendar: full rebuild with dark theme, portal overlay, opens above trigger
- Tax Estimate removed from navigation (feature not ready at this stage) and from AIResponseCard action buttons
- Personality route added to mobile More sheet (was missing)
- Groups page had no AppLayout wrapper — BottomNav was invisible on mobile
- Various modal centering, theme variable, and sidebar collapse fixes

---

## [0.5.0] — 2026-03-26 — Dashboard Redesign + Auth Pages Overhaul

### What We Built

**Redesigned dashboard** (`frontend/app/dashboard/page.tsx`, dashboard components)

Complete dashboard rewrite across two passes:
- First pass: gradient stat tiles, wide hero card with sparkline bar chart and top spending category
- Second pass (mobile): neon line graph in the hero card, top spending row, AI insight chip
- Third pass (desktop): replaced sparkline bars with a crisp SVG neon line chart (fixed viewBox, non-scaling-stroke, y-axis labels)
- `SpendingForecast`, `StatsCards`, `TrendChart`, `CategoryChart`, `RecentTransactions` all updated to match

**New FinTrack brand icon**

Replaced all default Next.js/placeholder icons across the app and Android app assets with the FinTrack brand icon (all mipmap densities: mdpi, hdpi, xhdpi, xxhdpi, xxxhdpi).

**Auth pages redesign** (`frontend/app/(auth)/login/page.tsx`, `register/page.tsx`)

Consistent dark theme across login, register, OTP verify, and onboarding. Added brand wordmark, removed Google OAuth button (unused), made `/register` the default landing page (not `/login`). Onboarding page also restyled to match.

**Transactions filter** (`frontend/app/transactions/page.tsx`)

Month + year filter with a pill grid UI — users tap a month pill and a year dropdown to filter the transaction list. URL params preserved for deep linking.

**Savings rate indicator** (`frontend/components/dashboard/StatsCards.tsx`)

Added a coloured status pill to the savings rate stat card: green if savings rate > 20%, amber if 10–20%, red if below 10%.

### What We Fixed

- Hero card went through many iterations to resolve: layout balance, sparkline bar heights, column alignment, mobile stack order, divider alignment, duplicate cards
- Tooltip amounts showing decimal places (`.toFixed(2)`) — replaced with `Math.round().toLocaleString('en-IN')`
- Calendar popover: portal-based rendering, dark theme background, opens above the trigger (not below)
- Transaction modal centering and inline calendar date picker styles
- Removed dark square artefact from hero card on mobile

---

## [0.4.0] — 2026-03-25 — UI Upgrade Sprint + AI Wave 2

This session ran two parallel tracks: a visual upgrade pass across every page, and a second wave of AI features.

### UI Upgrades

**Skeleton loading screens** (`frontend/components/ui/Skeleton.tsx`)

Every page now shows skeleton placeholders while data loads — cards, titles, rows all have matching skeleton shapes. Prevents layout shift and makes the app feel faster.

**Recharts upgrades** (analytics, dashboard, reports pages)

All line and area charts updated with gradient area fills, smooth animations on mount, and consistent styling. Tooltip formatting fixed to use Indian number formatting.

**Category-colored transaction rows** (`frontend/components/transactions/TransactionList.tsx`)

Each transaction row shows a 3px left border in the category's colour. Makes scanning the list faster — food, transport, salary are visually distinct at a glance.

**Page fade-in transitions + card hover states**

CSS `@keyframes fadeIn` applied to page containers. Cards and list items have subtle `translateY` hover lifts.

**Bento grid dashboard layout**

Dashboard reorganised into a bento grid — different-sized cards arranged in a non-uniform grid instead of a single column stack.

**Dual FAB on mobile** (`frontend/components/ui/FAB.tsx`)

Two floating action buttons: primary (Add Transaction) and secondary (Ask AI). Positioned bottom-right, secondary slightly inset from primary.

**Bottom sheet modals on mobile** (`frontend/components/ui/BottomSheet.tsx`)

Transaction add/edit forms now slide up from the bottom as a bottom sheet on mobile (swipe to dismiss). On desktop they remain as centered modals.

**Swipe gestures on transaction rows** (`frontend/components/ui/SwipeableRow.tsx`)

Swipe left on a transaction to reveal delete. Swipe right to toggle regret flag. Touch-native with velocity-based snap and background colour feedback.

**Conversational AI response cards** (`frontend/components/ui/AIResponseCard.tsx`)

AI responses render in a chat-bubble card with a typing indicator animation. Each card includes contextual action buttons (e.g. "Add Transaction", "View Report") based on the response type.

**Ambient background gradient + hero card glow**

Radial gradient behind the hero card giving it a soft blue glow. Page backgrounds use a very subtle ambient radial gradient in the top-left.

### AI Features Wave 2 (`backend/src/routes/ai.js` — 540 lines added)

Eight new AI endpoints:

| Route | What it does |
|-------|-------------|
| `GET /api/ai/salary-intelligence` | Detects salary day, analyses income patterns, gives salary health score |
| `POST /api/ai/personality` | Builds a financial personality profile (Saver/Spender/Investor archetype) with behavioural observations |
| `GET /api/ai/regret-patterns` | Analyses transactions flagged as regrets, finds patterns and triggers |
| `POST /api/ai/life-event` | Given an event (wedding, home, education) + target amount + date, produces a month-by-month savings plan |
| `GET /api/ai/forecast-calendar` | 30-day day-by-day spending forecast based on patterns — powers the calendar page |
| `POST /api/ai/health-report` | Full financial health report card: income, spending, savings, debt indicators, score, recommendations |
| `GET /api/ai/detect-patterns` | Detects recurring-like transactions that aren't marked recurring yet |
| `POST /api/ai/parse-split` | Parses a text description of a group expense into structured split shares |

DB migrations added:
- `004_regret_score.sql` — adds `is_regret` boolean to transactions
- `006_life_events.sql` — extends savings goals with life event fields

The regret toggle was also wired into the transactions route (`PATCH /api/transactions/:id/regret`) and shown in the transaction list as a toggle.

**Hybrid Groq + Gemini provider** (`backend/src/utils/gemini.js`)

Added Gemini 2.0 Flash as a fallback/secondary provider alongside Groq, routing vision tasks (receipt OCR) exclusively to Gemini and text tasks to Groq. This was later formalised into the full `utils/ai.js` router in v0.6.0.

**Smart category ordering** (`backend/src/routes/categories.js`)

Categories returned in descending order of usage frequency (most-used first) rather than alphabetically. Makes the category dropdown much faster to use for repeat transactions.

### What We Fixed

- Quick Add: parse result now populates the add form instead of opening the edit modal
- Quick Add: Groq integration working, improved prompt, loading state added
- Quick Add: crash in Android Capacitor WebView fixed
- AI chat Groq integration repaired + desktop FAB shown
- Mobile transactions UI overhauled: cleaner layout, better spacing
- Swipe backgrounds, rupee icon, regret label, avatar icon corrected on mobile
- `useSearchParams` wrapped in Suspense boundary (Next.js requirement)

---

## [0.3.0] — 2026-03-24 — AI Wave 1

### What We Built

**`backend/src/routes/ai.js`** created (318 lines) with the first batch of AI endpoints:

| Route | What it does |
|-------|-------------|
| `POST /api/ai/report` | Monthly narrative summary of spending — prose paragraph + highlights |
| `POST /api/ai/chat` | Financial advisor chat — user message + history → contextual AI reply |
| `POST /api/ai/afford` | "Can I afford X?" — checks against budget and savings, gives a verdict |
| `POST /api/ai/parse-sms` | Parses a bank SMS into transaction fields (amount, type, merchant, date) |
| `GET /api/ai/detect-patterns` | Detects potential recurring transactions from history |
| `POST /api/ai/parse-image` | Receipt OCR via Gemini 2.0 Flash — returns itemised list + total |

**`frontend/app/ai-chat/page.tsx`** — full chat interface with message history, typing indicator, and markdown rendering.

**`frontend/app/splits/page.tsx`** — expense split tracker: enter description, total amount, participant names; app calculates equal shares. Settlement tracking per participant.

**`backend/src/routes/splits.js`** — CRUD for splits, settlement toggle per participant.

**`backend/src/db/migrations/003_splits.sql`** — `splits` and `split_participants` tables.

**Voice input** — microphone button in the Quick Add modal using Web Speech API to dictate transaction descriptions.

**Transaction modal enhancements** — SMS parse button added, receipt image upload (OCR) added, Quick Add natural language input added. All three flow into the same add form.

**`backend/src/utils/gemini.js`** created — `getVisionModel()` initialises Gemini 2.0 Flash for image/vision tasks. This file remains the authoritative Gemini initialiser in all subsequent versions.

---

## [0.2.0] — 2026-03-24 — Email OTP Auth + Full UI Overhaul

### What We Built

**Email OTP authentication** (`backend/src/routes/auth.js`, `backend/src/db/migrations/002_otp_verifications.sql`)

The app previously had simple password-only registration. Added a full OTP flow:
- Register → send OTP email → verify OTP → account activated
- Forgot password → send OTP → verify → set new password
- OTP table: email, type (`register` / `reset_password`), code (6 digits), `expires_at` (10 minutes), resend cooldown (60 seconds)
- Email provider evolved in this session: Nodemailer → Resend → Brevo REST API. Brevo's SDK had a bug so we switched to a direct `fetch()` call against the Brevo SMTP API.

**Complete UI overhaul** (`frontend/app/**`, all components) — 7 phases:
1. Dark theme foundation — CSS variables, `data-theme` attribute, theme toggle
2. Component library — `Button`, `Input`, `Modal`, `Skeleton` with consistent sizing and variants
3. Navigation — Sidebar (desktop) and BottomNav (mobile) with active state highlighting
4. Dashboard — stat cards, category chart, recent transactions, spending forecast
5. Forms — transaction modal, budget/goal create forms, all with dark inputs
6. Pages — analytics charts (Recharts), recurring list, goals progress bars, reports date range picker
7. Onboarding — 3-step onboarding (create categories → budgets → first transaction) with inline budget amount editing

**PWA support** (`frontend/public/manifest.json`, `frontend/public/sw.js`, `frontend/next.config.ts`)

Added `@ducanh2912/next-pwa`:
- Web App Manifest: name "FinTrack", theme colour, display standalone
- Service worker: pre-caches static assets, runtime caches API responses
- iOS meta tags: `apple-mobile-web-app-capable`, splash screens, touch icons
- "Add to home screen" install banner for Android

**Vercel Analytics** — `@vercel/analytics` added to `layout.tsx`.

**Capacitor Android** — Pointed WebView at the Vercel production URL so the APK always reflects the latest deployment without a rebuild. CORS configured to allow Capacitor origin.

### What We Fixed
- Supabase required SSL — added `ssl: { rejectUnauthorized: false }` to pool config
- Mobile nav bottom tabs were overlapping page content — fixed padding
- CORS missing for Capacitor APK requests
- Theme toggle moved from More sheet to Settings page only

---

## [0.1.0] — 2026-03-24 — Initial Build

### What We Built

The initial commit established the entire full-stack scaffold — 68 files, 13,561 lines.

**Backend** (`backend/src/`)

Express.js server with:
- `authMiddleware` — JWT verification, attaches `req.user` to every protected request
- `pool.js` — PostgreSQL connection pool via `pg`, connects to Supabase using `DATABASE_URL`
- All routes protected by `router.use(authMiddleware)` except `/api/auth/register` and `/api/auth/login`

Routes:
- `auth.js` — register (hash password with bcrypt), login (verify + sign JWT), `/me` endpoint
- `transactions.js` — CRUD, type filter, month/year filter, search by description, earliest-transaction lookup
- `categories.js` — CRUD, default categories seeded on first register (Food, Transport, Shopping, Bills, Entertainment, Health, Salary)
- `budgets.js` — create/upsert by month+year+category, delete, spending progress calculated against transactions
- `goals.js` — CRUD savings goals, `PATCH /:id/funds` to add money toward a goal
- `analytics.js` — monthly summary (income/expense/net), category breakdown, 3-month trend, yearly bar data, 3-month spending forecast
- `profile.js` — get/update profile (name, currency, avatar), change password
- `recurring.js` — CRUD recurring transactions, `POST /process` triggers the cron job manually, active/inactive toggle

**DB schema** (`001_initial_schema.sql`)

Tables: `users`, `transactions`, `categories`, `budgets`, `savings_goals`, `recurring_transactions`. All foreign-keyed to `users.id`. UUIDs for all primary keys. Parameterized queries throughout — no string interpolation.

**Frontend** (`frontend/`)

Next.js 16 App Router with `output: 'export'` for static Vercel deployment. TypeScript throughout.

- `lib/api.ts` — Axios instance with Bearer token interceptor, 401 redirect to `/login`
- `store/authStore.ts` — Zustand store: `user`, `token`, `isLoading`, `login()`, `logout()`, `loadFromStorage()`
- `store/themeStore.ts` — Zustand store: `theme` (dark/light/pitch), `setTheme()`, persisted to localStorage

Pages built in the initial commit:
- `/login`, `/register` — auth forms
- `/dashboard` — stat cards, category pie chart, recent transactions, spending forecast card
- `/transactions` — list with delete, no edit yet
- `/budgets` — create + delete, progress bars
- `/goals` — create + delete + add funds
- `/analytics` — monthly summary, trend chart, yearly bar chart, forecast section
- `/recurring` — list, create, delete, active toggle
- `/reports` — custom date range with CSV download
- `/profile` — name, email, currency, password change
- `/onboarding` — 3-step wizard
- `/calendar` — monthly calendar view of transactions

Components: `AppLayout`, `Sidebar`, `BottomNav`, `GlobalSearch`, `TransactionModal`, `TransactionList`, `Button`, `Input`, `ThemeToggle`, dashboard widgets.

---

## Migration History

| File | Introduced | Description |
|------|-----------|-------------|
| `001_initial_schema.sql` | v0.1.0 | Core tables: users, transactions, categories, budgets, savings_goals, recurring_transactions |
| `002_otp_verifications.sql` | v0.2.0 | OTP table for email verification and password reset |
| `003_splits.sql` | v0.3.0 | splits and split_participants tables |
| `004_regret_score.sql` | v0.4.0 | `is_regret` boolean on transactions |
| `005_expense_groups.sql` | v0.6.0 | expense_groups, group_members, group_splits, group_shares |
| `006_life_events.sql` | v0.4.0 | Life event fields on savings_goals |
| `007_bank_accounts.sql` | v0.6.0 | bank_accounts table, account_id on transactions |
| `008_ai_cache.sql` | v0.6.0 | `users.ai_cache JSONB` column for 6-hour AI response caching |
| `009_otp_security.sql` | v0.9.0 | `otp_verifications.attempts` column for brute-force protection |
| `010_performance_indexes.sql` | v0.9.0 | 6 composite indexes for high-frequency query patterns |
