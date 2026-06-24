# FinTrack — AI-Powered Personal Finance

> A production-grade personal finance application with real-time AI insights, multi-account tracking, investment portfolio management, Indian tax planning, debt intelligence, FIRE simulation, and a premium AMOLED-first design system.

---

## Table of Contents

- [Overview](#overview)
- [Live Demo](#live-demo)
- [Feature Set](#feature-set)
- [Architecture](#architecture)
- [AI System](#ai-system)
- [Tech Stack](#tech-stack)
- [Database Schema](#database-schema)
- [API Reference](#api-reference)
- [Design System](#design-system)
- [Mobile Support](#mobile-support)
- [Security](#security)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Project Structure](#project-structure)

---

## Overview

FinTrack is a full-stack personal finance tracker built for users who take their money seriously. It goes beyond basic budgeting — it ingests your transactions, tracks your investments, plans your debt payoff, runs FIRE projections, handles Indian tax compliance, and gives you an AI co-pilot you can actually ask questions in plain English.

**Who it's for:** Individuals who want surgical clarity over their complete financial picture — not another pastel dashboard full of pie charts.

**Design philosophy:** Cold obsidian surfaces, tabular financial numbers, data that feels live. Inspired by Linear and Superhuman in terms of craft; Copilot Money in terms of category understanding.

---

## Live Demo

| Environment | URL |
|---|---|
| Frontend (Vercel) | `https://fintrack-omega-neon.vercel.app` |
| Backend (Railway/Render) | Configured via `NEXT_PUBLIC_API_URL` |
| Mobile (Capacitor Android) | APK available on request |

---

## Feature Set

### Core Finance

| Feature | Description |
|---|---|
| **Transactions** | Add, edit, delete income/expense entries with categories, tags, notes, payment mode |
| **Quick Add** | Natural language input — type "₹500 coffee" and AI parses it instantly |
| **SMS Parser** | Paste a bank SMS and AI extracts the transaction automatically |
| **Receipt Scanner** | Upload a photo — AI vision reads the amount, merchant, and date |
| **Recurring** | Schedule bills, subscriptions, EMIs with daily/weekly/monthly/yearly cadence |
| **One-Time Expenses** | Plan large upcoming purchases separately from recurring flow |
| **Regret Tracking** | Mark a transaction as regret — AI identifies your regret spending patterns |
| **Advanced Search** | Token-based search (`amount:`, `category:`, `type:`, `tag:`, `date:`, `notes:`) with saved filter views |
| **Bulk Operations** | Multi-select transactions to bulk recategorize, tag, delete, split, or export to CSV |
| **PDF Bank Statement Import** | Upload a bank statement PDF — AI extracts and imports all transactions in bulk, flagging likely duplicates against existing transactions for review before confirming |

### Accounts & Net Worth

| Feature | Description |
|---|---|
| **Bank Accounts** | Track multiple savings/current accounts with live balance computation |
| **Credit Cards** | Track credit limit, outstanding balance, billing cycle, due dates |
| **Wallets** | UPI wallets (PhonePe, Paytm, etc.) with custom icons and colors |
| **Net Worth View** | Dedicated `/net-worth` page with monthly snapshots and wealth velocity tracking |
| **Wealth Intelligence** | Month-over-month net worth growth trend (accelerating/decelerating/steady), asset allocation vs recommended, deviation score |

### Investments

| Feature | Description |
|---|---|
| **Investment Portfolio** | Track mutual funds, stocks, FDs, PPF, NPS, gold, crypto, and other assets |
| **Live Gain/Loss** | Unrealized gain/loss computed from purchase price vs current NAV/price |
| **Portfolio Summary** | Total invested, current value, overall gain/loss percentage, grouped by asset type |
| **CAMS Import** | Upload a CAMS consolidated statement PDF/CAS to auto-import your mutual fund holdings |
| **Investment Transactions** | Log buys, sells, dividends, and SIP installments per holding |

### Loans & Debt Intelligence

| Feature | Description |
|---|---|
| **Loan Tracker** | Track home loans, car loans, personal loans, student loans with full amortization |
| **Amortization Schedule** | Month-by-month EMI breakdown: principal vs interest for every loan |
| **Prepayment Simulation** | Model what happens if you make a lump-sum prepayment — months saved, interest saved |
| **Debt Payoff Optimizer** | Avalanche (highest-rate first), Snowball (smallest-balance first), and Cascade strategies |
| **Prepayment Impact** | Side-by-side comparison of payoff date and total interest with vs without extra payments |
| **Credit Utilization** | Credit card utilization across all cards with optimal vs critical thresholds |
| **Debt-to-Income Ratio** | Real-time DTI based on current income and all active loan EMIs |

### Budgets & Goals

| Feature | Description |
|---|---|
| **Monthly Budgets** | Set category-level spend limits; progress bars update in real-time |
| **Smart Budget Auto-Adjust** | Suggestions to roll over unused budget, switch to zero-based mode, or recalculate from a 3-month average, plus per-category health chips |
| **Savings Goals** | Create goals with target amounts and deadlines; add funds manually |
| **Savings Automation Planner** | Guided savings challenges (No Eating Out Week, Coffee Challenge, Weekend No-Spend) with goal projections and achievement tracking |
| **Budget Health** | AI monthly health report — budget vs actual, recommendations |
| **Financial Health Score** | 0–100 composite score from savings rate, budget adherence, goal progress, emergency fund, and credit utilization, with month-over-month trend |
| **Proactive Financial Coach** | Dashboard alerts for budget breaches, projected overspend pace, upcoming bills, low balances, and stalled goals |

### Analytics

| Feature | Description |
|---|---|
| **Monthly Summary** | Income, expense, savings rate, net cash flow |
| **Trend Charts** | 6-month spending trend by category |
| **Yearly View** | Month-by-month income/expense bar chart for the full year |
| **Payment Methods** | Breakdown by UPI / Cash / Card / Netbanking |
| **Category Breakdown** | Ranked by spend; percentage of total |
| **Regret Score** | % of spending you later regretted, with category-level regret breakdown and a weekly regret-check prompt |
| **Custom Reports** | Date-range PDF-style analytics export |
| **Year in Review** | Annual summary — totals, top category, spending personality, and full-year visualizations |
| **Sankey Flow** | Category-to-merchant money flow diagram |
| **Spending Heatmap** | Calendar-grid view of daily spending intensity |
| **Category Trajectory** | Month-by-month trend line for your top spending categories |

### Tax Center (India)

| Feature | Description |
|---|---|
| **Tax Profile** | Store salary, HRA, employer PF, and city type for automatic deduction calculations |
| **80C Deduction Tracker** | Log PPF, ELSS, EPF, life insurance, NSC, tax-saver FDs, NPS, home loan principal, and tuition fees with ₹1.5L cap tracking |
| **Capital Gains** | Record equity, debt, and property transactions; STCG/LTCG computed automatically |
| **Advance Tax Payments** | Log quarterly advance tax payments; ITR-6 compliance |
| **Old vs New Regime Comparison** | Side-by-side tax under both regimes with recommended choice, slab breakdown, and savings tips |
| **ITR Readiness Checklist** | Progress tracker for all documents needed to file your return |
| **HRA & LTA Estimates** | Compute HRA exemption from salary + rent; LTA eligibility estimate |
| **80C Summary** | Visual progress bar against ₹1.5L limit with category breakdown |

### Financial Planning

| Feature | Description |
|---|---|
| **Financial Plan Builder** | Guided plan covering monthly income, risk profile, emergency fund target/current balance, a primary goal, and loan payoff inputs; AI-generated narrative summary; recalculates when underlying data drifts |
| **FIRE Calculator** | Compute corpus needed for Financial Independence using the 4% rule; real vs nominal returns; years-to-FIRE with step-up and extra-payment scenarios |
| **SIP Calculator** | Goal-based and growth-based SIP projections — monthly SIP amount, lumpsum alternative, total returns, wealth ratio |
| **Cash Flow Forecast** | Monthly projected income, expenses, EMIs, and savings for the next 12 months |
| **Scenario Modeling** | What-if simulations: SIP compounding, new loan impact, expense cut savings, salary raise effect |
| **Portfolio Projection** | Year-by-year portfolio value chart up to your FIRE date |
| **Savings Targets** | Required savings to reach FIRE in 10/15/20 years |

### Milestones

| Feature | Description |
|---|---|
| **Financial Milestones** | Create hierarchical life goals with deadlines and optional target amounts (e.g., "Emergency Fund", "First Crore") |
| **Feasibility Check** | Auto-computes monthly savings needed and whether you're on track based on last 3 months average |
| **Progress Tracking** | Current amount vs target with status transitions (not started → in progress → achieved / missed) |
| **Priority & Parent Grouping** | Organize milestones by priority; link sub-milestones to a parent goal |

### Documents Vault

| Feature | Description |
|---|---|
| **Secure Document Storage** | Upload Form 16, ITR copies, salary slips, bank statements, insurance policies, investment proofs, advance tax challans, and rent receipts |
| **Supabase Storage Backend** | Files stored in a private Supabase bucket (up to 20MB per file); signed download URLs generated on demand |
| **Financial Year Tagging** | Tag documents by financial year for easy retrieval at tax time |
| **Supported Formats** | PDF, JPG, PNG, XLSX |

### Groups & Splits

| Feature | Description |
|---|---|
| **Groups** | Create named groups (trips, flatmates, events) with emoji and budget |
| **Expense Splits** | Add shared expenses; split equally or by custom amounts per member |
| **Settlement Engine** | Minimum-transfer settlement algorithm — who owes whom, exactly |
| **AI Split Parser** | Describe a split in plain text; AI structures it into participants + shares |

### AI Features

| Feature | Description |
|---|---|
| **AI Chat** | Ask anything — "Am I spending too much on Swiggy?" or "Can I afford a trip to Goa?" |
| **AI Agents** | 4 specialized domain agents with persistent conversation history: Debt Coach, Investment Advisor, Tax Planner, Budget Master |
| **Monthly Report** | AI-generated narrative of your financial month — strengths, warnings, suggestions |
| **Forecast** | AI predicts next month's expenses based on 3-month rolling patterns |
| **Forecast Calendar** | Day-by-day projected cash flow calendar with recurring + AI-predicted items |
| **Personality** | Spending personality analysis — are you a "Comfort Seeker", "Impulsive Buyer", or "Strategic Saver"? |
| **Salary Intelligence** | AI calculates take-home, suggests allocations based on your income pattern |
| **Salary Allocation** | AI designs a 50/30/20-style budget plan personalized to your income |
| **Tax Estimate** | AI-powered Old vs New regime tax comparison with slab breakdown and saving tips |
| **Life Event Planner** | Input a life goal (car, wedding, home); AI projects a monthly savings plan |
| **Regret Patterns** | AI identifies your specific regret triggers and time-of-week patterns |
| **Afford Check** | Quick "Can I afford X?" query answered against your real data |
| **Opportunities** | Automatically detected financial optimization opportunities across 13 rule-based types (idle savings, high-interest debt, underutilized 80C, forecast warnings, advance tax due dates, behavioral patterns, salary intelligence, and more) with dismiss/act-on tracking; the top opportunity also surfaces in the daily brief |
| **Peer Insights** | Spending vs anonymized income-bracket benchmarks; behavioral pattern detection (budget anchoring, present bias, subscription bloat) |

### Calendar & Scheduling

| Feature | Description |
|---|---|
| **Calendar View** | Monthly calendar with transactions plotted on their dates, with a day-detail sheet |
| **Spending Heatmap View** | Color-coded daily spending intensity overlaid on the calendar |
| **Recurring on Calendar** | Upcoming recurring payments shown as future calendar entries |
| **AI Forecast Overlay** | AI-predicted spending days overlaid on the calendar |

### Notifications

| Feature | Description |
|---|---|
| **In-App Notification Center** | Bell icon in the home header with unread count; stores up to 50 notifications |
| **Push Notifications** | FCM-based push delivery to the Android app for budgets, goals, and bill reminders |
| **Smart Reminders** | 14 proactive notifications — inactivity nudges, high transaction count alerts, daily evening reminder, budget/goal triggers, and bill-due cron reminders, deduplicated server-side |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                            │
│                                                                 │
│  ┌───────────────────┐    ┌─────────────────────────────────┐   │
│  │   Next.js 16 App  │    │     Capacitor Android APK       │   │
│  │   (Vercel Edge)   │    │    (capacitor://localhost)      │   │
│  └────────┬──────────┘    └───────────────┬─────────────────┘   │
│           │                               │                     │
│           └───────────────┬───────────────┘                     │
│                           │ HTTPS / REST                        │
└───────────────────────────┼─────────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────────┐
│                        API LAYER                                │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              Express.js Server (Node 18)                │    │
│  │                                                         │    │
│  │  Auth │ Txns │ Analytics │ AI │ Investments │ Loans     │    │
│  │  Tax  │ Debt │ Planning  │ Milestones │ Documents        │    │
│  │  Insights │ Agents │ Notifications │ Budgets/Goals       │    │
│  │                                                         │    │
│  │  authMiddleware (JWT) │ Helmet │ CORS │ Rate Limiting    │    │
│  │  Cron Jobs (recurring + notifications)                  │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                            │
      ┌──────────────────┼──────────────────┬──────────────────┐
      │                  │                  │                  │
┌─────▼───────┐  ┌───────▼─────┐  ┌─────────▼───────┐  ┌───────▼─────────┐
│  PostgreSQL │  │   Groq API  │  │  NVIDIA NIM     │  │  Gemini API     │
│  (Supabase  │  │  (AI chat + │  │  (Primary LLM   │  │  (Vision +      │
│   Pooler)   │  │   parsers)  │  │   for 11 routes)│  │   Fallback LLM) │
└─────────────┘  └─────────────┘  └─────────────────┘  └─────────────────┘
                                                                │
                                                   ┌────────────▼────────────┐
                                                   │  Supabase Storage       │
                                                   │  (Documents Vault)      │
                                                   └─────────────────────────┘
```

### Request Flow

```
User Action
    │
    ▼
Next.js Page Component
    │
    ├── Zustand store (authStore / themeStore)
    │
    ├── axios API client (lib/api.ts)
    │       │
    │       ├── Attaches Bearer token (interceptor)
    │       └── 401 → auto logout + redirect (interceptor)
    │
    ▼
Express Route Handler
    │
    ├── authMiddleware — verifies JWT, attaches req.user
    │
    ├── Input validation (utils/validation.js)
    │
    ├── PostgreSQL query (parameterized only)
    │
    └── Response JSON
```

### AI Request Flow

```
User AI Request (e.g. /ai/chat)
    │
    ▼
Check ai_cache in users table
    │
    ├── HIT (< 6h old, or 24h for personality) ──► Return cached response
    │
    └── MISS
          │
          ▼
        Pull real financial data from DB
        (transactions, budgets, goals, accounts, investments, loans)
          │
          ▼
        Inject data into LLM prompt
          │
          ▼
        Route to correct model (see AI System)
          │
          ├── NVIDIA NIM  ────► primary for 11 routes
          ├── Groq Key 1 ────► primary for chat, SMS, split parsers
          ├── Groq Key 2 ────► quick-add + load share
          └── Gemini     ────► vision fallback + non-NIM fallback
          │
          ▼
        Strip <think>…</think> blocks (Qwen/DeepSeek reasoning models)
        Strip ```json wrapper (if JSON response)
          │
          ▼
        JSON.parse / validate
          │
          ▼
        Write to ai_cache
          │
          ▼
        Return to client
```

---

## AI System

FinTrack routes each AI feature to the optimal model based on complexity, token budget, and cost.

### Standard Routes (via `aiComplete()`)

```
┌─────────────────────────┬──────────────────────────────┬────────────────┐
│ Feature                 │ Model                        │ Provider       │
├─────────────────────────┼──────────────────────────────┼────────────────┤
│ AI Chat                 │ llama-3.3-70b-versatile      │ Groq Key 1     │
│ Personality Analysis    │ nemotron-super-49b-v1.5      │ NVIDIA NIM     │
│ Monthly Report          │ minimax-m2.7                 │ NVIDIA NIM     │
│ Recurring Detection     │ deepseek-v4-flash            │ NVIDIA NIM     │
│ Forecast Insight        │ llama-3.2-3b-instruct        │ NVIDIA NIM     │
│ Salary Intelligence     │ deepseek-v4-flash            │ NVIDIA NIM     │
│ Tax Estimate            │ deepseek-v4-flash            │ NVIDIA NIM     │
│ Afford / Predictor      │ deepseek-v4-flash            │ NVIDIA NIM     │
│ Regret Patterns         │ llama-3.2-3b-instruct        │ NVIDIA NIM     │
│ Life Event Planning     │ minimax-m2.7                 │ NVIDIA NIM     │
│ Health Report           │ minimax-m2.7                 │ NVIDIA NIM     │
│ Salary Allocation       │ deepseek-v4-flash            │ NVIDIA NIM     │
│ SMS Parser              │ llama-3.1-8b-instant         │ Groq Key 1     │
│ Quick Add               │ llama-3.1-8b-instant         │ Groq Key 2     │
│ Split Expense Parser    │ llama-3.1-8b-instant         │ Groq Key 1     │
│ PDF Bank Statement      │ llama-3.1-8b-instant         │ Groq Key 1     │
└─────────────────────────┴──────────────────────────────┴────────────────┘
```

### Vision Route (direct call, bypasses `aiComplete()`)

```
Receipt Scanner:  NIM llama-3.2-11b-vision-instruct  →  Gemini gemini-2.0-flash (fallback)
```

### AI Agents (domain-specific, via `/api/ai/agent`)

Four specialized agents with full conversation history stored in `agent_conversations`:

```
┌──────────────────────┬────────────────────────────────────────────────────┐
│ Agent                │ Specialization                                     │
├──────────────────────┼────────────────────────────────────────────────────┤
│ Debt Coach           │ Loan prioritization, EMI prepayment, payoff plans  │
│ Investment Advisor   │ Portfolio review, asset allocation, FIRE progress  │
│ Tax Planner          │ 80C optimization, regime comparison, ITR readiness │
│ Budget Master        │ Category budgeting, spending cuts, savings habits  │
└──────────────────────┴────────────────────────────────────────────────────┘
```

Each agent receives full context about the user's actual financial data (loans, investments, tax profile, transactions) injected into every prompt.

### Fallback Chains

```
groq1  → groq2  → gemini
groq2  → groq1  → gemini
gemini → groq1  → groq2
nim    → groq1  → gemini   (also used when NVIDIA_API_KEY is unset)
```

**Key AI constraints enforced in code:**
- `temperature: 0.3` on all completions — deterministic, not creative
- Real financial data always injected — no hallucinated numbers
- 6-hour cache on all heavy AI endpoints; 24-hour cache on personality
- `<think>…</think>` blocks stripped from all responses (Qwen/DeepSeek reasoning models)
- All JSON responses: strip ` ```json ` wrapper before `JSON.parse`
- 30 req/hour per-user rate limit on all AI endpoints (keyed by JWT user ID)

---

## Tech Stack

### Frontend

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Styling | CSS custom properties + Tailwind CSS (utility layer only) |
| State | Zustand (authStore, themeStore, toastStore) |
| HTTP | axios with request/response interceptors |
| Charts | Recharts |
| Icons | Lucide React |
| Fonts | Cabinet Grotesk (Fontshare), Satoshi (Fontshare), DM Mono (Google Fonts) |
| Mobile | Capacitor (Android PWA wrapper) |

### Backend

| Layer | Technology |
|---|---|
| Runtime | Node.js 18 |
| Framework | Express.js |
| Auth | JWT (jsonwebtoken) + bcryptjs |
| Database | PostgreSQL via `pg` (connection pool) |
| Database Host | Supabase (Transaction Pooler, port 6543) |
| File Storage | Supabase Storage (documents vault, signed URLs) |
| Email (OTP) | Nodemailer / SMTP |
| File Upload | Multer (memory storage, 10MB general / 20MB documents) |
| PDF Parsing | pdf-parse (bank statement import) |
| Security | Helmet, CORS whitelist, express-rate-limit |
| Cron | node-cron (recurring transaction processor + notification triggers) |
| AI Primary | Groq SDK + NVIDIA NIM (via OpenAI-compatible SDK) |
| AI Vision | NIM Llama 3.2 11B Vision (Gemini gemini-2.0-flash fallback) |
| Push Notifications | Firebase Cloud Messaging (FCM) |

---

## Database Schema

```
┌────────────────────────────────────────────────────────────────────┐
│                        CORE TABLES                                 │
├──────────────────────┬─────────────────────────────────────────────┤
│ users                │ id, full_name, email, password_hash,        │
│                      │ currency, ai_cache (JSONB), onboarding_     │
│                      │ variant (A/B cohort), created_at            │
├──────────────────────┼─────────────────────────────────────────────┤
│ transactions         │ id, user_id, amount, type (income/expense), │
│                      │ description, category_id, account_id,       │
│                      │ payment_method, date, notes, tags[],        │
│                      │ is_regret, source (manual/sms/pdf_import/   │
│                      │ cams_import), created_at                    │
├──────────────────────┼─────────────────────────────────────────────┤
│ transaction_         │ id, user_id, source, deleted_at             │
│ deletions            │ (audit trail for hard-deleted transactions) │
├──────────────────────┼─────────────────────────────────────────────┤
│ categories           │ id, user_id, name, icon, color, is_default  │
├──────────────────────┼─────────────────────────────────────────────┤
│ budgets              │ id, user_id, category_id, amount,           │
│                      │ month, year                                 │
├──────────────────────┼─────────────────────────────────────────────┤
│ goals                │ id, user_id, name, target_amount,           │
│                      │ current_amount, deadline, color             │
├──────────────────────┼─────────────────────────────────────────────┤
│ recurring            │ id, user_id, type, amount, description,     │
│                      │ frequency, day_of_month, category_id,       │
│                      │ is_active, last_processed                   │
├──────────────────────┼─────────────────────────────────────────────┤
│ one_time_expenses    │ id, user_id, description, amount,           │
│                      │ planned_date, category_id, is_paid          │
└──────────────────────┴─────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────┐
│                       ACCOUNTS TABLES                              │
├──────────────────────┬─────────────────────────────────────────────┤
│ bank_accounts        │ id, user_id, name, icon, color,             │
│ (accounts)           │ starting_balance, balance_as_of,            │
│                      │ account_type (bank/wallet), last_four,      │
│                      │ is_default                                  │
├──────────────────────┼─────────────────────────────────────────────┤
│ credit_cards         │ id, user_id, bank_name, card_name,          │
│                      │ last_four, credit_limit, outstanding_balance│
│                      │ billing_date, due_days, network, color      │
├──────────────────────┼─────────────────────────────────────────────┤
│ wallets              │ id, user_id, name, icon, color, balance     │
├──────────────────────┼─────────────────────────────────────────────┤
│ net_worth_snapshots  │ id, user_id, snapshot_date, net_worth,      │
│                      │ assets_total, liabilities_total             │
└──────────────────────┴─────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────┐
│                    INVESTMENT TABLES                                │
├──────────────────────┬─────────────────────────────────────────────┤
│ investments          │ id, user_id, type, name, ticker_or_folio,   │
│                      │ units, purchase_price_per_unit,             │
│                      │ current_nav_or_price, purchase_date,        │
│                      │ account_label                               │
├──────────────────────┼─────────────────────────────────────────────┤
│ investment_          │ id, investment_id, transaction_type         │
│ transactions         │ (buy/sell/dividend/sip), units, price,      │
│                      │ date, notes                                 │
├──────────────────────┼─────────────────────────────────────────────┤
│ pdf_import_jobs      │ id, user_id, file_name, bank_name, status,  │
│                      │ extracted_count, error_message              │
├──────────────────────┼─────────────────────────────────────────────┤
│ cams_import_jobs     │ id, user_id, file_name, status,             │
│                      │ holdings_found                              │
└──────────────────────┴─────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────┐
│                       LOAN / DEBT TABLES                           │
├──────────────────────┬─────────────────────────────────────────────┤
│ loans                │ id, user_id, name, type, principal_amount,  │
│                      │ disbursement_date, tenure_months,           │
│                      │ interest_rate_pct, outstanding_balance,     │
│                      │ emi_amount, is_active                       │
├──────────────────────┼─────────────────────────────────────────────┤
│ loan_prepayments     │ id, loan_id, amount, date, notes            │
└──────────────────────┴─────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────┐
│                        TAX TABLES                                  │
├──────────────────────┬─────────────────────────────────────────────┤
│ tax_profiles         │ id, user_id, financial_year, gross_salary,  │
│                      │ employer_pf, hra_received, city_type,       │
│                      │ regime_preference                           │
├──────────────────────┼─────────────────────────────────────────────┤
│ tax_deductions       │ id, user_id, financial_year, section,       │
│                      │ type, amount, description                   │
├──────────────────────┼─────────────────────────────────────────────┤
│ capital_gains_records│ id, user_id, financial_year, asset_type,    │
│                      │ description, purchase_date, sell_date,      │
│                      │ purchase_price, sell_price, indexed_cost    │
├──────────────────────┼─────────────────────────────────────────────┤
│ capital_transactions │ id, user_id, financial_year, asset_type,    │
│                      │ transaction_type, date, amount, description │
├──────────────────────┼─────────────────────────────────────────────┤
│ tax_investments      │ id, user_id, financial_year, type, amount   │
│                      │ (Section 80C eligible investments)          │
├──────────────────────┼─────────────────────────────────────────────┤
│ advance_tax_payments │ id, user_id, financial_year, quarter,       │
│                      │ amount, payment_date, challan_number        │
└──────────────────────┴─────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────┐
│                     PLANNING TABLES                                │
├──────────────────────┬─────────────────────────────────────────────┤
│ milestones           │ id, user_id, name, description, target_date,│
│                      │ target_amount, current_amount, parent_id,   │
│                      │ priority, status                            │
├──────────────────────┼─────────────────────────────────────────────┤
│ scenarios            │ id, user_id, title, type, inputs_json,      │
│                      │ result_json, created_at                     │
├──────────────────────┼─────────────────────────────────────────────┤
│ financial_plans      │ id, user_id (unique), monthly_income,       │
│                      │ risk_profile, emergency_fund_target_months, │
│                      │ emergency_fund_current_balance, goal_name,  │
│                      │ goal_amount, goal_target_months,            │
│                      │ loan_principal/rate/tenure/moratorium,      │
│                      │ ai_narrative (JSONB)                        │
├──────────────────────┼─────────────────────────────────────────────┤
│ financial_plan_      │ id, plan_id, name, amount, category_id      │
│ expenses             │                                              │
└──────────────────────┴─────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────┐
│                      SOCIAL TABLES                                 │
├──────────────────────┬─────────────────────────────────────────────┤
│ groups               │ id, user_id, name, emoji, description,      │
│                      │ budget, currency, members (JSONB)           │
├──────────────────────┼─────────────────────────────────────────────┤
│ group_splits         │ id, group_id, description, total_amount,    │
│                      │ paid_by, date, shares (JSONB)               │
├──────────────────────┼─────────────────────────────────────────────┤
│ splits               │ id, user_id, description, total_amount,     │
│                      │ participants (JSONB), date                  │
└──────────────────────┴─────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────┐
│                      AI / SYSTEM TABLES                            │
├──────────────────────┬─────────────────────────────────────────────┤
│ agent_conversations  │ id, user_id, agent_type, title,             │
│                      │ messages (JSONB), updated_at                │
├──────────────────────┼─────────────────────────────────────────────┤
│ opportunities        │ id, user_id, type, title, description,      │
│                      │ impact_estimate, dismissed, acted_on        │
├──────────────────────┼─────────────────────────────────────────────┤
│ documents            │ id, user_id, name, type, financial_year,    │
│                      │ storage_path, file_name, file_size_bytes,   │
│                      │ mime_type, description                      │
├──────────────────────┼─────────────────────────────────────────────┤
│ user_fcm_tokens      │ id, user_id, token, platform, updated_at    │
├──────────────────────┼─────────────────────────────────────────────┤
│ notification_log     │ id, user_id, key, created_at                │
│                      │ (server-side dedup for push notifications)  │
└──────────────────────┴─────────────────────────────────────────────┘
```

**Database rules enforced in every query:**
- Supabase Transaction Pooler only (port 6543, never 5432)
- Parameterized queries only (`$1, $2, $3`) — no string interpolation
- CTEs for aggregation queries
- All user-scoped queries include `WHERE user_id = $n`

---

## API Reference

### Authentication

```
POST   /api/auth/register          Register new account
POST   /api/auth/verify-email      Verify OTP (6-digit email code, max 5 attempts)
POST   /api/auth/resend-otp        Resend OTP (register or reset)
POST   /api/auth/login             Login → JWT
POST   /api/auth/forgot-password   Send reset OTP
POST   /api/auth/reset-password    Reset with OTP + new password
GET    /api/auth/me                Get current user (requires auth)
```

### Transactions

```
GET    /api/transactions            List (filter: type, month, year; paginated)
GET    /api/transactions/search     Token-based search (limit configurable)
GET    /api/transactions/earliest   Earliest transaction date
POST   /api/transactions            Create transaction
PUT    /api/transactions/:id        Update transaction
DELETE /api/transactions/:id        Delete transaction
PATCH  /api/transactions/:id/regret Toggle regret flag
```

### Analytics

```
GET    /api/analytics/summary       Monthly income/expense/savings
GET    /api/analytics/trends        6-month category trends
GET    /api/analytics/yearly        Month-by-month for a year
GET    /api/analytics/forecast      Projected next-month spending
GET    /api/analytics/report        Date-range report
GET    /api/analytics/payment-methods  Payment method breakdown
```

### Investments

```
GET    /api/investments             List all investments (sorted by value)
GET    /api/investments/summary     Portfolio totals + group breakdown
POST   /api/investments             Add investment
PATCH  /api/investments/:id         Update current NAV/price or units
DELETE /api/investments/:id         Remove investment
POST   /api/import/bank-statement   Upload PDF bank statement for AI extraction
POST   /api/import/cams-statement   Upload CAMS PDF/CAS for mutual fund import
```

### Loans & Debt

```
GET    /api/loans                   List loans (filter: active=true)
POST   /api/loans                   Add loan
PATCH  /api/loans/:id               Update loan details
DELETE /api/loans/:id               Delete loan
GET    /api/loans/:id/amortization  Full amortization schedule
POST   /api/loans/:id/prepayments   Record a prepayment
GET    /api/loans/:id/prepayments   List prepayments for a loan

GET    /api/debt/payoff-optimizer   Avalanche/snowball/cascade strategies + monthly plan
GET    /api/debt/prepayment-impact  Side-by-side: with vs without extra payment
GET    /api/debt/credit-utilization Per-card and aggregate utilization
GET    /api/debt/dti                Debt-to-income ratio
```

### Tax Center

```
GET/POST  /api/tax/profile           Tax profile (salary, HRA, city, regime)
GET       /api/tax/hra               HRA exemption estimate
GET       /api/tax/lta               LTA eligibility estimate
GET       /api/tax/advance-tax       Advance tax schedule + quarterly amounts due
POST      /api/tax/advance-tax/payment  Record an advance tax payment
GET       /api/tax/itr-readiness     ITR filing checklist status
PATCH     /api/tax/itr-readiness     Update checklist item
GET       /api/tax/80c-summary       80C deduction total + category breakdown
GET/POST  /api/tax/80c               List / add 80C deduction entry
PATCH/DELETE /api/tax/80c/:id        Update / delete 80C entry
GET       /api/tax/capital-gains     STCG/LTCG summary for the financial year
POST      /api/tax/capital-transaction  Record a capital asset transaction
```

### Financial Planning

```
GET    /api/planning                Get the user's financial plan
POST   /api/planning                Create/update financial plan (income, risk profile, goal, loan)
DELETE /api/planning                Delete financial plan
POST   /api/planning/narrative      AI-generated narrative summary of the plan
POST   /api/planning/recalculate    Recompute plan projections from current financial data
POST   /api/planning/apply-recalculation  Apply a recalculation to the saved plan
POST   /api/planning/fire           FIRE corpus + years-to-FIRE calculator
POST   /api/planning/sip            SIP amount calculator (goal-based or growth-based)
GET    /api/planning/cashflow       12-month projected cash flow
GET    /api/planning/scenarios      List saved scenarios
GET    /api/planning/scenarios/:id  Get a saved scenario
POST   /api/planning/scenarios      Save a new scenario
PATCH  /api/planning/scenarios/:id  Update scenario
DELETE /api/planning/scenarios/:id  Delete scenario
POST   /api/planning/scenarios/simulate  Run a what-if simulation
```

### Milestones

```
GET    /api/milestones              List milestones (with feasibility checks)
POST   /api/milestones              Create milestone
PATCH  /api/milestones/:id          Update milestone
PATCH  /api/milestones/:id/progress Update current_amount progress
DELETE /api/milestones/:id          Delete milestone
```

### Documents

```
POST   /api/documents               Upload document (multipart/form-data)
GET    /api/documents               List documents (filter by type, financial_year)
GET    /api/documents/:id/download-url  Generate signed download URL
DELETE /api/documents/:id           Delete document
```

### AI Endpoints

```
POST   /api/ai/report               AI monthly narrative report
POST   /api/ai/chat                 Conversational AI with history
POST   /api/ai/parse-sms            Parse bank SMS → transaction
POST   /api/ai/parse-image          Parse receipt photo → transaction
POST   /api/ai/quick-add            Natural language → transaction
POST   /api/ai/afford               "Can I afford X?" check
POST   /api/ai/predict              Alias for /afford
POST   /api/ai/personality          Spending personality analysis
POST   /api/ai/salary-allocation    Personalized budget plan
POST   /api/ai/life-event           Life goal savings planner
POST   /api/ai/health-report        AI budget health assessment
POST   /api/ai/parse-split          Parse split expense text
GET    /api/ai/salary-intelligence  Salary benchmarking insights
GET    /api/ai/forecast-calendar    Day-by-day cash flow calendar
GET    /api/ai/tax-estimate         Indian income tax estimate (Old vs New regime)
GET    /api/ai/detect-patterns      Spending pattern detection
GET    /api/ai/recurring            Alias for /detect-patterns
GET    /api/ai/regret-patterns      Regret trigger analysis
DELETE /api/ai/cache/:key           Bust cache for a specific endpoint

POST   /api/ai/agent/message        Send message to a specialized agent
GET    /api/ai/agent/conversations  List past agent conversations
GET    /api/ai/agent/conversations/:id  Get conversation history
DELETE /api/ai/agent/conversations/:id Delete conversation

POST   /api/ai/opportunities/detect  Detect new financial opportunities
GET    /api/ai/opportunities         List detected opportunities
PATCH  /api/ai/opportunities/:id/dismiss  Dismiss an opportunity
PATCH  /api/ai/opportunities/:id/acted-on Mark opportunity as acted on
```

### Insights

```
GET    /api/insights/peer-benchmarks     Spending vs income-bracket anonymized benchmarks
GET    /api/insights/behavioral-patterns Detected behavioral patterns (budget anchoring, etc.)
```

### Accounts, Groups, Splits, Budgets, Goals (abbreviated)

```
GET/POST/PATCH/DELETE  /api/accounts
GET/POST/PATCH/DELETE  /api/credit-cards
GET/POST/PATCH/DELETE  /api/wallets
GET/POST/PATCH/DELETE  /api/groups
GET/POST/PUT/DELETE    /api/splits
GET/POST/PUT/DELETE    /api/budgets
GET/POST/PUT/DELETE    /api/goals
GET/POST/PUT/DELETE    /api/recurring
GET/POST/PATCH/DELETE  /api/notifications/...
```

---

## Design System

FinTrack uses a custom design token system defined in `frontend/app/globals.css`. Two themes only: `dark` (AMOLED-first, default) and `light`. Theme is applied as `data-theme` on `<html>`.

### Themes

```
Dark (AMOLED)                    Light
────────────────────────         ────────────────────────
--bg-base:       #0a0a0a         --bg-base:       #f8f8f8
--bg-surface-1:  #111111         --bg-surface-1:  #ffffff
--bg-surface-2:  #1a1a1a         --bg-surface-2:  #f3f3f3
--bg-surface-3:  #222222         --bg-surface-3:  #e8e8e8
```

Theme is stored in `localStorage` under `fintrack-theme`. Legacy values (`pitch`, `navy`) migrate to `dark` automatically.

### CSS Token System

All styles use CSS custom properties. Never use magic numbers — always reference a token.

**Semantic color tokens:**
```css
--color-inc:   #16a34a   income, positive delta, success
--color-exp:   #dc2626   expense, negative delta, danger
--accent:      #2563eb   interactive, selected, CTA
--color-warn:  #d97706   warning, pending, budget alert
--color-info:  #0891b2   informational, neutral highlight
```

**Surface hierarchy:**
```css
--bg-base       Page background (deepest)
--bg-surface-1  Cards, panels
--bg-surface-2  Elevated surfaces, inputs, dropdowns
--bg-surface-3  Hover states, active rows
```

**Border tokens:**
```css
--border-subtle   1px borders on cards (low contrast)
--border-visible  Dividers and focused elements (higher contrast)
```

**Typography tokens:**
```css
--font-display: 'Cabinet Grotesk', sans-serif   headings
--font-body:    'Satoshi', sans-serif            body, UI labels
--font-mono:    'DM Mono', monospace             numbers, currency, code
```

**Spacing scale:** `--space-1` (4px) through `--space-16` (64px)

**Radius tokens:** `--radius-sm` (6px), `--radius-md` (10px), `--radius-lg` (16px), `--radius-xl` (24px), `--radius-full`

### Typography

```
Display numbers:   DM Mono — all currency, always tabular-nums
Page headings:     Cabinet Grotesk 700/800
Body / UI:         Satoshi 400/500/600
Code / Terminal:   DM Mono
```

Type scale: `xs` (11px) → `sm` (12px) → `base` (14px) → `md` (15px) → `lg` (20px) → `xl` (28px) → `2xl` (40px) → `hero` (52px)

### Component Library

| Component | Description |
|---|---|
| `PageShell` | Universal page wrapper — title, subtitle, headerRight slot, responsive padding |
| `Button` | 5 variants: primary / secondary / ghost / danger / icon |
| `Card` | Surface-1 container with optional hover lift |
| `StatTile` | Hero metric tile — DM Mono value, Cabinet Grotesk label, trend pill |
| `TransactionRow` | Swipeable transaction list row (swipe-left to delete on mobile) |
| `EmptyState` | Standardised empty state with Lucide icon, title, action |
| `Modal` | `createPortal(content, document.body)` — always rendered at body root |
| `Skeleton` / `SkeletonCard` | Shimmer loading states — replaces all spinners |
| `ThemePicker` | Theme toggle with dark/light options |
| `Badge` | Colored status/label chip |
| `ProgressBar` | Animated progress bar with color variants |
| `FAB` | Floating action button for quick add |
| `BottomSheet` | Mobile-optimised slide-up sheet |
| `Toast` / `ToastContainer` | Non-blocking ephemeral feedback notifications |
| `NotificationBell` | Header bell with unread count badge |
| `AIResponseCard` | Formatted AI response with sections and highlights |
| `SwipeableRow` | Gesture-aware row wrapper for swipe actions |
| `WalkthroughTour` | Step-by-step onboarding tour overlay |

---

## Mobile Support

FinTrack ships as a **Capacitor Android APK** wrapping the Next.js PWA.

```
Supported origins:
  capacitor://localhost
  ionic://localhost
  http://localhost
  https://localhost
```

**Mobile-specific UI rules:**
- All stat grids collapse to `2-column` on `≤768px`
- All touch targets are `≥44px`
- Bottom nav clearance: `calc(60px + env(safe-area-inset-bottom))`
- All popovers and modals use `createPortal` to escape stacking contexts
- Form inputs have `fontSize: 16px` minimum (prevents iOS zoom)
- Swipe-left gesture on transaction rows triggers delete

---

## Security

| Layer | Implementation |
|---|---|
| Auth | JWT (RS256-compatible secret, 7d expiry) |
| OTP | 6-digit code, 10 min expiry, max 5 attempts (server-side counter), then row deleted |
| Passwords | bcryptjs (salt rounds: 10) |
| SQL | Parameterized queries only — zero string interpolation |
| Rate Limiting | 200 req/15min general, 30 req/15min auth, 10 req/10min OTP, 30 req/hr AI (per-user) |
| CORS | Strict allowlist via `CORS_ALLOWED_ORIGINS` env var — blocks all unknown origins |
| Headers | Helmet.js — CSP off (API-only), HSTS enforced |
| Logs | No sensitive data — no passwords, tokens, or stack traces in logs |
| Uploads | Memory-only (never written to disk), 10MB general / 20MB documents |
| Error Responses | Global error handler always returns generic `{ error: 'Internal server error' }` |
| Input Validation | `utils/validation.js` validates all amount, type, date, and enum inputs at route level |

---

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL (or Supabase project)
- Groq API key (free tier available)
- Google Gemini API key (vision/fallback)
- NVIDIA NIM API key (primary LLM for most AI features; optional — falls back to Groq/Gemini if unset)
- Supabase project (for Storage; required for documents vault; `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`)
- Firebase project (for push notifications; optional — `FIREBASE_SERVICE_ACCOUNT_KEY`)

### 1. Clone

```bash
git clone https://github.com/vivek0402/fintrack.git
cd fintrack
```

### 2. Backend

```bash
cd backend
npm install
cp .env.example .env    # fill in values
node src/index.js
```

### 3. Frontend

```bash
cd frontend
npm install
cp .env.local.example .env.local   # fill in NEXT_PUBLIC_API_URL
npm run dev
```

App runs at `http://localhost:3000`. Backend at `http://localhost:5000`.

### 4. Database

Migrations run automatically on server start from `backend/src/db/migrations/*.sql` in alphabetical order (migrations `001` through `056` currently).

---

## Environment Variables

### Backend (`backend/.env`)

```env
PORT=5000
DATABASE_URL=postgresql://user:password@host:6543/postgres?pgbouncer=true
JWT_SECRET=your-secret-key-min-32-chars

# AI providers
GROQ_API_KEY=gsk_...          # Primary LLM key (chat, SMS parser, split parser)
GROQ_API_KEY_2=gsk_...        # Secondary (quick-add + load sharing + fallback)
GEMINI_API_KEY=AIza...        # Vision + non-NIM fallback
NVIDIA_API_KEY=nvapi-...      # NIM — primary LLM for most AI routes + receipt vision

# Email (OTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your@email.com
SMTP_PASS=app-password
EMAIL_FROM=FinTrack <your@email.com>

# Supabase (required for documents vault)
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Firebase (optional — push notifications)
FIREBASE_SERVICE_ACCOUNT_KEY={"type":"service_account",...}

# CORS (optional — defaults to localhost + Vercel)
CORS_ALLOWED_ORIGINS=https://your-frontend.vercel.app,capacitor://localhost
```

### Frontend (`frontend/.env.local`)

```env
NEXT_PUBLIC_API_URL=https://your-backend.railway.app
```

---

## Project Structure

```
fintrack/
├── frontend/
│   ├── app/
│   │   ├── (auth)/                 # Login, register, forgot-password
│   │   ├── dashboard/              # Main overview + hero stats + coach alerts
│   │   ├── transactions/           # Transaction list + advanced search + bulk ops
│   │   ├── analytics/              # Charts, trends, payment methods, regret analysis
│   │   ├── accounts/               # Net worth, banks, cards, wallets
│   │   ├── net-worth/              # Net worth snapshots + wealth velocity
│   │   ├── investments/            # Investment portfolio + CAMS import
│   │   ├── loans/                  # Loan tracker + amortization
│   │   ├── debt-intelligence/      # Payoff optimizer + DTI + utilization
│   │   ├── tax/                    # Full Indian tax center (80C, capital gains, ITR)
│   │   ├── tax-estimate/           # Quick AI Old vs New regime comparison
│   │   ├── fire/                   # FIRE + SIP calculator
│   │   ├── planning/               # Guided financial plan builder + AI narrative
│   │   ├── cash-flow/              # 12-month cash flow projection
│   │   ├── scenarios/              # What-if financial scenario modeling
│   │   ├── milestones/             # Financial life milestones
│   │   ├── documents/              # Financial document vault
│   │   ├── insights/               # Peer benchmarking + behavioral patterns
│   │   ├── wealth-intelligence/    # Wealth velocity + asset allocation analysis
│   │   ├── budgets/                # Monthly category budgets
│   │   ├── goals/                  # Savings goals with progress
│   │   ├── savings-plan/           # Savings challenges + automation planner
│   │   ├── health-score/           # Financial health score gauge + trend
│   │   ├── recurring/              # Recurring income/expenses
│   │   ├── one-time-expenses/      # Planned large purchases
│   │   ├── groups/                 # Group expense management
│   │   ├── splits/                 # Quick bill splits
│   │   ├── reports/                # Date-range analytics
│   │   ├── calendar/               # Transaction calendar + heatmap
│   │   ├── forecast/               # AI spending forecast
│   │   ├── ai-chat/                # Conversational AI interface
│   │   ├── ai-advisor/             # Specialized AI agents (Debt/Investment/Tax/Budget)
│   │   ├── personality/            # Spending personality analysis
│   │   ├── salary-intelligence/    # Salary benchmarking
│   │   ├── year-review/            # Year in review + Sankey + heatmap
│   │   ├── profile/                # Account settings + theme
│   │   ├── onboarding/             # New user setup flow
│   │   ├── globals.css             # Design token system (CSS custom properties)
│   │   └── layout.tsx              # Root layout + font loading
│   ├── components/
│   │   ├── layout/
│   │   │   ├── AppLayout.tsx       # Shell with sidebar + bottom nav + FAB
│   │   │   └── PageShell.tsx       # Per-page wrapper with title slot
│   │   ├── ui/
│   │   │   ├── Button.tsx          # 5-variant button component
│   │   │   ├── Card.tsx            # Surface-1 card container
│   │   │   ├── Modal.tsx           # Portal-based modal
│   │   │   ├── StatTile.tsx        # Metric tile (DM Mono hero value)
│   │   │   ├── TransactionRow.tsx  # Swipeable transaction list row
│   │   │   ├── EmptyState.tsx      # Standardised empty state
│   │   │   ├── Skeleton.tsx        # Shimmer loading states
│   │   │   ├── Badge.tsx           # Colored status chip
│   │   │   ├── ProgressBar.tsx     # Animated progress bar
│   │   │   ├── FAB.tsx             # Floating action button
│   │   │   ├── BottomSheet.tsx     # Mobile slide-up sheet
│   │   │   ├── Toast*.tsx          # Toast notification system
│   │   │   ├── NotificationBell.tsx # Header notification center
│   │   │   ├── AIResponseCard.tsx  # Formatted AI response card
│   │   │   ├── ThemePicker.tsx     # Dark/light theme toggle
│   │   │   └── WalkthroughTour.tsx # Onboarding tour overlay
│   │   ├── investments/
│   │   │   └── CamsImporter.tsx    # CAMS statement import UI
│   │   └── transactions/
│   │       ├── TransactionList.tsx # Date-grouped transaction list
│   │       └── SmsImporter.tsx     # Paste-SMS → AI-parse → review → save flow
│   ├── store/
│   │   ├── authStore.ts            # Zustand auth state (user + token)
│   │   ├── themeStore.ts           # Zustand theme state (dark/light)
│   │   └── toastStore.ts           # Zustand toast queue
│   ├── lib/
│   │   ├── api.ts                  # Typed axios API client (all endpoints)
│   │   └── healthScore.ts          # Financial health score computation
│   ├── hooks/
│   │   └── useWindowSize.ts        # useIsMobile() hook
│   └── types/
│       ├── investments.ts          # Investment type definitions
│       └── loans.ts                # Loan type definitions
│
├── backend/
│   └── src/
│       ├── index.js                # Express app + middleware + cron
│       ├── routes/
│       │   ├── auth.js             # Register, login, OTP, reset
│       │   ├── transactions.js     # CRUD + search + regret + bulk
│       │   ├── analytics.js        # Summary, trends, forecast, report
│       │   ├── ai.js               # All AI features + caching
│       │   ├── agents.js           # Specialized AI agents (4 types)
│       │   ├── opportunities.js    # AI-detected financial opportunities
│       │   ├── insights.js         # Peer benchmarks + behavioral patterns
│       │   ├── investments.js      # Investment portfolio CRUD
│       │   ├── loans.js            # Loan tracker + amortization + prepayments
│       │   ├── debt.js             # Payoff optimizer + DTI + utilization
│       │   ├── tax.js              # Full Indian tax center
│       │   ├── planning.js         # Financial plan CRUD + AI narrative, FIRE, SIP, cash flow, scenarios
│       │   ├── milestones.js       # Financial milestones
│       │   ├── documents.js        # Document vault (Supabase Storage)
│       │   ├── pdfImport.js        # PDF bank statement import
│       │   ├── camsImport.js       # CAMS mutual fund import
│       │   ├── notifications.js    # FCM token + notification log
│       │   ├── budgets.js
│       │   ├── goals.js
│       │   ├── recurring.js
│       │   ├── accounts.js
│       │   ├── creditCards.js
│       │   ├── wallets.js
│       │   ├── groups.js
│       │   ├── splits.js
│       │   ├── categories.js
│       │   ├── oneTimeExpenses.js
│       │   └── profile.js
│       ├── middleware/
│       │   └── auth.js             # JWT verification middleware
│       ├── db/
│       │   ├── pool.js             # pg connection pool (port 6543)
│       │   └── migrations/         # 56 SQL migration files (auto-run)
│       ├── scripts/
│       │   ├── source-trust-report.js   # Edit/delete rate by transaction source (manual/sms/pdf_import)
│       │   └── retention-report.js      # 7d/30d retention by onboarding A/B cohort
│       └── utils/
│           ├── ai.js               # aiComplete() with model routing
│           ├── groq.js             # Groq client + fallback logic
│           ├── gemini.js           # Gemini Vision + NIM vision fallback
│           ├── amortization.js     # EMI calc + amortization + cascade simulation
│           ├── taxComputation.js   # Old/New regime tax engine
│           ├── validation.js       # Input validators (amounts, dates, enums)
│           ├── fcm.js              # Firebase Cloud Messaging client
│           └── email.js            # OTP email sender
│
├── docs/
│   ├── AI_FEATURES.md              # Complete AI provider/model/endpoint map
│   ├── CHANGELOG.md                # Full version history
│   └── FINTRACK_DOCUMENTATION.md   # Extended feature documentation
│
├── DESIGN.md                       # Full design system specification
└── README.md                       # This file
```

---

## Roadmap

- [ ] WhatsApp bot integration (send SMS → FinTrack auto-logs it)
- [ ] iOS Capacitor build
- [ ] Shared household budgets (multi-user accounts)
- [ ] UPI deep links for quick payment recording
- [ ] Android home screen widget (balance snapshot)
- [ ] Bank statement import via Plaid/Setu (automated, not PDF)

---

## Contributing

This is a personal project. If you're a recruiter or developer reading this — the architecture decisions, AI routing system, tax engine, debt simulation, FIRE calculator, and design system were all designed and built from scratch. Feel free to reach out.

---

## License

MIT — use it, fork it, learn from it.
