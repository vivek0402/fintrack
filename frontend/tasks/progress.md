# Redesign Progress

## Phase 1 — Design System (globals.css) — DONE

Rewrote `frontend/app/globals.css` completely:

- **Fonts**: kept `--font-display` (Cabinet Grotesk), `--font-body` (Satoshi), `--font-mono` (DM Mono) — already loaded via `<link>` tags in layout.tsx, so no `@import` added (avoids double-loading).
- **Typography scale**: added `--text-display` (52px), `--text-h1` (28px), `--text-h2` (20px), `--text-h3` (16px), `--text-label` (11px), `--text-body` (14px), `--text-caption` (12px).
- **Spacing scale**: added `--space-1` through `--space-16` (4/8/12/16/20/24/32/40/48/64px).
- **Radius/transitions**: kept existing `--radius-sm/md/lg/xl/full` and `--transition-fast/base`.
- **Dark theme (AMOLED)**: kept existing `--bg-base #0a0a0a`, `--bg-surface-1/2/3`, `--border-subtle/visible`, `--text-primary/secondary/muted/inverse`, `--color-inc/exp/warn` (+subtle), `--accent` (+subtle/border), `--shadow-card/modal`. Added `--cat-0..7` category palette for analytics charts.
- **Light theme**: same structure with `#f8f8f8` base.
- **Compat alias layer** (per-theme, both dark and light): added definitions for ALL legacy variable names found in use across ~30+ unrebuilt pages that were previously UNDEFINED — `--bg-page`, `--bg-card`, `--bg-alt`, `--bg-hover`, `--border`, `--border-strong`, `--accent-light`, `--accent-tint`, `--accent-2`, `--accent-3`, `--accent-blue`, `--accent-red`, `--accent-mint`, `--accent-rose`, `--accent-indigo`, `--accent-amber`, `--text-faint`, `--font-head`, `--shadow-elevated`, `--bg-glow`, `--surface-1`. All mapped onto the new token system (or sensible derived values for `--accent-3`/`--bg-glow`).
  - **Decision**: this fixes a pre-existing bug — these vars were referenced in 20+ files but never defined anywhere, meaning those pages were silently falling back to browser defaults (transparent/inherit). The compat layer both satisfies the "don't break unrebuilt pages" requirement AND fixes this latent bug as a side effect.
- **Body rule**: `font-family: Satoshi, background: var(--bg-base), color: var(--text-primary)` — matches spec.
- Preserved all existing keyframes (spin, bounce, sheetUp/Down, shimmer, fadeUp, scaleIn, typingDot, pageEnter, slideInUp, popIn, numberReveal, softPulse, budgetFill, slideInRight, springIn) and utility classes (`.fab-btn`, `.card-interactive`, `.modal-enter`, `.page-enter`, `.sheet-enter/exit`, `.swipe-row-exit`, number input spinner removal, scrollbar styling).
- `[data-palette="X"]` dead architecture (mentioned in old header comment but never implemented) fully removed — confirmed only `data-theme` (dark/light) is used anywhere.

### Files touched in Phase 1
- `frontend/app/globals.css` (full rewrite)

## Phase 2 — Foundation Components — DONE

- **Button.tsx**: rewrote sizing — exact heights 32/40/48px (sm/md/lg) via `height` instead of padding-derived sizing; kept 5 variants (primary/secondary/ghost/danger/icon — kept `icon` as it's used widely across unrebuilt pages). Loading state now renders ONLY a centered spinner (16px for md/lg, 14px for sm) replacing children — removed "Loading..." text per spec. Remapped `--bg-alt`/`--bg-hover`/`--border`/`--accent-light` → `--bg-surface-2`/`--bg-surface-3`/`--border-subtle`/`--accent-subtle`.
- **Input.tsx**: added `hint` and `suffix` props (prefix already existed as `icon`, aliased to new `prefix` name too). Height fixed at 40px, remapped `--bg-alt`/`--border` → `--bg-surface-2`/`--border-subtle`, label now uses `--text-label` uppercase style per spec.
- **Skeleton.tsx**: remapped shimmer gradient from `--bg-card`/`--bg-hover` → `--bg-surface-1`/`--bg-surface-3`. Added `SkeletonNumber` (120×32, radius 6) for currency placeholders.
- **Modal.tsx**: overlay darkened to `rgba(0,0,0,0.7)`, card now `--bg-surface-1` / `--border-subtle` / `--radius-lg` / `--shadow-modal`, replaced `springIn 380ms` with `scaleIn 150ms`, body padding now flat `24px`, header title uses `--text-h2`.
- **BottomSheet.tsx**: remapped `--bg-card`/`--border` → `--bg-surface-1`/`--border-subtle`/`--border-visible`, corner radius now `var(--radius-lg)` (16px) instead of hardcoded 20px. Kept existing drag-to-close gesture logic and `sheetUp/sheetDown` 250/220ms animations (already close to spec's 250ms slideUp).
- **EmptyState.tsx**: reviewed — already uses `--space-*` scale and `slideInUp`/`popIn` animations matching spec; no changes needed.

### Files touched in Phase 2
- `frontend/components/ui/Button.tsx`
- `frontend/components/ui/Input.tsx`
- `frontend/components/ui/Skeleton.tsx`
- `frontend/components/ui/Modal.tsx`
- `frontend/components/ui/BottomSheet.tsx`

### Next: Phase 3 — Navigation redesign (AppLayout, Sidebar, BottomNav)

## Phase 3 — Navigation Redesign — DONE

- **Sidebar.tsx**: full rewrite. Fixed 240px width (collapse toggle removed entirely). Wordmark "Fin" (bold, `--text-primary`) + "Track" (medium, `--accent`). Replaced the flat 25-item list + Debt/Planning sections with 4 labeled groups (~11 items total):
  - **Track**: Dashboard, Transactions, Budgets
  - **Understand**: Analytics, Net Worth, Calendar
  - **Grow**: Goals, Investments, Debt (→ `/debt-intelligence`)
  - **Tools**: AI Advisor, Settings (→ `/profile`)
  - **Decision**: ~30 pages (accounts, tax, recurring, splits, loans, insights, wealth-intelligence, forecast, personality, etc.) are no longer in the sidebar. They remain fully functional (routes untouched, compat CSS aliases keep them styled) and are reachable via `GlobalSearch` (still rendered at the top of the sidebar) or direct links from other pages. This is a deliberate simplification per the spec's "~11 items instead of 25+" requirement — flagged here in case the user wants some of these re-added or wants a dedicated "all pages" entry point.
- **BottomNav.tsx**: reduced from 3 tabs + multi-section sheet to spec's 4 tabs — Home (`/dashboard`), Money (`/transactions`), Insights (`/analytics`), More. The "More" sheet is now a single 2-column grid (10 items: Budgets, Calendar, Goals, Net Worth, Investments, Recurring, AI Advisor, Splits, Tax, Profile) instead of 6 labeled sections — kept the existing drag-to-close gesture logic and animation timings (sheetUp/sheetDown 250/220ms) since they already matched spec.
- **AppLayout.tsx**: removed the `page-glow` radial-gradient background entirely (and the `buildGlowBackground` helper using `--bg-glow`) — background is now flat `var(--bg-base)`. Removed sidebar collapse state/localStorage persistence (`sidebar-collapsed`, `setSidebarWidth`) since the sidebar is now fixed-width. Desktop content area: `margin-left: 240px`, inner wrapper `max-width: 1280px`, `margin: 0 auto`, `padding: 32px 40px`. Mobile: full width, `padding: 16px 16px calc(160px + safe-area)`. Remapped FAB tooltip/shadow colors from `--bg-card`/`--border`/`--accent-tint`/`--accent-2/3` → `--bg-surface-1`/`--border-subtle`/`--accent-subtle`/`--accent` (AI chat FAB gradient simplified to solid `--accent`). Kept Capacitor back-button handling, push notifications, offline queue sync, WalkthroughTour, ToastContainer, RedesignAnnouncement, error boundaries — all preserved, only layout chrome changed.

### Files touched in Phase 3
- `frontend/components/layout/Sidebar.tsx` (full rewrite)
- `frontend/components/layout/BottomNav.tsx` (full rewrite)
- `frontend/components/layout/AppLayout.tsx` (layout structure + FAB styling)

### Next: Phase 4 — Auth pages (register, login, verify-otp)

## Phase 4 — Auth Pages — DONE

- **login/page.tsx**: full rewrite. Removed gradient background + ambient glow blobs + custom `inputStyle()` helper. Now `var(--bg-base)` flat background, centered card (`--bg-surface-1`, `--border-subtle`, `--radius-lg`, `--shadow-card`, max-width 420px). Wordmark "Fin"+"Track", "Welcome back" / "Sign in to your account" headings using `--text-h1`/`--font-display`. Uses shared `Input` (email + password with show/hide toggle via `suffix`) and `Button` (size `lg`, `isLoading`). "Forgot password?" link and "New to FinTrack? Create account" link in `--accent`. Error banner uses `--color-exp-subtle`/`--color-exp`.
- **register/page.tsx**: full rewrite, same card/wordmark treatment. Register step uses shared `Input`/`Button` for Full Name/Email/Password (with show/hide toggle), password-strength bar remapped to `--color-exp`/`--color-warn`/`--accent`/`--color-inc`. OTP verify step keeps existing 6-box auto-advance/paste logic, boxes restyled with `--bg-surface-2`, `--border-subtle`/`--accent`, `--radius-md`, focus ring via `color-mix`. Resend cooldown and "Back" control preserved.
- **forgot-password/page.tsx**: already used shared `Input`/`Button` — replaced all hardcoded colors (`var(--bg-primary)`, `var(--bg-secondary)`, `var(--bg-border)`, `#00e5a0`, `#f87171`, `rgba(...)` literals) with token equivalents (`--bg-base`, `--bg-surface-1`, `--border-subtle`, `--accent`/`--accent-subtle`/`--accent-border`, `--color-exp`/`--color-exp-subtle`, `--color-inc`/`--color-inc-subtle`). Added matching wordmark header. All 3 steps (email/otp/done) now match login/register visual language.
- **Decision**: no separate `verify-otp` route exists or is needed — OTP verification is a step within `register`'s flow (`step === 'verify'`) and within `forgot-password`'s flow (`step === 'otp'`), both already wired to `authAPI.verifyEmail`/`resetPassword`/`resendOTP`. The spec's "verify-otp" page is covered by these embedded steps.

### Files touched in Phase 4
- `frontend/app/(auth)/login/page.tsx` (full rewrite)
- `frontend/app/(auth)/register/page.tsx` (full rewrite)
- `frontend/app/(auth)/forgot-password/page.tsx` (color/token remap + wordmark)

### Next: Phase 5 — Onboarding page

## Phase 5 — Onboarding — DONE

- **onboarding/page.tsx**: full rewrite. Removed gradient/glow background, custom card → `var(--bg-base)` + centered `--bg-surface-1` card (max-width 440px, `--radius-lg`, `--shadow-card`). Removed the entire "Choose Your Colour" palette step (previously step 3 of 5, used `PaletteName`/`setPalette`/`data-palette` and a 5-swatch accent picker with live preview).
  - **Decision**: Phase 1 confirmed `[data-palette="X"]` CSS was dead/unused and removed it from globals.css, so the palette step's "live preview" no longer changes anything visually — it just sets a no-op `data-palette` attribute. Removing it also aligns with the absolute rule of exactly two themes (dark/light) with no other naming schemes. Wizard is now 4 steps: Welcome → Currency → Theme → Budgets. `useThemeStore`'s `palette`/`setPalette`/`PaletteName` are left in place (still used by `applyAttributes`/localStorage) since `frontend/app/profile/page.tsx` (Phase 12) may still reference them — flagged for review when that page is rebuilt.
  - Step-dot indicator restyled with `--accent` (current), `--color-inc` (completed), `--border-visible` (upcoming).
  - All 4 steps recolored to tokens (`--bg-surface-1/2/3`, `--border-subtle`, `--accent`/`--accent-subtle`/`--accent-border`, `--text-primary/secondary/muted`, `--color-warn`/`--color-inc`). Theme step's device-preview swatches keep raw `#000`/`#f8f8f8`/`#1a1a1a`/`#ffffff` as they represent the actual theme colors being chosen, not UI chrome. Replaced custom submit buttons with shared `Button` (size `lg`, `isLoading`). Currency grid, theme cards, and budget category rows all retain their original interaction logic.

### Files touched in Phase 5
- `frontend/app/onboarding/page.tsx` (full rewrite, palette step removed)

### Next: Phase 6 — Dashboard rebuild

## Phase 6 — Dashboard — DONE

- **dashboard/page.tsx**: restructured render (all data-fetching/state logic preserved verbatim).
  - **Hero**: replaced the old 3-column "This Month / 6-month trend / AI Insight" hero with a single dominant **Net Position** card — large `56px`/`var(--text-display)` mono number (this month's net), `+/− this month` badge, income/expense breakdown line, all on `var(--accent-subtle)` / `var(--accent-border)`.
  - **Sparkline**: replaced the line/area `SparklineChart` with a new `SixBarSparkline` — grouped income/expense bar pairs per month (6 months), current month highlighted at full opacity, others at 55%. Lives inside the hero card under the net-position number.
  - **AI Insight**: demoted from a hero column to its own compact full-width card (`--bg-surface-1`) below the Health Score widget, with the "Generate Report" button inline.
  - **3-column grid** (desktop `repeat(3,1fr)`, mobile stacked `1fr`): **Budgets** (unchanged content, in a card), **Top Categories** (new — derived from `budgets` sorted by `spent` desc, top 5, each with a colored dot + progress bar, links to `/analytics`), **Recent Transactions** (unchanged content, now in a bordered card matching the other two columns instead of a bare list).
  - **Token migration**: replaced all legacy/compat vars throughout the page — `--font-head`→`--font-display`, `--bg-card`→`--bg-surface-1`, `--border`→`--border-subtle`, `--bg-alt`→`--bg-surface-2`, `--bg-hover`→`--bg-surface-3`, `--accent-light`→`--accent-subtle`, `--text-faint`→`--text-muted` (including inside `color-mix()` tints for stat tiles).
  - Stat tiles, Net Worth/Wealth/Debt widgets, Health Score widget, Coach Alerts, Regret Check sheet, Weekly Briefing, Opportunities, and Debt alert banners all preserved as-is (positions unchanged relative to each other, just sit below the new hero).

### Files touched in Phase 6
- `frontend/app/dashboard/page.tsx` (render restructure: dominant hero, 6-bar sparkline, 3-column budgets/categories/transactions, full token migration)

### Next: Phase 7 — Transactions page rebuild

## Phase 7 — Transactions — DONE

- **TransactionList.tsx**: full rewrite, same grouping/delete/undo/regret logic preserved.
  - Date-group headers now `position: sticky, top: 0, zIndex: 2, background: var(--bg-surface-1)` (requires scrollable ancestor — added in page.tsx).
  - Added `fmt = (n) => '₹' + Math.round(n).toLocaleString('en-IN')` for mobile amount display per currency rule.
  - Fixed several previously-undefined legacy vars (`--bg-border`, `--accent-green/red/yellow`, `--accent-red-bg/border`, `--accent-blue-bg/blue`) by migrating to canonical tokens + `color-mix()` (e.g. `var(--color-exp-subtle)`, `color-mix(in srgb, var(--color-exp) 25%, transparent)`).
  - Mobile/desktop rows, swipeable actions, regret button, delete-confirm UI, tags, category/payment tags all remapped to `--bg-surface-1/2/3`, `--border-subtle`, `--color-inc/exp/warn`, `--accent`/`--accent-subtle`/`--accent-border`.
- **transactions/page.tsx**: token migration — header card, toolbar buttons (Export/Import/Select/Quick Add), select-all bar, and Quick Add modal (`--bg-card`→`--bg-surface-1`, `--border`→`--border-subtle`, `--accent-tint`→`--accent-subtle`, `--bg-alt`→`--bg-surface-2`) all remapped to canonical tokens. List container gained `maxHeight: '70vh', overflowY: 'auto'` to enable sticky group headers; load-more border remapped.
- **Decision**: `AdvancedSearchBar`, `TransactionModal`, `BulkOpsPanel`, `BankStatementImporter` were not modified — they already use compat-aliased vars which now resolve correctly via the Phase 1 alias layer, so no visual regressions. Deeper rebuilds of these can be revisited in Final Steps if needed.

### Files touched in Phase 7
- `frontend/components/transactions/TransactionList.tsx` (full rewrite)
- `frontend/app/transactions/page.tsx` (token migration, scroll container for sticky headers)

### Next: Phase 8 — Analytics page rebuild

## Phase 8 — Analytics — DONE

- **analytics/page.tsx**: full rewrite, all data-fetching/derived-state logic preserved (added `incVsLastMonth` and `incomeAreaData` derived values for the new Income tab).
  - Restructured into 4 tabs (**Overview / Spending / Income / Trends**) via pill-style tab bar below the header, matching the spec's tabbed Analytics requirement.
    - **Overview**: period pills + 2×2 KPI grid, Income vs Expenses area chart, Bank Balances.
    - **Spending**: Spending breakdown (donut + list), Weekly Spending Pattern bar chart, Payment Methods, Category Trajectory (collapsible), Spending Heatmap (collapsible).
    - **Income**: new income KPIs (Total Income, vs Last Month), new Income Trend area chart, Year-over-Year comparison, AI Salary Allocation Plan (moved here from the old single-column layout).
    - **Trends**: Money Flow Sankey (collapsible), Regret Score, Purchase Regret Analysis (collapsible).
  - **Token migration**: `--bg-card`→`--bg-surface-1`, `--border`→`--border-subtle`, `--bg-alt`/`--bg-hover`→`--bg-surface-2`/`--bg-surface-3`, `--font-head`→`--font-display`, `--accent-light`/`--accent-tint`→`--accent-subtle`, `--text-faint`→`--text-muted`, `--accent-2`→`--accent`. `readChartColors()` now reads canonical tokens (`--color-inc`, `--accent`, `--accent-subtle`, `--border-subtle`, `--text-muted`, `--bg-surface-1`) and re-runs on `theme` change only (removed dead `palette` dependency).
- **Decision**: `SpendingHeatmap`, `SankeyFlow`, `CategoryTrajectory`, `RegretAnalysis` sub-components were not modified — they render via compat-aliased vars which resolve correctly through the Phase 1 alias layer.

### Files touched in Phase 8
- `frontend/app/analytics/page.tsx` (full rewrite: tabbed layout, new Income tab content, full token migration)

## Phase 9 — Budgets — DONE

- **budgets/page.tsx**: full token migration, all existing logic preserved (smart suggestions, rollover toggles, zero-based mode, health filter chips, inline edit/delete, over-budget alert banner).
  - **Token migration**: `inputSt`/`labelSt`/`iconBtn` and every section (header card, summary GCards, overall progress card, zero-based banner, over-budget alert banner, empty states, budget category cards, Add Budget modal) migrated `--bg-card`→`--bg-surface-1`, `--border`→`--border-subtle`, `--bg-alt`→`--bg-surface-2`, `--font-head`→`--font-display`, `--accent-light`/`--accent-tint`→`--accent-subtle`, `--accent-2`→`--accent`.
  - **Layout**: restructured the "Budget Categories" list from a single-column `flex-direction: column` list into a responsive grid — `gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)'` — per the Phase 9 spec ("2-column budget cards with progress bars"). Alert bars (zero-based banner, over-budget banner, smart suggestions banner) remain full-width above the grid.
- **Decision**: `SuggestionsBanner`/`SuggestionItem` component (`frontend/components/budgets/SuggestionsBanner.tsx`) was not modified — compat aliases render it correctly and it was out of scope for this pass.

### Files touched in Phase 9
- `frontend/app/budgets/page.tsx` (full token migration, 2-column budget card grid)

## Phase 10 — Goals — DONE

- **goals/page.tsx**: full token migration + new circular SVG progress ring component, all existing logic preserved (create/edit/delete goals, add/withdraw funds, AI life event planner).
  - New `CircularProgress({ pct, color, size })` component: SVG ring (stroke-dasharray/dashoffset) with the percentage centered inside, replacing the old inline "% saved" text block + linear `ProgressBar` on each goal card per the Phase 10 spec ("Cards with circular SVG progress rings"). Ring color uses `var(--color-inc)` when complete, else the goal's custom color or `var(--accent)`.
  - Goal card top row restructured: ring (56px) on the left, name/emoji/deadline/monthly-savings-needed text to the right (previously a separate right-aligned `%` block).
  - `ProgressBar` import retained — still used by the "Overall Progress" summary card.
  - **Token migration**: `inputSt`/`labelSt`/`outlineBtn`/`iconBtn` and all sections (header card, overall progress card, AI life event strip, goal cards, all 4 modals — New Goal, Edit Goal, Add Funds, AI Life Event) migrated `--bg-card`→`--bg-surface-1`, `--border`→`--border-subtle`, `--bg-alt`→`--bg-surface-2`, `--font-head`→`--font-display`, `--accent-light`→`--accent-subtle`.

### Files touched in Phase 10
- `frontend/app/goals/page.tsx` (full token migration, new `CircularProgress` ring component on goal cards)

## Phase 11 — Calendar — DONE

- **calendar/page.tsx**: token migration only — all logic (month nav, swipe gestures, heat-map cell coloring, day detail panel/bottom-sheet, recurring/forecast overlays) preserved verbatim. The existing month-grid layout (per-day dots/net amounts, day detail sheet/popover) already matched the Phase 11 spec, so no structural changes were needed.
  - **Token migration** (header card, stat chips, legend, calendar grid + cells, day-of-week header, desktop day-detail panel, `DayDetail` component): `--bg-card`→`--bg-surface-1`, `--border`→`--border-subtle`, `--bg-alt`→`--bg-surface-2`, `--bg-hover`→`--bg-surface-3`, `--accent-light`→`--accent-subtle`, `--font-head`→`--font-display`.

### Files touched in Phase 11
- `frontend/app/calendar/page.tsx` (full token migration)

## Phase 12 — Remaining pages — DONE

Token migration pass (per spec: "consistent design system, no new visual patterns") across the remaining pages named in the redesign brief:

- `frontend/app/ai-chat/page.tsx` — already on canonical tokens, no changes needed.
- `frontend/app/recurring/page.tsx`, `frontend/app/splits/page.tsx`, `frontend/app/forecast/page.tsx`, `frontend/app/tax-estimate/page.tsx` — token migration: `--bg-card`→`--bg-surface-1`, `--border`→`--border-subtle`, `--bg-alt`→`--bg-surface-2`, `--bg-hover`→`--bg-surface-3`, `--accent-light`→`--accent-subtle`, `--font-head`→`--font-display`.
- `frontend/app/reports/page.tsx`, `frontend/app/personality/page.tsx` — same migration plus `--accent-2`→`--accent`. `--accent-3` (personality page) left as-is — it's a distinct compat-aliased purple accent, not part of the canonical remap.
- `frontend/app/profile/page.tsx` — same token migration, plus removed the dead in-page `PaletteDropdown`/`PALETTE_DEFS` component and its `palette`/`setPalette` usage (a duplicate, unused 5-colour accent picker left over from the pre-redesign palette system). The dark/light `Mode` toggle (using `useThemeStore().theme`/`setTheme`) is untouched and remains the only appearance control on this page. Removed now-unused `useRef`, `ChevronDown`, `Check`, `PaletteName` imports.
- **Decision**: `themeStore.ts`'s `palette`/`setPalette`/`PaletteName` API, `ThemePicker.tsx`, `RedesignAnnouncement.tsx`, and `dashboard/page.tsx`'s `palette` usage were left untouched — they're outside the 8 named Phase 12 pages and removing them is a larger cross-cutting change than this pass's scope.

### Files touched in Phase 12
- `frontend/app/recurring/page.tsx`, `frontend/app/reports/page.tsx`, `frontend/app/splits/page.tsx`, `frontend/app/profile/page.tsx`, `frontend/app/tax-estimate/page.tsx`, `frontend/app/forecast/page.tsx`, `frontend/app/personality/page.tsx` (token migration; profile also had dead palette-picker code removed)

## Final Review — DONE

### CSS variable audit

Compared every `var(--xxx)` referenced across `app/**/*.tsx` and `components/**/*.tsx` against the tokens/aliases defined in `globals.css`. Found 20 referenced-but-undefined variables (most from pre-redesign dashboard components and auth pages that reference convenience aliases never added to the new token system). Added the following compat aliases to **both** `[data-theme="dark"]` and `[data-theme="light"]` blocks in `globals.css`, following the existing alias pattern (mapping onto canonical tokens, with `color-mix()` for tinted borders/gradients):

- `--space-7: 28px` (used by all 4 auth pages + onboarding)
- `--surface-2` → `var(--bg-surface-2)`
- `--bg-secondary` → `var(--bg-surface-2)`
- `--bg-border` → `var(--border-subtle)`
- `--bg-border-strong` → `var(--border-visible)`
- `--text-hero` → `var(--text-display)`
- `--transition-slow: all 0.32s ease`
- `--accent-blue-bg` → `var(--accent-subtle)`, `--accent-blue-border` → `var(--accent-border)`
- `--accent-green` → `var(--color-inc)`, `--accent-green-bg` → `var(--color-inc-subtle)`, `--accent-green-border` → `color-mix(in srgb, var(--color-inc) 25%, transparent)`
- `--accent-red-bg` → `var(--color-exp-subtle)`, `--accent-red-border` → `color-mix(in srgb, var(--color-exp) 25%, transparent)`
- `--accent-yellow` → `var(--color-warn)`, `--accent-yellow-bg` → `var(--color-warn-subtle)`, `--accent-yellow-border` → `color-mix(in srgb, var(--color-warn) 25%, transparent)`
- `--gradient-green`/`--gradient-red`/`--gradient-yellow` → diagonal `linear-gradient()` tints of `--color-inc`/`--color-exp`/`--color-warn`

Also earlier in this Final phase, added `--color-info: #0891b2` and `--color-info-subtle` (0.12 dark / 0.10 light, matching the `--color-warn` opacity convention) — referenced extensively (calendar legend/recurring dots, goals AI life-event strip, forecast, recurring, splits, insights, milestones, ai-advisor, savings-plan, wealth-intelligence) but previously undefined.

Re-ran the audit after these additions: **zero undefined CSS variables remain** across the entire `app/` and `components/` tree.

### Hardcoded hex/px spot-check

Spot-checked all 12 rebuilt pages plus a sample of out-of-scope pages. Remaining hardcoded hex values are intentional, semantic exceptions (consistent with the existing `--cat-0..7` palette pattern), not oversights:
- `goals/page.tsx` — `GOAL_COLORS` swatch palette (user-selectable per-goal accent color, persisted to DB).
- `calendar/page.tsx` — `#f97316` (orange) "Bill Due" legend/dot color, a distinct semantic marker separate from income/expense tokens.
- `personality/page.tsx` — `--accent-3: #7c3aed`, the pre-existing distinct purple compat alias (left as-is per Phase 12 decision).

### Per-phase checklist

| Phase | Scope | Status |
|---|---|---|
| 1 | globals.css token system + compat aliases | ✅ Done |
| 2 | Foundation components (Button, Input, Modal, BottomSheet, Skeleton) | ✅ Done |
| 3 | Navigation (Sidebar, BottomNav, AppLayout) | ✅ Done |
| 4 | Auth pages (login, register, forgot-password) | ✅ Done |
| 5 | Onboarding | ✅ Done |
| 6 | Dashboard | ✅ Done |
| 7 | Transactions | ✅ Done |
| 8 | Analytics (Overview/Spending/Income/Trends tabs) | ✅ Done |
| 9 | Budgets (alert bars, 2-col grid, progress bars) | ✅ Done |
| 10 | Goals (circular SVG progress rings) | ✅ Done |
| 11 | Calendar (month grid, day detail) | ✅ Done |
| 12 | AI Chat, Recurring, Reports, Splits, Profile, Tax Estimate, Forecast, Personality | ✅ Done |
| Final | CSS var audit, hex/px spot-check, progress.md summary | ✅ Done |

Absolute rules verified across all touched files: inline styles only, CSS-var color references, `'₹' + Math.round(n).toLocaleString('en-IN')` currency formatting, `'use client'` on every page, two-theme (`dark`/`light`) `data-theme` system with `localStorage['fintrack-theme']`, portal-based modals/overlays, Skeleton-only loading states (Button spinner excepted).

### Out-of-scope items (documented, intentionally untouched)
- `themeStore.ts`'s dead `palette`/`setPalette`/`PaletteName` API (5-color ember/ocean/violet/forest/rose system), `ThemePicker.tsx`, `RedesignAnnouncement.tsx`, and `dashboard/page.tsx`'s `palette` usage.
- Backend files — not touched, per absolute rule 4.

## REDESIGN COMPLETE

Every file touched across all 12 phases + Final review:

**Foundation / globals**
- `frontend/app/globals.css`

**Components**
- `frontend/components/ui/Button.tsx`, `Input.tsx`, `Modal.tsx`, `BottomSheet.tsx`, `Skeleton.tsx`
- `frontend/components/layout/Sidebar.tsx`, `BottomNav.tsx`, `AppLayout.tsx`

**Pages**
- `frontend/app/(auth)/login/page.tsx`, `register/page.tsx`, `forgot-password/page.tsx`
- `frontend/app/onboarding/page.tsx`
- `frontend/app/layout.tsx`
- `frontend/app/dashboard/page.tsx`
- `frontend/app/transactions/page.tsx` (+ `components/transactions/TransactionList.tsx`)
- `frontend/app/analytics/page.tsx`
- `frontend/app/budgets/page.tsx`
- `frontend/app/goals/page.tsx`
- `frontend/app/calendar/page.tsx`
- `frontend/app/recurring/page.tsx`, `reports/page.tsx`, `splits/page.tsx`, `profile/page.tsx`, `tax-estimate/page.tsx`, `forecast/page.tsx`, `personality/page.tsx`
- `frontend/app/ai-chat/page.tsx` (verified, no changes needed)

No backend files were modified. Nothing was committed or pushed — all changes are staged in the working tree for user review.
