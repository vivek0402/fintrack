# FinTrack — AI-Powered Personal Finance

> A production-grade personal finance application with real-time AI insights, multi-account tracking, group expense splits, and a premium AMOLED-first design system.

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

FinTrack is a full-stack personal finance tracker built for users who take their money seriously. It goes beyond basic budgeting — it ingests your transactions, learns your spending personality, forecasts your financial future, and gives you an AI co-pilot you can actually ask questions in plain English.

**Who it's for:** Individuals who want surgical clarity over their financial story — not another pastel dashboard full of pie charts.

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
| **Receipt Scanner** | Upload a photo — Gemini Vision reads the amount, merchant, and date |
| **Recurring** | Schedule bills, subscriptions, EMIs with daily/weekly/monthly/yearly cadence |
| **One-Time Expenses** | Plan large upcoming purchases separately from recurring flow |
| **Regret Tracking** | Mark a transaction as regret — AI identifies your regret spending patterns |
| **Advanced Search** | Token-based search (`amount:`, `category:`, `type:`, `tag:`, `date:`, `notes:`) with saved filter views |
| **Bulk Operations** | Multi-select transactions to bulk recategorize, tag, delete, split, or export to CSV |

### Accounts & Net Worth

| Feature | Description |
|---|---|
| **Bank Accounts** | Track multiple savings/current accounts with live balance computation |
| **Credit Cards** | Track credit limit, outstanding balance, billing cycle, due dates |
| **Wallets** | UPI wallets (PhonePe, Paytm, etc.) with custom icons and colors |
| **Net Worth View** | Hero dashboard showing total assets, credit debt, and wallet balances |

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
| **Monthly Report** | AI-generated narrative of your financial month — strengths, warnings, suggestions |
| **Forecast** | AI predicts next month's expenses based on 3-month rolling patterns |
| **Forecast Calendar** | Day-by-day projected cash flow calendar with recurring + AI-predicted items |
| **Personality** | Spending personality analysis — are you a "Comfort Seeker", "Impulsive Buyer", or "Strategic Saver"? |
| **Salary Intelligence** | Upload salary + expenses; AI calculates take-home, suggests allocations |
| **Salary Allocation** | AI designs a 50/30/20-style budget plan personalized to your income |
| **Tax Estimate** | Rough income tax estimate (India) based on categorized income transactions |
| **Life Event Planner** | Input a life goal (car, wedding, home); AI projects a monthly savings plan |
| **Regret Patterns** | AI identifies your specific regret triggers and time-of-week patterns |
| **Afford Check** | Quick "Can I afford X?" query answered against your real data |

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
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐   │    │
│  │  │   Auth   │  │   Txns   │  │ Analytics│  │   AI   │   │    │
│  │  │  Routes  │  │  Routes  │  │  Routes  │  │ Routes │   │    │
│  │  └──────────┘  └──────────┘  └──────────┘  └────────┘   │    │
│  │                                                         │    │
│  │  ┌─────────────────────────────────────────────────┐    │    │
│  │  │              authMiddleware (JWT)               │    │    │
│  │  └─────────────────────────────────────────────────┘    │    │
│  │                                                         │    │
│  │  Helmet │ CORS │ Rate Limiting │ Cron Jobs              │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                            │
      ┌──────────────────┼──────────────────┬──────────────────┐
      │                  │                  │                  │
┌─────▼───────┐  ┌───────▼─────┐  ┌─────────▼───────┐  ┌───────▼─────────┐
│  PostgreSQL │  │   Groq API  │  │  NVIDIA NIM     │  │  Gemini API     │
│  (Supabase  │  │  (Primary   │  │  (Primary LLM   │  │  (Vision +      │
│   Pooler)   │  │    LLM)     │  │   for 11 routes)│  │   Fallback LLM) │
└─────────────┘  └─────────────┘  └─────────────────┘  └─────────────────┘
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
    ├── Input validation
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
    ├── HIT (< 6h old) ──────────────────────► Return cached response
    │
    └── MISS
          │
          ▼
        Pull real financial data from DB
        (transactions, budgets, goals, accounts)
          │
          ▼
        Inject data into LLM prompt
          │
          ▼
        Route to correct model (see AI System)
          │
          ├── NVIDIA NIM  ────► primary for 11 routes (groq1 → gemini fallback)
          ├── Groq Key 1 ────► primary for remaining routes
          ├── Groq Key 2 ────► fallback / load share
          └── Gemini     ────► vision fallback + non-NIM fallback chain
          │
          ▼
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

FinTrack routes each AI feature to the optimal model based on complexity, token budget, and cost:

```
┌─────────────────────────┬──────────────────────────────┬────────────────┐
│ Feature                 │ Model                        │ Provider       │
├─────────────────────────┼──────────────────────────────┼────────────────┤
│ AI Chat                 │ llama-3.3-70b-versatile      │ Groq Key 1     │
│ Personality Analysis    │ nemotron-super-49b           │ NVIDIA NIM     │
│ Monthly Report          │ minimax-m2.7                 │ NVIDIA NIM     │
│ Recurring Suggestions   │ deepseek-v4-flash            │ NVIDIA NIM     │
│ Forecast / Cash Flow    │ llama-3.2-3b-instruct        │ NVIDIA NIM     │
│ Salary Intelligence     │ deepseek-v4-flash            │ NVIDIA NIM     │
│ Tax Estimate            │ deepseek-v4-flash            │ NVIDIA NIM     │
│ Afford / Predictor      │ deepseek-v4-flash            │ NVIDIA NIM     │
│ Regret Patterns         │ llama-3.2-3b-instruct        │ NVIDIA NIM     │
│ Life Event Planning     │ minimax-m2.7                 │ NVIDIA NIM     │
│ Health Report           │ minimax-m2.7                 │ NVIDIA NIM     │
│ SMS Parser              │ llama-3.1-8b                 │ Groq Key 1     │
│ Quick Add               │ llama-3.1-8b                 │ Groq Key 2     │
│ Split Expense Parser    │ llama-3.1-8b                 │ Groq Key 1     │
│ Salary Allocation       │ deepseek-v4-flash            │ NVIDIA NIM     │
│ Receipt Scanner         │ llama-3.2-11b-vision         │ NVIDIA NIM     │
└─────────────────────────┴──────────────────────────────┴────────────────┘

Fallback chains:
  groq1  → groq2  → gemini
  groq2  → groq1  → gemini
  gemini → groq1  → groq2
  nim    → groq1  → gemini   (also used when NVIDIA_API_KEY is unset)

Receipt Scanner falls back from NIM vision to Gemini Vision on error/missing key.
```

**Key AI constraints enforced in code:**
- `temperature: 0.3` on all completions — deterministic, not creative
- Real financial data always injected — no hallucinated numbers
- 6-hour cache on all heavy AI endpoints (report, forecast, personality, salary)
- All JSON responses: strip ` ```json ` wrapper before `JSON.parse`

---

## Tech Stack

### Frontend

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Styling | Inline styles + CSS custom properties (zero Tailwind) |
| State | Zustand (authStore, themeStore) |
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
| Email (OTP) | Nodemailer / SMTP |
| File Upload | Multer (memory storage, 10MB limit) |
| Security | Helmet, CORS whitelist, express-rate-limit |
| Cron | node-cron (recurring transaction processor) |
| AI Primary | Groq SDK + NVIDIA NIM (via OpenAI SDK) |
| AI Vision | NVIDIA NIM Llama 3.2 11B Vision (Gemini fallback) |

---

## Database Schema

```
┌────────────────────────────────────────────────────────────────────┐
│                        CORE TABLES                                 │
├──────────────────────┬─────────────────────────────────────────────┤
│ users                │ id, full_name, email, password_hash,        │
│                      │ currency, ai_cache (JSONB), created_at      │
├──────────────────────┼─────────────────────────────────────────────┤
│ transactions         │ id, user_id, amount, type (income/expense), │
│                      │ description, category_id, account_id,       │
│                      │ date, notes, tags[], is_regret, created_at  │
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
│ accounts             │ id, user_id, name, icon, color,             │
│                      │ starting_balance, balance_as_of,            │
│                      │ account_type (bank/wallet), is_default      │
├──────────────────────┼─────────────────────────────────────────────┤
│ credit_cards         │ id, user_id, bank_name, card_name,          │
│                      │ last_four, credit_limit, outstanding_balance│
│                      │ billing_date, due_days, network, color      │
├──────────────────────┼─────────────────────────────────────────────┤
│ wallets              │ id, user_id, name, icon, color, balance     │
└──────────────────────┴─────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────┐
│                       SOCIAL TABLES                                │
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
POST   /api/auth/verify-email      Verify OTP (6-digit email code)
POST   /api/auth/resend-otp        Resend OTP (register or reset)
POST   /api/auth/login             Login → JWT
POST   /api/auth/forgot-password   Send reset OTP
POST   /api/auth/reset-password    Reset with OTP + new password
GET    /api/auth/me                Get current user (requires auth)
```

### Transactions

```
GET    /api/transactions            List (filter: type, month, year)
GET    /api/transactions/search     Full-text search by description
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

### AI Endpoints

```
POST   /api/ai/report               AI monthly narrative report
POST   /api/ai/chat                 Conversational AI with history
POST   /api/ai/parse-sms            Parse bank SMS → transaction
POST   /api/ai/parse-image          Parse receipt photo → transaction
POST   /api/ai/quick-add            Natural language → transaction
POST   /api/ai/afford               "Can I afford X?" check
POST   /api/ai/personality          Spending personality analysis
POST   /api/ai/salary-allocation    Personalized budget plan
POST   /api/ai/life-event           Life goal savings planner
POST   /api/ai/health-report        AI budget health assessment
GET    /api/ai/salary-intelligence  Salary benchmarking insights
GET    /api/ai/forecast-calendar    Day-by-day cash flow calendar
GET    /api/ai/tax-estimate         Indian income tax estimate
GET    /api/ai/detect-patterns      Spending pattern detection
GET    /api/ai/regret-patterns      Regret trigger analysis
DELETE /api/ai/cache/:key           Bust cache for a specific endpoint
```

### Accounts, Groups, Splits (abbreviated)

```
GET/POST/PATCH/DELETE  /api/accounts
GET/POST/PATCH/DELETE  /api/credit-cards
GET/POST/PATCH/DELETE  /api/wallets
GET/POST/PATCH/DELETE  /api/groups
GET/POST/PUT/DELETE    /api/splits
GET/POST/PATCH/DELETE  /api/budgets
GET/POST/PUT/DELETE    /api/goals
GET/POST/PUT/DELETE    /api/recurring
```

---

## Design System

FinTrack uses a custom design system with zero Tailwind — every style is an inline object or a CSS custom property.

### Themes

Two themes, toggled with a binary Moon/Sun pill:

```
Dark (AMOLED)          Light
─────────────          ─────────────
bg:     #000000        bg:     #f9fafb
card:   #111111        card:   #ffffff
text:   #f5f5f5        text:   #0f172a
border: #222222        border: #e5e7eb
```

Theme is stored in `localStorage` under `fintrack-theme`. Any legacy `pitch` or `navy` value migrates to `dark` automatically.

### Typography

```
Display numbers:   DM Mono — all currency, always tabular-nums
Page headings:     Cabinet Grotesk 700/800
Body / UI:         Satoshi 400/500/600
Code / Terminal:   DM Mono
```

### Color Semantics

```css
--accent-green:   income, positive delta, success
--accent-red:     expense, negative delta, danger
--accent-blue:    interactive, selected, CTA
--accent-yellow:  warning, pending
--accent-purple:  tags, secondary category
```

### Surface Hierarchy

```
--surface-0   Page background (deepest)
--surface-1   Cards, panels
--surface-2   Elevated surfaces, dropdowns
--surface-3   Hover states, active rows
```

### Component Library

| Component | Description |
|---|---|
| `PageShell` | Universal page wrapper — title, subtitle, headerRight slot, responsive padding |
| `Button` | 5 variants: primary / secondary / ghost / danger / icon |
| `Card` | Surface-1 container with optional hover lift |
| `StatTile` | Hero metric tile — DM Mono value, Cabinet Grotesk label, trend pill |
| `TransactionRow` | Swipe-to-delete on mobile, hover edit on desktop |
| `EmptyState` | Standardised empty state with Lucide icon, title, action |
| `Modal` | `createPortal(content, document.body)` — always rendered at body root |
| `Skeleton` | Shimmer loading state — replaces all spinners |
| `ThemeToggle` | Binary Moon/Sun pill toggle |

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
| OTP | 6-digit code, 10 min expiry, max 10 attempts per 10 min window |
| Passwords | bcryptjs (salt rounds: 10) |
| SQL | Parameterized queries only — zero string interpolation |
| Rate Limiting | 200 req/15min general, 30 req/15min auth, 10 req/10min OTP |
| CORS | Strict whitelist — blocks all unknown origins |
| Headers | Helmet.js — no CSP (API-only), HSTS enforced |
| Logs | No sensitive data — no passwords, tokens, or stack traces in logs |
| Uploads | Memory-only (never written to disk), 10MB cap |

---

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL (or Supabase project)
- Groq API key (free tier available)
- Google Gemini API key (vision/fallback)
- NVIDIA NIM API key (primary LLM for most AI features; optional — falls back to Groq/Gemini if unset)

### 1. Clone

```bash
git clone https://github.com/your-username/fintrack.git
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

Migrations run automatically on server start from `backend/src/db/migrations/*.sql` in alphabetical order.

---

## Environment Variables

### Backend (`backend/.env`)

```env
PORT=5000
DATABASE_URL=postgresql://user:password@host:6543/postgres?pgbouncer=true
JWT_SECRET=your-secret-key-min-32-chars

GROQ_API_KEY=gsk_...          # Primary LLM key
GROQ_API_KEY_2=gsk_...        # Secondary (load sharing + fallback)
GEMINI_API_KEY=AIza...        # Vision + non-NIM fallback
NVIDIA_API_KEY=nvapi-...      # NIM — primary LLM for most AI routes + receipt vision

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your@email.com
SMTP_PASS=app-password
EMAIL_FROM=FinTrack <your@email.com>
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
│   │   ├── dashboard/              # Main overview + hero stats
│   │   ├── transactions/           # Transaction list + filters
│   │   ├── analytics/              # Charts, trends, payment methods
│   │   ├── accounts/               # Net worth, banks, cards, wallets
│   │   ├── budgets/                # Monthly category budgets
│   │   ├── goals/                  # Savings goals with progress
│   │   ├── recurring/              # Recurring income/expenses
│   │   ├── one-time-expenses/      # Planned large purchases
│   │   ├── groups/                 # Group expense management
│   │   ├── splits/                 # Quick bill splits
│   │   ├── reports/                # Date-range analytics
│   │   ├── calendar/               # Transaction calendar view
│   │   ├── forecast/               # AI spending forecast
│   │   ├── ai-chat/                # Conversational AI interface
│   │   ├── personality/            # Spending personality analysis
│   │   ├── salary-intelligence/    # Salary benchmarking
│   │   ├── tax-estimate/           # Indian tax calculator
│   │   ├── profile/                # Account settings + theme
│   │   ├── onboarding/             # New user setup flow
│   │   ├── globals.css             # Design system CSS variables
│   │   └── layout.tsx              # Root layout + font loading
│   ├── components/
│   │   ├── layout/
│   │   │   ├── AppLayout.tsx       # Shell with sidebar + bottom nav
│   │   │   └── PageShell.tsx       # Per-page wrapper with title slot
│   │   ├── ui/
│   │   │   ├── Button.tsx          # 5-variant button component
│   │   │   ├── Card.tsx            # Surface-1 card container
│   │   │   ├── Modal.tsx           # Portal-based modal
│   │   │   ├── StatTile.tsx        # Metric tile (DM Mono hero value)
│   │   │   ├── TransactionRow.tsx  # Swipeable transaction list row
│   │   │   ├── EmptyState.tsx      # Standardised empty state
│   │   │   ├── Skeleton.tsx        # Shimmer loading state
│   │   │   └── ThemeToggle.tsx     # Binary dark/light pill toggle
│   │   └── transactions/
│   │       └── TransactionList.tsx # Date-grouped transaction list
│   ├── store/
│   │   ├── authStore.ts            # Zustand auth state (user + token)
│   │   └── themeStore.ts           # Zustand theme state (dark/light)
│   ├── lib/
│   │   └── api.ts                  # Typed axios API client
│   └── hooks/
│       └── useWindowSize.ts        # useIsMobile() hook
│
├── backend/
│   └── src/
│       ├── index.js                # Express app + middleware + cron
│       ├── routes/
│       │   ├── auth.js             # Register, login, OTP, reset
│       │   ├── transactions.js     # CRUD + search + regret
│       │   ├── analytics.js        # Summary, trends, forecast, report
│       │   ├── ai.js               # All AI features
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
│       │   └── migrations/         # SQL migration files (auto-run)
│       └── utils/
│           ├── ai.js               # aiComplete() with model routing (Groq/NIM/Gemini)
│           ├── groq.js             # Groq client + fallback logic
│           ├── gemini.js           # Gemini Vision client + NIM vision fallback
│           └── email.js            # OTP email sender
│
├── docs/
│   └── superpowers/
│       ├── plans/                  # Implementation plans
│       └── specs/                  # Feature specifications
│
├── DESIGN.md                       # Full design system documentation
└── README.md                       # This file
```

---

## Roadmap

- [ ] WhatsApp bot integration (send SMS → FinTrack auto-logs it)
- [ ] Bank statement PDF import (AI-parsed CSV → bulk transactions)
- [ ] Shared household budgets (multi-user accounts)
- [ ] UPI deep links for quick payment recording
- [ ] iOS Capacitor build
- [ ] Widget (Android home screen balance snapshot)

---

## Contributing

This is a personal project. If you're a recruiter or developer reading this — the architecture decisions, AI routing system, and design system were all designed and built from scratch. Feel free to reach out.

---

## License

MIT — use it, fork it, learn from it.
