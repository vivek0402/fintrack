# FinTrack — Project Documentation

**Last Updated:** June 2026 (v0.10.0 — Health Score, Coach, Notifications, Calendar, NIM)

---

## Architecture Overview

- **Frontend:** Next.js 16 (App Router, `output: 'export'`), TypeScript, Zustand, Axios, Recharts, PWA via `@ducanh2912/next-pwa`
- **Backend:** Express.js, PostgreSQL (Supabase), JWT auth, Groq (llama-3.3-70b-versatile + llama-4-scout + llama-3.1-8b), NVIDIA NIM (deepseek-v4-flash, minimax-m2.7, nemotron-49b, llama-3.2-3b/11b-vision — primary for 11 AI routes), Gemini 2.0 Flash (vision + fallback)
- **Deploy:** Vercel (frontend), Render (backend)

---

## Completed Features

### Core Finance
- [x] User authentication (register → OTP verify → login)
- [x] Transactions (create, read, update, delete, regret toggle, pagination)
- [x] Advanced search (token-based filters + saved filter views)
- [x] Bulk operations (recategorize, tag, delete, split, CSV export of selection)
- [x] Categories (CRUD, default categories seeded on register)
- [x] Budgets (create/upsert, delete, spending progress)
- [x] Smart Budget Auto-Adjust (rollover, zero-based mode, 3-month recalculation, health chips)
- [x] Analytics (monthly summary, trends, yearly, forecast, Year in Review, Sankey flow, spending heatmap, category trajectory)
- [x] Recurring transactions (cron job processes daily)
- [x] One-time expense planning
- [x] Savings goals (CRUD, fund allocation)
- [x] Savings Automation Planner (guided challenges + goal projections)
- [x] Financial Health Score (composite score, dashboard widget + dedicated page)
- [x] Proactive Financial Coach (real-time dashboard alerts)
- [x] Expense splits (group split tracking)
- [x] Expense groups (multi-person group expenses)
- [x] Bank accounts, credit cards, and wallets (multiple accounts, default selection, net worth view)
- [x] Custom date range reports (CSV export)
- [x] In-app notification center + push notifications (FCM), 14 smart reminder types with server-side dedupe

### AI Features (all routes on `/api/ai/`)
| Route | Method | Description | AI Model |
|-------|--------|-------------|----------|
| `/chat` | POST | AI Financial Advisor | llama-3.3-70b-versatile (groq1) |
| `/report` | POST | Monthly narrative report | minimax-m2.7 (nim) |
| `/afford` | POST | "Can I afford this?" | deepseek-v4-flash (nim) |
| `/predict` | POST | Alias for /afford | deepseek-v4-flash (nim) |
| `/parse-sms` | POST | Bank SMS parser | llama-3.1-8b (groq1) |
| `/quick-add` | POST | Natural language quick add | llama-3.1-8b (groq2) |
| `/parse-image` | POST | Receipt OCR | llama-3.2-11b-vision (nim, Gemini fallback) |
| `/parse-split` | POST | Split text parser | llama-3.1-8b (groq1) |
| `/detect-patterns` | GET | Recurring pattern detection | deepseek-v4-flash (nim) |
| `/recurring` | GET | Alias for /detect-patterns | deepseek-v4-flash (nim) |
| `/salary-intelligence` | GET | Salary day analysis | deepseek-v4-flash (nim) |
| `/personality` | POST | Financial personality profile | nemotron-49b (nim) |
| `/tax-estimate` | GET | Indian income tax estimate | deepseek-v4-flash (nim) |
| `/regret-patterns` | GET | Regret spending analysis | llama-3.2-3b (nim) |
| `/life-event` | POST | Life event savings plan | minimax-m2.7 (nim) |
| `/forecast-calendar` | GET | 30-day spending forecast | llama-3.2-3b (nim) |
| `/health-report` | POST | Financial health report card | minimax-m2.7 (nim) |
| `/salary-allocation` | POST | 50/30/20 allocation plan | deepseek-v4-flash (nim) |

See `docs/AI_FEATURES.md` for full route/model/provider mapping and fallback details.

### AI Infrastructure
- [x] Multi-provider routing (`utils/ai.js`) — Groq, Gemini, and NVIDIA NIM
- [x] Fallback chains: `groq1`→`groq2`→`gemini`, `groq2`→`groq1`→`gemini`, `gemini`→`groq1`→`groq2`, `nim`→`groq1`→`gemini`
- [x] 429 rate limit detection + automatic provider switching
- [x] Qwen3/DeepSeek `<think>` tag stripping
- [x] 6-hour AI response cache (per-user, per-route) in `users.ai_cache` JSONB
- [x] 24-hour cache for personality profile
- [x] Gemini JSON fence stripping (```` ```json ``` ```` → clean JSON)

### PWA / Mobile
- [x] Service worker (via next-pwa)
- [x] Web App Manifest
- [x] Bottom navigation + sidebar
- [x] Dark / Pitch / Light themes via CSS custom properties

---

## Known Issues Fixed in Session 3

| Issue | Fix | File |
|-------|-----|------|
| `/api/ai/quick-add` route missing | Implemented fully | `routes/ai.js` |
| `/api/ai/tax-estimate` route missing | Implemented fully | `routes/ai.js` |
| `tax-estimate` frontend page missing | Created | `app/tax-estimate/page.tsx` |
| Global error handler leaked `err.message` | Hardened to generic "Internal server error" | `index.js` |
| No body size limit on express.json() | Added `{ limit: '10mb' }` | `index.js` |
| No AI-specific rate limiting | Added 30 req/hour per-user limiter | `index.js` |
| Helmet not configured for API server | Added `contentSecurityPolicy: false` | `index.js` |
| OTP brute-force possible | Added attempt counter (max 5 before invalidation) | `routes/auth.js` |
| Personality cache hardcoded to 6h | Made getCached TTL configurable, personality now 24h | `routes/ai.js` |
| `tax-estimate` not in aiAPI client | Added `taxEstimate()` + `quickAdd()` | `lib/api.ts` |
| Missing DB indexes for common queries | Created migration `010_performance_indexes.sql` | `db/migrations/` |
| OTP security migration incomplete | Created `009_otp_security.sql` (adds `attempts` column) | `db/migrations/` |
| AI route name mismatches (spec vs code) | Added `/predict` and `/recurring` as route aliases | `routes/ai.js` |

---

## Security Measures

- **Auth:** JWT (HS256), expiry checked by jsonwebtoken verify
- **Rate limiting:** 200 req/15min global, 30 req/15min auth, 30 req/hour AI (per user), 10 req/10min OTP
- **OTP:** 10-minute expiry, 60-second resend cooldown, 5-attempt brute-force lockout
- **Passwords:** bcrypt (10 rounds)
- **CORS:** Allowlist only (no wildcard)
- **Helmet:** Enabled (CSP disabled for API compatibility)
- **SQL:** All parameterized queries ($1, $2, …)
- **Error responses:** No stack traces or internal messages exposed to clients
- **Secrets:** All loaded from environment variables, never hardcoded

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
| `009_otp_security.sql` | `otp_verifications.attempts` column |
| `010_performance_indexes.sql` | Query performance indexes |
| `011_one_time_expenses.sql` | One-time expense planning table |
| `012_one_time_expense_items.sql` | Line items for one-time expenses |
| `013_transaction_payment_method.sql` | Payment method column on transactions |
| `014_one_time_expense_transaction_link.sql` | Links one-time expenses to transactions |
| `015_bank_account_balance_as_of.sql` | "Balance as of" tracking for bank accounts |
| `016_credit_cards.sql` | Credit card accounts |
| `017_wallets.sql` | UPI wallet accounts |
| `018_bank_accounts_type_lastfour.sql` | Account type + last-4-digits columns |
| `019_fcm_tokens.sql` | `user_fcm_tokens` table for push notifications |
| `020_notification_log.sql` | `notification_log` table for server-side dedupe |

---

## Environment Variables Required

### Backend (Render)
```
DATABASE_URL=          # Supabase connection string
JWT_SECRET=            # MUST be rotated from default — use a 64-char random string
JWT_EXPIRES_IN=        # e.g. 7d
GROQ_API_KEY=          # Primary Groq key (chat, parse-sms, parse-split, quick-add fallback)
GROQ_API_KEY_2=        # Secondary Groq key (quick-add, NIM fallback target)
GEMINI_API_KEY=        # Google Gemini (vision fallback, NIM fallback target)
NVIDIA_API_KEY=        # NVIDIA NIM (primary for 11 AI routes + receipt vision; optional, falls back to groq1 → gemini if unset)
BREVO_API_KEY=         # Brevo SMTP for OTP emails
FRONTEND_URL=          # https://fintrack-omega-neon.vercel.app
CORS_ALLOWED_ORIGINS=  # Comma-separated allowlist (falls back to FRONTEND_URL)
NODE_ENV=production
```

### Frontend (Vercel)
```
NEXT_PUBLIC_API_URL=   # https://your-backend.onrender.com
```

---

## ⚠️ Manual Actions Required

1. **Set `NVIDIA_API_KEY`** on Render. Without it, the 11 routes now defaulting to
   `nim` fall back to `groq1` → `gemini` on every call, which works but loses the
   NIM-specific models (and the receipt-vision NIM path falls straight to Gemini).

2. **Rotate JWT_SECRET** on Render if still using default. Set to a 64-char random string.

3. **Verify GROQ_API_KEY_2** is set on Render — without it, `quick-add` and other
   `groq2` routes use key 1 (may hit rate limits under load).

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

- **getCached TTL should be parameterised** — personality profile changes slowly (24h ideal), tax estimate can be stale for 6h, but these had the same hardcoded 6h TTL. Fixed by adding optional `ttlMs` param.
- **Route aliases prevent spec drift** — spec named routes `/predict` and `/recurring`; code evolved to `/afford` and `/detect-patterns`. Added aliases so both names work.
- **AI rate limiter must be per-user, not per-IP** — shared office/VPN IPs would trigger false positives on a per-IP limiter. Using JWT user ID as key is more accurate.
- **OTP brute-force requires server-side counting** — IP-level rate limiting alone isn't sufficient; a determined attacker can rotate IPs. The `attempts` counter invalidates the OTP after 5 wrong guesses regardless of IP.
