# FinTrack — Frontend

Personal finance tracker PWA built with Next.js 16 App Router.

## Stack

- **Framework:** Next.js 16 (App Router, `output: 'export'` — static export)
- **Language:** TypeScript
- **State:** Zustand + localStorage
- **HTTP:** Axios (`lib/api.ts` — auto-attaches Bearer token)
- **Charts:** Recharts
- **PWA:** @ducanh2912/next-pwa (service worker + manifest)
- **Deploy:** Vercel

## Local Setup

```bash
cd frontend
npm install
cp .env.local.example .env.local   # then fill in NEXT_PUBLIC_API_URL
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment Variables

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_API_URL` | Backend base URL (e.g. `http://localhost:5000` for local dev, `https://your-backend.onrender.com` for prod) |

## Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start dev server (hot reload) |
| `npm run build` | Static export to `out/` |
| `npm run lint` | ESLint check |

## Key Conventions

- **Styling:** Inline styles only — no Tailwind utility classes. Semantic class names (`fintrack-card`, `page-glow`) are OK for CSS targeting.
- **Colors:** CSS variables (`var(--accent-blue)`, `var(--bg-card)`, etc.) — no hardcoded hex values.
- **Currency:** `Math.round(n).toLocaleString('en-IN')` — never `.toFixed(2)`.
- **API calls:** All via `lib/api.ts` exports (`transactionsAPI`, `aiAPI`, etc.).
- **Auth:** JWT stored in localStorage via Zustand `authStore`. 401 responses auto-redirect to `/login`.

## Project Structure

```
app/                   Pages (App Router)
  dashboard/           Main dashboard
  transactions/        Transaction list + CRUD
  budgets/             Budget tracking
  goals/               Savings goals
  analytics/           Charts and trends
  ai-chat/             AI financial advisor chat
  tax-estimate/        Indian income tax estimator
  planning/            Guided financial plan builder + AI narrative
  onboarding/          New user setup (treatment cohort gets an import step)
  ...
components/
  layout/              AppLayout, Sidebar, BottomNav
  ui/                  Button, Skeleton, shared primitives
  transactions/        SmsImporter, BankStatementImporter, TransactionList
lib/
  api.ts               Axios instance + all API methods
  utils.ts             formatCurrency, date helpers
store/
  authStore.ts         Zustand auth state (user.onboarding_variant = A/B cohort)
```
