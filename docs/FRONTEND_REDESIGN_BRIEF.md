# FinTrack — Frontend UI/UX & Backend-Connection Documentation

> **Purpose of this document:** A complete map of the current frontend — every page, every shared
> component, the design system as *implemented*, and exactly which backend endpoints each screen
> talks to. This is the reference needed to **redesign the frontend entirely** without losing any
> feature or breaking the data contracts with the backend.
>
> Generated 2026-06-04. Reflects the codebase at branch `main` (migrations through `018`).

---

## 1. Tech Stack & Architecture

### 1.1 Frontend stack
| Concern | Choice |
|---|---|
| Framework | **Next.js 16.2.1** (App Router) + React **19.2.4** |
| Language | TypeScript 5 |
| Rendering | All screens are `'use client'` components (SPA-style, client-rendered) |
| Styling | **Inline styles only** + CSS custom properties. Tailwind is imported in `globals.css` (`@import "tailwindcss"`) but `className` utilities are **not** used per project rule |
| State | **Zustand** (`zustand` v5) with `persist` middleware → `localStorage` |
| HTTP | **Axios** (single instance in `lib/api.ts` with JWT interceptor) |
| Charts | **Recharts** v3 |
| Icons | **lucide-react** |
| Animation | Hand-rolled CSS `@keyframes` in `globals.css` (no framer-motion) |
| Mobile shell | **Capacitor 8** (Android) wrapping the web app; PWA via `@ducanh2912/next-pwa` |
| Analytics | `@vercel/analytics` |
| React Compiler | `babel-plugin-react-compiler` enabled |

> ⚠️ **`frontend/AGENTS.md` warns:** "This is NOT the Next.js you know" — Next 16 has breaking
> changes vs. training data. Read `node_modules/next/dist/docs/` before writing Next-specific code.

### 1.2 Backend stack (for context)
- Node/Express REST API, JWT auth (`Authorization: Bearer <token>`).
- PostgreSQL via **Supabase Transaction Pooler (port 6543)**.
- AI via **Groq** (Llama/Qwen models) with **Gemini** fallback; heavy AI responses cached 6h in `users.ai_cache`.
- Base URL injected via `NEXT_PUBLIC_API_URL`.

### 1.3 Request flow
```
Page/Component  →  lib/api.ts (axios)  →  Express route (authMiddleware)  →  Postgres / AI provider
        ↑                  │
   Zustand authStore ──────┘ (injects Bearer token; on 401 → logout + redirect /login)
```

---

## 2. The API Client — `frontend/lib/api.ts`

Single axios instance. **Request interceptor** attaches `Bearer <token>` from `useAuthStore`.
**Response interceptor**: any `401` → `authStore.logout()` + hard redirect to `/login`.

Exported API namespaces (each method = one backend call). **Preserve these signatures during redesign** — they are the data contract.

| Namespace | Methods → Endpoint |
|---|---|
| `authAPI` | `register` `POST /api/auth/register` · `verifyEmail` `POST /api/auth/verify-email` · `resendOTP` `POST /api/auth/resend-otp` · `forgotPassword` `POST /api/auth/forgot-password` · `resetPassword` `POST /api/auth/reset-password` · `login` `POST /api/auth/login` · `me` `GET /api/auth/me` |
| `transactionsAPI` | `getAll` `GET /api/transactions?type,month,year` · `search` `GET /api/transactions/search?q` · `create` `POST` · `update` `PUT /:id` · `delete` `DELETE /:id` · `toggleRegret` `PATCH /:id/regret` · `earliest` `GET /api/transactions/earliest` |
| `categoriesAPI` | `getAll` `GET /api/categories` · `create` `POST` · `delete` `DELETE /:id` |
| `budgetsAPI` | `getAll` `GET /api/budgets?month,year` · `create` `POST` · `delete` `DELETE /:id` |
| `analyticsAPI` | `summary` `GET /api/analytics/summary?month,year` · `trends` `GET /trends` · `yearly` `GET /yearly?year` · `forecast` `GET /forecast?month,year` · `report` `GET /report?from,to` · `paymentMethods` `GET /payment-methods?month,year` |
| `profileAPI` | `get` `GET /api/profile` · `update` `PUT /api/profile` · `changePassword` `PUT /api/profile/password` |
| `recurringAPI` | `getAll` `GET /api/recurring` · `create` `POST` · `update` `PUT /:id` · `toggle` `PATCH /:id/toggle` · `delete` `DELETE /:id` · `process` `POST /process` |
| `goalsAPI` | `getAll` `GET /api/goals` · `create` `POST` · `update` `PUT /:id` · `addFunds` `PATCH /:id/funds` · `delete` `DELETE /:id` |
| `aiAPI` | `report` `POST /api/ai/report` · `afford` `POST /afford` · `chat` `POST /chat` · `parseSMS` `POST /parse-sms` · `detectPatterns` `GET /detect-patterns` · `parseImage` `POST /parse-image` (multipart) · `parseSplit` `POST /parse-split` · `salaryIntelligence` `GET /salary-intelligence` · `personality` `POST /personality` · `regretPatterns` `GET /regret-patterns` · `salaryAllocation` `POST /salary-allocation?force` · `lifeEvent` `POST /life-event` · `forecastCalendar` `GET /forecast-calendar?force` · `clearCache` `DELETE /cache/:key` · `healthReport` `POST /health-report` · `taxEstimate` `GET /tax-estimate?force` · `quickAdd` `POST /quick-add` |
| `splitsAPI` | `getAll` `GET /api/splits` · `create` `POST` · `update` `PUT /:id` · `settle` `PATCH /:id/settle/:index` · `delete` `DELETE /:id` |
| `accountsAPI` | `getAll` `GET /api/accounts` · `create` `POST` · `update` `PATCH /:id` · `setDefault` `PATCH /:id/set-default` · `delete` `DELETE /:id` |
| `groupsAPI` | `getAll` `GET /api/groups` · `create` `POST` · `get` `GET /:id` · `update` `PATCH /:id` · `delete` `DELETE /:id` · `linkTransaction` `POST /:id/transactions/:txId` · `unlinkTransaction` `DELETE …` · `addSplit` `POST /:id/splits` · `updateSplit` `PUT /:id/splits/:splitId` · `settleShare` `PATCH /:id/splits/:splitId/shares/:shareId/settle` · `settlements` `GET /:id/settlements` |
| `creditCardsAPI` | `getAll` `GET /api/credit-cards` · `create` `POST` · `update` `PUT /:id` · `delete` `DELETE /:id` |
| `walletsAPI` | `getAll` `GET /api/wallets` · `create` `POST` · `update` `PUT /:id` · `delete` `DELETE /:id` |

Also present on the backend but **not yet wired** to the typed client: `oneTimeExpensesAPI`
endpoints (`/api/one-time-expenses` + `/items`) — the One-Time Expenses page calls these.
`POST /api/ai/predict` and `GET /api/ai/recurring` exist on the backend but are unused by the UI.

---

## 3. Global Shell & Navigation

### 3.1 Root layout — `app/layout.tsx`
- Sets `<html data-theme>` from `localStorage('fintrack-theme')` via an inline pre-hydration script (avoids theme flash).
- Loads fonts from CDN: **Satoshi** + **Cabinet Grotesk** (Fontshare) and **DM Mono** (Google Fonts).
- Mounts `<CapacitorBridge/>` (native glue) and `<Analytics/>`.
- Viewport locked: `maximumScale: 1, userScalable: false, viewportFit: 'cover'` (native-app feel).
- PWA manifest + Apple touch icons; theme-color per color scheme.

### 3.2 App chrome — `components/layout/AppLayout.tsx`
The wrapper every authenticated page renders inside. Responsibilities:
- Renders `<Sidebar/>` (desktop) or `<BottomNav/>` (mobile), keyed by `useIsMobile()`.
- `<main>` offsets `margin-left` by sidebar width (64px collapsed / 220px expanded); mobile adds bottom padding for nav + FAB clearance and `env(safe-area-inset-*)`.
- **Two floating action buttons** (desktop & mobile variants):
  - **Add-transaction FAB** → `router.push('/transactions?add=true')`. Hidden on `/login /register /onboarding /ai-chat /transactions`.
  - **AI-chat FAB** (sparkles, gradient, soft-pulse) → `/ai-chat`. Hidden on `/login /register /onboarding /ai-chat /profile`. Desktop only.
- Wraps children in `<ErrorBoundary/>`, mounts `<ToastContainer/>` and `<WalkthroughTour/>` (first-run onboarding tour keyed per user id in localStorage).
- Warms the backend on load (`fetch(API_URL/health)`) to mitigate Supabase free-tier cold starts.
- Loads theme via `useThemeStore().loadTheme()`.
- Page-enter animation (`pageEnter` keyframe), `key={pathname}` forces remount per route.

### 3.3 Desktop sidebar — `components/layout/Sidebar.tsx`
- Fixed left rail, collapsible 64↔220px, state persisted to `localStorage('sidebar-collapsed')`.
- Contains: logo, `<GlobalSearch/>` (when expanded), nav list, user card (initials avatar + name/email), logout.
- **Full nav order (18 items):** Dashboard, Transactions, Accounts, Calendar, Analytics, Budgets, Goals, Reports, Forecast, Personality, Tax Estimate, Salary AI, AI Chat, Recurring, One-Time, Splits, Groups, Settings.
- Active state: `bg-hover` + 3px left border in `--accent-blue` + colored text.

### 3.4 Mobile bottom nav — `components/layout/BottomNav.tsx`
- 3 primary tabs + a **"More" bottom sheet**: Home, Transactions, Analytics | More.
- "More" sheet is grouped: **FINANCE** (Accounts, Calendar, Budgets, Goals, Reports), **GROUPS & SPLITS** (Recurring, One-Time, Groups, Splits), **TOOLS** (Forecast, Personality, Tax, Salary AI, AI Chat, Settings) + Sign Out.
- Sheet: backdrop blur(2px), slide-up `cubic-bezier(0.32,0.72,0,1)`, staggered row entry, body-scroll lock, drag handle.
- Active tab: sliding pill indicator + `popIn` icon animation.

### 3.5 Global search / command — `components/layout/GlobalSearch.tsx`
- Triggered by button **or `Ctrl/⌘+K`**. Renders a centered overlay via `createPortal` (backdrop blur 4px).
- Debounced (300ms, min 2 chars) → `transactionsAPI.search(q)`. Results are transaction rows; click → `/transactions`.
- **Note:** DESIGN.md envisions ⌘K as a full AI command palette (log transactions, query data, set budgets, navigate). Current implementation is **transaction-search only** — a redesign opportunity.

### 3.6 Mobile / native bridge
- `components/CapacitorBridge.tsx`: syncs JWT to Android SharedPreferences via `FinTrackNative` plugin (`@/plugins/FinTrackNativePlugin`); listens for `fintrack:openAdd` / `fintrack:openBudgets` window events fired by Android home-screen **widgets** (Quick-Add widget, Budget widget — see `android/app/src/main/java/app/fintrack/ai/`).
- Native deep-links: widget cold-start navigates the WebView directly; warm-start dispatches the window events above.

---

## 4. State Stores (Zustand)

| Store | File | Holds | Persistence |
|---|---|---|---|
| `useAuthStore` | `store/authStore.ts` | `user {id, full_name, email, currency}`, `token`, `isLoading` | `localStorage` key `fintrack-auth` (only user+token). `setAuth`/`logout` also push/clear token to native via `FinTrackNative`. `onRehydrateStorage` clears `isLoading`. |
| `useThemeStore` | `store/themeStore.ts` | theme (`dark`/`light`) | `localStorage` `fintrack-theme`; applied to `<html data-theme>` |
| `useToastStore` | `store/toastStore.ts` | toast queue | in-memory; surfaced by `<ToastContainer/>` |

Hooks: `hooks/useWindowSize.ts` (`useIsMobile`, breakpoint 768px), `hooks/useCountUp.ts` (number roll-up animation).

Utils: `lib/utils.ts` — `formatCurrency(amount, currency)` (₹ no-decimal for INR/JPY, symbol map),
`formatDate`, `getCurrentMonthYear`, `getCategoryColor`/`getCategoryBg` (keyword→CSS-var map),
`exportToCSV` (uses Web Share API on mobile/Capacitor, data-URI anchor on desktop).

---

## 5. Design System (as IMPLEMENTED in `app/globals.css`)

> ⚠️ **CRITICAL FOR REDESIGN — the live CSS has drifted from `DESIGN.md`.** Pick one source of
> truth before starting. See §5.4 for the conflict table.

### 5.1 Color tokens (live, dark = default)
AMOLED-black theme, defined on `:root, [data-theme="dark"]`:
```
--bg-primary  #000000   --bg-secondary #0a0a0a   --bg-card #111111
--bg-hover    #1a1a1a   --bg-border    #222222   --bg-border-strong #333333
--text-primary #f5f5f5  --text-secondary #888888 --text-muted #444444
--accent-green #10b981  --accent-red #f43f5e     --accent-blue #3b82f6
--accent-yellow #f59e0b --accent-purple #a855f7  --accent-pink #ec4899
--surface-0..3 (000 → 242424)   + *-bg / *-border alpha variants
--gradient-green/red/blue/yellow  (135° stat-card gradients)
--glass-bg / --glass-border       (glassmorphism — present and used)
--shadow-card/elevated/modal/glow-*   ambient radial bg gradients (--bg-ambient-1..3)
```
Light theme (`[data-theme="light"]`) redefines all of the above (white surfaces, darker accents).

**Semantic aliases** map the DESIGN.md vocabulary onto the live vars:
`--accent-mint→green`, `--accent-rose→red`, `--accent-indigo→blue`, `--accent-amber→yellow`.

### 5.2 Type, spacing, radius (live, theme-independent `:root`)
```
--text-hero 2.5rem · --text-title 1.25rem · --text-body .9rem · --text-caption .75rem
--space-1..12  (4 → 48px, 8px base)
--radius-sm 8 · md 12 · lg 16 · xl 24
Fonts: body 'Satoshi','DM Sans'  ·  headings 'Cabinet Grotesk','Sora'  ·  numbers 'DM Mono'
```
> Note: several components still hardcode `fontFamily: 'Sora'` / `'DM Sans'` (Sidebar logo & avatar,
> BottomNav, StatsCards, GlobalSearch amounts) instead of the Cabinet Grotesk / Satoshi / DM Mono
> stack — inconsistency to clean up in redesign.

### 5.3 Keyframe library (`globals.css`)
`spin, bounce, shimmer, fadeUp, scaleIn, typingDot, pageEnter, slideInUp, popIn, numberReveal,
softPulse, budgetFill, slideInRight, springIn, sheetUp/sheetDown`. All have
`prefers-reduced-motion` opacity-only fallbacks. Utility classes: `.card-interactive` (hover lift),
`.fab-btn`, `.page-glow::before` (top gradient hairline), `.sheet-enter/exit`, `.swipe-row-exit`,
`button:active` global press-scale.

### 5.4 DESIGN.md vs. live CSS — the conflicts to resolve
| Aspect | `DESIGN.md` (intended) | `globals.css` (actual) |
|---|---|---|
| Page bg | Cold obsidian `#080c18` | AMOLED `#000000` |
| Card elevation | violet-shift, no gradients | `#111`, gradient stat cards used |
| Mint accent | `#00e5a0` (electric) | `#10b981` |
| Indigo accent | `#6366f1` | `#3b82f6` (blue) |
| Glassmorphism | **banned** except ⌘K | `--glass-*` vars defined & used |
| Headings | Cabinet Grotesk (Sora removed) | Cabinet Grotesk **with Sora fallback still live**, Sora hardcoded in places |
| Home screen | full-width "financial pulse" (52px net number, area chart, no KPI grid) | KPI **StatsCards grid** is present |
| ⌘K | full AI command palette | transaction search only |
| Currency font | DM Mono everywhere | mixed (Sora used for amounts in several components) |

**Recommendation:** treat DESIGN.md as the north star for the redesign and reconcile globals.css to it
(or formally retire DESIGN.md). Document the decision in DESIGN.md's Decisions Log.

---

## 6. Shared Component Library — `components/ui/` & `components/layout/`

| Component | File (LoC) | Role / API surface | Notable behavior |
|---|---|---|---|
| `PageShell` | layout/PageShell (69) | Standard page frame: `title`, `subtitle`, `headerRight`, children. Max-width 1200, header with bottom border, content column gap `--space-6` | Used by **almost every page** — the primary layout primitive |
| `AppLayout` | layout/AppLayout (190) | Auth chrome + FABs (see §3.2) | — |
| `Sidebar` / `BottomNav` / `GlobalSearch` | layout/ | Navigation (see §3) | — |
| `Button` | ui/Button (125) | variants `primary\|secondary\|ghost\|danger\|icon`, sizes `sm\|md\|lg`, `isLoading` spinner | Hover/press states via local state; spring transform |
| `Input` | ui/Input (51) | Labeled text input | — |
| `Modal` | ui/Modal (121) | Desktop dialog via `createPortal`→body; **on mobile delegates to `BottomSheet`**. `isOpen,onClose,title,footer,maxWidth`. Esc to close, body-scroll lock, overlay click closes, `springIn` | z-index overlay 9999 / box 10000 (per UI rules) |
| `BottomSheet` | ui/BottomSheet (140) | Mobile sheet variant of Modal | drag handle, slide-up |
| `Card` | ui/Card (43) | Surface container | — |
| `StatTile` | ui/StatTile (104) | KPI tile: `label,value,subLabel,trend,icon,accentColor,loading` | DM Mono hero value, `numberReveal`, trend pill, skeleton state |
| `DatePicker` | ui/DatePicker (261) | Custom calendar; **opens above input** (per UI rule) | portal-based |
| `Skeleton` | ui/Skeleton (46) | Shimmer loading placeholder | — |
| `EmptyState` | ui/EmptyState (57) | Icon + title + copy + optional CTA | used on every list/AI page when no data |
| `ErrorBoundary` | ui/ErrorBoundary (58) | Catches render errors, fallback UI | wraps `<main>` |
| `ToastContainer` | ui/ToastContainer (135) | Renders `useToastStore` queue | — |
| `FAB` | ui/FAB (173) | Floating action button primitive | (AppLayout currently inlines its own FABs) |
| `FadeIn` | ui/FadeIn (25) | Wrapper that fades children up on mount | used widely for staggered entry |
| `SwipeableRow` | ui/SwipeableRow (118) | Swipe-to-reveal actions (delete/edit) on mobile lists | uses `.swipe-row-exit` |
| `TransactionRow` | ui/TransactionRow (149) | Single transaction line item | icon, category color, amount in semantic color |
| `AIResponseCard` | ui/AIResponseCard (147) | Renders streamed/markdown-ish AI output blocks | used by AI Chat / Reports |
| `PageHelp` | ui/PageHelp (187) | Contextual "what is this page" help popover | on most feature pages |
| `WalkthroughTour` | ui/WalkthroughTour (297) | First-run guided tour | keyed per-user localStorage |
| `ThemeToggle` | ui/ThemeToggle (76) | Dark/light switch → `useThemeStore` | on Profile |

### Dashboard widgets — `components/dashboard/`
| Component | LoC | Feeds from |
|---|---|---|
| `StatsCards` | 146 | props (income/expenses/balance/savingsRate); gradient KPI grid, `useCountUp` |
| `TrendChart` | 74 | analytics trends (Recharts area) |
| `CategoryChart` | 76 | category breakdown (Recharts) |
| `RecentTransactions` | 75 | recent tx list |
| `BudgetAlerts` | 82 | budgets vs actual |
| `SpendingForecast` | 92 | analytics forecast |

### Feature components
| Component | LoC | Notes |
|---|---|---|
| `transactions/TransactionModal` | **833** | The biggest UI unit. Create/edit transaction: type toggle, amount, category, account, payment method, date, AI quick-add, SMS parse, image-receipt parse. Used by Transactions + Calendar pages. |
| `transactions/TransactionList` | 276 | Grouped/filterable list with swipe actions |
| `profile/BankAccountsSection` | **726** | Bank-account management embedded in Profile (largely superseded by the unified `/accounts` page) |

---

## 7. Page-by-Page Map (route → purpose → components → backend calls)

> Pattern: every authenticated page = `AppLayout` → `PageShell(title,…)` → content, with
> `Skeleton`/`EmptyState` for loading/empty. Listed below: **what it shows** and **which API calls it makes**.

### Auth group `app/(auth)/` (no AppLayout chrome)
| Route | File (LoC) | Purpose | Backend calls |
|---|---|---|---|
| `/login` | login (—) | Email+password sign-in | `authAPI.login` → on success `authStore.setAuth` |
| `/register` | register (—) | Sign-up + **OTP email verification** flow | `authAPI.register`, `authAPI.verifyEmail`, `authAPI.resendOTP` |
| `/forgot-password` | forgot-password (—) | Request reset OTP → set new password | `authAPI.forgotPassword`, `authAPI.resetPassword`, `authAPI.resendOTP` |

### Root & onboarding
| Route | File (LoC) | Purpose | Backend calls |
|---|---|---|---|
| `/` | page.tsx (25) | Splash/redirect: spinner → `/dashboard` if logged in else `/register` | none (reads authStore) |
| `/onboarding` | onboarding (362) | First-run setup: pick categories, set income/currency, seed budgets | `categoriesAPI.getAll`, `profileAPI.update`, `budgetsAPI.create` |

### Core finance
| Route | File (LoC) | Purpose | Components | Backend calls |
|---|---|---|---|---|
| `/dashboard` | dashboard (720) | **Home.** Monthly summary KPIs, trends, recent tx, budget alerts, forecast, AI report; processes due recurring on load | StatsCards, TrendChart(via), RecentTransactions, BudgetAlerts, SpendingForecast, PageHelp | `recurringAPI.process`, `analyticsAPI.summary`, `analyticsAPI.trends`, `transactionsAPI.getAll`, `budgetsAPI.getAll`, `analyticsAPI.forecast`, `aiAPI.salaryIntelligence`, `aiAPI.report` |
| `/transactions` | transactions (573) | Full transaction list + filters; add/edit modal; AI quick-add; `?add=true` auto-opens modal (used by FAB & widgets) | TransactionList, TransactionModal, Input | `transactionsAPI.getAll`, `transactionsAPI.earliest`, `aiAPI.quickAdd` (CRUD via TransactionModal) |
| `/accounts` | accounts (**912**) | **Unified net-worth view:** bank accounts + credit cards + wallets; net-worth header; CRUD all three; set-default; balance back-calc | Button, Skeleton, (inline cards) | `accountsAPI.*`, `creditCardsAPI.*`, `walletsAPI.*` (getAll/create/update/delete + setDefault) |
| `/calendar` | calendar (250) | Month calendar of transactions; tap day → details/modal | DatePicker(?), TransactionModal, EmptyState | `transactionsAPI.getAll` |
| `/analytics` | analytics (581) | Charts: category breakdown, trends, yearly, payment-method pie; AI salary allocation & regret patterns | Skeleton, EmptyState, PageHelp, (Recharts) | `analyticsAPI.summary/trends/yearly/paymentMethods`, `transactionsAPI.getAll`, `accountsAPI.getAll`, `aiAPI.salaryAllocation`, `aiAPI.regretPatterns` |
| `/budgets` | budgets (267) | Monthly budget vs actual per category; create/delete | EmptyState, PageHelp, FadeIn, Button | `budgetsAPI.getAll/create/delete`, `categoriesAPI.getAll` |
| `/goals` | goals (481) | Savings goals (progress, add funds) + **AI life-event** plans | Modal, Input, DatePicker, EmptyState, FadeIn | `goalsAPI.getAll/create/update/addFunds/delete`, `aiAPI.lifeEvent` |
| `/recurring` | recurring (404) | Recurring income/expenses; toggle active; **AI pattern detection** to suggest recurring | Input, EmptyState, PageHelp, FadeIn | `recurringAPI.getAll/create/update/toggle/delete`, `categoriesAPI.getAll`, `aiAPI.detectPatterns` |
| `/one-time-expenses` | one-time-expenses (798) | Trip/event budgets with **itemized day-by-day items that create real transactions** | Button, EmptyState, FadeIn | `categoriesAPI.getAll` + **direct `/api/one-time-expenses` & `/items` calls** (not in typed client) |

### Groups & splits
| Route | File (LoC) | Purpose | Backend calls |
|---|---|---|---|
| `/groups` | groups (744) | Expense groups: members, group splits with shares, settlements, link/unlink transactions | `groupsAPI.*` (getAll/get/create/update/delete/addSplit/updateSplit/settleShare/settlements/link/unlink), `transactionsAPI.search` |
| `/splits` | splits (313) | Lightweight one-off bill splitting with **AI parse-split** (free-text → participants/amounts) | `splitsAPI.getAll/create/update/settle/delete`, `aiAPI.parseSplit` |

### AI / insight tools
| Route | File (LoC) | Purpose | Backend calls |
|---|---|---|---|
| `/reports` | reports (381) | AI monthly/health reports for a date range; date-range picker | `analyticsAPI.report`, `aiAPI.healthReport` |
| `/forecast` | forecast (330) | AI forecast calendar (predicted upcoming spend) | `aiAPI.forecastCalendar` |
| `/personality` | personality (399) | AI "spending personality" profile | `aiAPI.personality` |
| `/tax-estimate` | tax-estimate (376) | AI tax estimation | `aiAPI.taxEstimate` |
| `/salary-intelligence` | salary-intelligence (356) | AI salary analysis | `aiAPI.salaryIntelligence` |
| `/ai-chat` | ai-chat (332) | Free-form finance chat with history; renders via `AIResponseCard` | `aiAPI.chat(message, history)` |

### Settings
| Route | File (LoC) | Purpose | Backend calls |
|---|---|---|---|
| `/profile` | profile (221) | Profile edit, currency, password change, theme toggle, bank-accounts section | `profileAPI.get/update/changePassword` (+ `BankAccountsSection`) |

---

## 8. Cross-Cutting UI/UX Rules (enforced today — keep or consciously change)

From `FinTrack_Documentation.md` (the project superprompt) and observed in code:
- **Inline styles only**, colors only via CSS variables. No Tailwind `className`.
- **All modals/overlays via `createPortal(content, document.body)`** with a `mounted` SSR guard.
  z-index: overlay **9999**, box **10000**. Overlay click closes; inner uses `stopPropagation`. Esc closes. Body-scroll locked while open.
- **Mobile = BottomSheet**, desktop = centered Modal (the `Modal` component switches automatically).
- DatePicker **opens above** its input. Bottom sheets block the background.
- Sidebar collapse + theme persist to `localStorage`.
- **Currency formatting:** `₹ + Math.round(n).toLocaleString('en-IN')` — never `.toFixed()`. INR/JPY have no decimals.
- Mobile must work under `capacitor://localhost`; all `<button>`s need `type="button"` to avoid accidental form submits.
- Heavy AI responses are cached server-side (6h) — UI offers `?force=true` refresh on AI pages and `aiAPI.clearCache`.
- `prefers-reduced-motion` respected via keyframe fallbacks.
- Safe-area insets honored (notch/home-indicator) throughout.

---

## 9. Redesign Checklist (what must survive a full reskin)

**Routes (don't drop any):** the 18 sidebar destinations + `(auth)` + `/onboarding` + `/` redirect.

**Feature preservation (mandatory — from superprompt):** Auth+OTP, Transactions w/ payment method,
AI Chat, Forecast, Personality, Salary Intelligence, Groups & Splits, Bank Accounts (balance-as-of +
real-balance override), One-Time Expenses (itemized → real transactions), unified Accounts page,
Credit Cards (utilization/due-date), Wallets, mobile experience + Android widgets.

**Data contracts to keep:** every method in `lib/api.ts` (§2). The redesign can change *presentation*
freely but must keep calling the same endpoints with the same shapes, or coordinate backend changes.

**Mobile/native integration to preserve:** Capacitor JWT sync, widget deep-links
(`fintrack:openAdd` / `fintrack:openBudgets`, `?add=true`), Web-Share CSV export, safe-area handling,
`type="button"` discipline, BottomSheet-on-mobile modal switch.

**Decisions to make before building:**
1. Resolve the **DESIGN.md ↔ globals.css** divergence (§5.4) — choose one palette/type/home-layout direction.
2. Decide whether to deliver the intended **financial-pulse home** (vs. current KPI grid) and the **⌘K AI command palette** (vs. current search-only).
3. Consolidate the duplicated bank-account UI (`/accounts` page vs. `profile/BankAccountsSection`).
4. Standardize fonts — remove stray `Sora`/`DM Sans` hardcodes in favor of the token stack.

---

## 10. File Reference Index

```
frontend/
├─ app/
│  ├─ layout.tsx              root layout, fonts, theme bootstrap, CapacitorBridge
│  ├─ page.tsx                splash → redirect
│  ├─ globals.css             ★ design tokens + keyframes (live source of truth)
│  ├─ (auth)/{login,register,forgot-password}/page.tsx
│  ├─ onboarding/page.tsx
│  └─ {dashboard,transactions,accounts,calendar,analytics,budgets,goals,
│      recurring,one-time-expenses,groups,splits,reports,forecast,personality,
│      tax-estimate,salary-intelligence,ai-chat,profile}/page.tsx
├─ components/
│  ├─ layout/   AppLayout, Sidebar, BottomNav, GlobalSearch, PageShell
│  ├─ ui/       Button, Input, Modal, BottomSheet, Card, StatTile, DatePicker,
│  │            Skeleton, EmptyState, ErrorBoundary, ToastContainer, FAB, FadeIn,
│  │            SwipeableRow, TransactionRow, AIResponseCard, PageHelp,
│  │            WalkthroughTour, ThemeToggle
│  ├─ dashboard/ StatsCards, TrendChart, CategoryChart, RecentTransactions,
│  │             BudgetAlerts, SpendingForecast
│  ├─ transactions/ TransactionModal (833 LoC), TransactionList
│  ├─ profile/  BankAccountsSection (726 LoC)
│  └─ CapacitorBridge.tsx
├─ lib/         api.ts (★ data contract), utils.ts
├─ store/       authStore, themeStore, toastStore
├─ hooks/       useWindowSize (useIsMobile), useCountUp
├─ plugins/     FinTrackNativePlugin (Capacitor native bridge)
└─ android/     Capacitor Android shell + home-screen widgets
```
`★` = read these first when starting the redesign.

---

*Companion docs: `DESIGN.md` (intended design system), root `FinTrack_Documentation.md` (dev
superprompt + backend route/schema reference), `docs/FINTRACK_DOCUMENTATION.md`, `docs/CHANGELOG.md`.*
