# FinTrack UI Redesign — Todo

All 15 implementation prompts. Check off each item when its session is complete.

---

## Prompts

- [x] **Prompt 1 — Design Token System (`globals.css`)**
  Define the full CSS custom property foundation: 5 colour palettes (Slate, Ocean, Forest, Rose, Amber) × light/dark variants, AMOLED pitch-black surface, spacing scale, radius scale, shadow/elevation tokens, and transition tokens. Replace all hard-coded colour values in globals.css with the new token names.

- [x] **Prompt 2 — Theme Store Extension**
  Extend the Zustand theme store to support a `palette` field (5 options) and an `amoled` boolean. Persist both to localStorage alongside the existing `theme` field. Export a `useTheme` hook that returns `{ theme, palette, amoled, setTheme, setPalette, setAmoled }`. Wire the CSS variables to the active palette + mode on mount and on every change.

- [x] **Prompt 3 — AppLayout: Ambient Glow + Chrome**
  Redesign `AppLayout.tsx`: add a palette-aware ambient radial glow behind the main content area, update the top chrome (page header bar), tighten the layout grid, and ensure sidebar + bottom-nav slots are preserved. No new routes — layout chrome only.

- [x] **Prompt 4 — Sidebar + BottomNav Redesign**
  Redesign `Sidebar.tsx` and `BottomNav.tsx`: new icon + label treatment, active-item indicator (pill or accent underline), palette-aware hover/active colours, collapse animation on Sidebar for mobile, and smooth tab-switch transition on BottomNav.

- [x] **Prompt 5 — Shared UI Components**
  Build/replace the shared primitives used everywhere:
  - `Card` — glass-morphism surface with token-based border + shadow
  - `Modal` — backdrop blur, slide-up animation, close button
  - `ProgressBar (PBar)` — segmented/gradient fill, labelled
  - `GlassCard (GCard)` — frosted-glass variant for stat highlights
  - `Input`, `Button`, `Badge`, `Skeleton` — token-aligned reskins
  All components must respect the active palette and dark/AMOLED mode.

- [x] **Prompt 6 — Dashboard Page**
  Redesign `app/dashboard/page.tsx` and its sub-components (`StatsCards`, `CategoryChart`, `RecentTransactions`, `SpendingForecast`, `TrendChart`): use GCard for stat tiles, palette accent on charts, redesigned section headers, and a quick-add FAB that matches the new design language.

- [x] **Prompt 7 — Transactions Page + TransactionModal**
  Redesign `app/transactions/page.tsx`, `TransactionList.tsx`, `TransactionRow.tsx`, and `TransactionModal.tsx`: new list-item layout (amount prominent, category pill, regret indicator), filter bar restyle, and a full modal redesign with the new Modal + Input components.

- [x] **Prompt 8 — Analytics Page**
  Redesign `app/analytics/page.tsx`: tabbed layout (Monthly / Trends / Yearly / Forecast), palette-coloured Recharts, summary stat row using GCard, and a period-picker that matches the new Input style.

- [x] **Prompt 9 — Accounts Page**
  Redesign `app/accounts/page.tsx` and `BankAccountsSection.tsx`: card-per-account layout with balance prominent, default-account badge, add/edit/delete actions in a consistent action bar.

- [x] **Prompt 10 — Goals Page**
  Redesign `app/goals/page.tsx`: goal cards with PBar for progress, funding action inline, palette accent per-goal by category, empty-state illustration placeholder.

- [x] **Prompt 11 — Budgets Page**
  Redesign `app/budgets/page.tsx`: budget cards with PBar showing spent/limit, over-budget warning state (rose accent), period selector, and add-budget flow using the new Modal + Input.

- [x] **Prompt 12 — AI Chat Page**
  Redesign `app/ai-chat/page.tsx` and `AIResponseCard.tsx`: chat-bubble layout (user right / AI left), streaming indicator, model badge on AI messages, palette-tinted message bubbles, and a sticky input bar at the bottom.

- [x] **Prompt 13 — Groups + Splits Pages**
  Redesign `app/splits/page.tsx` and any group-related pages: member avatar stack, split-amount breakdown card, settle-up CTA button, and `parse-split` AI integration UI.

- [x] **Prompt 14 — Profile Page + ThemePicker Component**
  Redesign `app/profile/page.tsx`: section-based layout (Account, Preferences, Danger Zone). Build a new `ThemePicker` component: 3-way mode toggle (Light / Dark / Pitch), 5 palette swatches, and AMOLED toggle — all wired to the extended theme store.

- [x] **Prompt 15 — Remaining Pages**
  Redesign the last cluster of pages to match the new design language:
  - `app/recurring/page.tsx`
  - `app/reports/page.tsx`
  - `app/forecast/page.tsx`
  - `app/calendar/page.tsx`
  - `app/personality/page.tsx`
  - `app/tax-estimate/page.tsx`
  - `app/salary-intelligence/page.tsx`
  - `app/one-time-expenses/page.tsx`
  Consistent section headers, card layouts, and palette-aware charts across all.

---

---

## ✅ FinTrack UI Redesign — COMPLETE

All 15 prompts shipped as of 2026-06-04.

**What was built:**
- Full design token system (5 palettes × light/AMOLED dark)
- Theme store with palette switching + pre-hydration flash prevention
- AppLayout with ambient radial glow + floating ThemePicker
- Sidebar + BottomNav with new active states + 6-item More grid
- Core UI primitives: Card, GCard, ProgressBar, Badge, Modal, BottomSheet, StatTile
- Dashboard, Transactions, Analytics, Accounts, Goals, Budgets, AI Chat, Groups, Splits, Profile pages
- All remaining pages: Recurring, Reports, Forecast, Calendar, Personality, Tax Estimate, Salary Intelligence, One-Time Expenses

**Design system rules enforced across all 15 prompts:**
- Inline styles only — zero Tailwind classNames
- All colours via CSS custom properties (var(--token))
- DM Mono for every ₹ figure
- ₹ + Math.round(n).toLocaleString('en-IN') — never .toFixed()
- type="button" on every button element
- Modals via createPortal with mounted SSR guard
- color-mix() for derived tints from semantic tokens

_Prompt 0 (task setup) — done. Start at Prompt 1._
