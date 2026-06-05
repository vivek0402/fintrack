# Prompts Log

Chronological record of every session prompt and its outcome.

---

## Prompt 0 — Task Setup
**Date:** 2026-06-04
**Status:** Done
**What happened:** Created `/tasks` folder with `todo.md`, `in_progress.md`, `finished.md`, `lessons.md`, and `prompts_log.md`. Wrote out the full 15-prompt UI redesign plan in `todo.md`. No code changes made.

---

## Prompt 15 — Remaining Pages
**Date:** 2026-06-04
**Status:** Done
**What happened:** All 8 remaining pages updated. Styling only — all API calls, handlers, and state untouched.

**Pattern applied to all 8:**
- Removed `PageShell` wrapper → added standard dark header card (`var(--bg-card)`, `var(--radius-xl)`, `h1` in `var(--font-display)`, subtitle in `var(--font-body)`)
- Removed `FadeIn`, `EmptyState`, `PageHelp` imports — replaced with inline elements
- All `card` constants updated: `var(--bg-border)` → `var(--border)`, `var(--bg-card)` stays
- All `generateBtn` constants updated: `linear-gradient(135deg, #1d4ed8, #6366f1)` → `var(--accent)` button
- Dead token replacements: `var(--accent-blue)` → `var(--accent)`, `var(--accent-green)` → `var(--color-inc)`, `var(--accent-red)` → `var(--color-exp)`, `var(--accent-yellow)` → `var(--color-warn)`, `var(--accent-purple)` → `var(--accent-2/3)`, `var(--bg-secondary)` → `var(--bg-alt)`, `var(--bg-border)` → `var(--border)`
- Hardcoded rgba → `color-mix(in srgb, var(--semantic-token) N%, transparent)`
- All font strings → `var(--font-display/head/body/mono)`
- DM Mono + `fontVariantNumeric: tabular-nums` on all ₹ amounts

**Page-specific notes:**
- **personality**: `scoreColor()` and `DIMENSION_META.color` use semantic tokens. Hero card uses `color-mix(in srgb, var(--accent-3) 8%, var(--bg-card))` gradient. Score bars use meta.color which is a CSS var string.
- **tax-estimate**: Regime comparison cards, slab table, tips all use semantic tokens. `var(--font-mono)` on all tax amounts.
- **salary-intelligence**: `PLAN_META` hex colours are **allocation plan data values** (not CSS tokens) — kept as hex intentionally, same pattern as `GOAL_COLORS`. `var(--color-inc)` tint on salary hero card.
- **forecast**: Calendar cells use `var(--accent)` for today border, `var(--color-exp)` for actual spend, `var(--text-muted)` for projected. `CategoryIcon` default updated to `var(--accent)`.
- **reports**: All score bars use `ProgressBar` component. `gradeColor()` returns semantic tokens. Date range buttons hover uses `var(--accent-light)`.
- **recurring**: `TypeToggle` inline component with `color-mix` borders/backgrounds. AI patterns strip uses `color-mix(info 8%)` GCard-style. Toggle pause/resume buttons use `var(--color-warn)` / `var(--color-inc)`.
- **calendar**: `var(--accent)` for today circle (replaces `#00e5a0`). `var(--color-inc/exp)` for income/expense dots and amounts. Selected day bg uses `color-mix(in srgb, var(--accent-light) 50%, transparent)`. Month nav buttons `var(--bg-alt)`. Summary chips as GCards.
- **one-time-expenses**: Surgical replacements (798-line file). `var(--accent-2)` for all purple accent elements (category badges, totals, add-item button). `PageShell`/`EmptyState`/`FadeIn` imports removed. `CATEGORY_COLORS` hex values kept as data.

---

## Prompt 14 — Profile Page + ThemePicker Component
**Date:** 2026-06-04
**Status:** Done
**What happened:**

**ThemePicker.tsx (new — `frontend/components/ui/ThemePicker.tsx`):**
- `position: fixed, bottom: 90px, left: 16px, zIndex: 400` — above mobile BottomNav (64px) with clearance.
- 42px circular button: `var(--bg-card)` + `var(--border)` + `Palette` icon in `var(--accent)`. Scale-up on hover.
- Upward panel on click (`bottom: 52px`): `var(--bg-card)` + `var(--border)` + `var(--shadow-elevated)` + `fadeUp` animation.
- Panel has COLOUR section (5×32px circular swatches) + MODE section (2-button segmented control). Both wired to `useThemeStore()`.
- Swatch active state: `outline: 3px solid var(--text-primary)` + `outlineOffset: 2px` — theme-safe (visible in both light and dark).
- Closes on outside click via `mousedown` handler.
- Hidden on `/login`, `/register`, `/onboarding` via `usePathname()` check.
- Mounted in `AppLayout.tsx` — visible on every authenticated page.
- Palette accent hex values in the swatch array are data (palette definitions), not CSS tokens.

**profile/page.tsx (rebuilt):**
- **Header:** `var(--bg-card)` panel + glow spot. Large 64px `var(--accent)` initials circle. Name in `var(--font-display)`. Email muted. "Pro Member" `Badge`.
- **Stats row:** Three `GCard`s: Transactions, Budgets, Months Tracked. Numbers in `var(--font-mono)` `var(--accent)` with `numberReveal` animation. `monthsTracked` computed from `profile.created_at`.
- **Appearance Card:** Full card with `Palette` icon header. COLOUR section: 5 swatches (32px circles, same swatch logic as ThemePicker). MODE section: 2-button segmented control for Light/Dark. Both wired to `useThemeStore()`.
- **Account Card:** Personal Info form (name, email, currency select) + Change Password form. Password strength meter uses `var(--color-exp/warn/inc)` instead of hardcoded hex. `Msg` component uses `color-mix`.
- **Data Card:** Export Data row (calls `transactionsAPI.getAll()` + `exportToCSV()`), Clear AI Cache row (calls `aiAPI.clearCache()` for 5 known keys via `Promise.allSettled`).
- **App Card:** Tax Settings row (→ `/tax-estimate`), Notifications row (toast placeholder).
- **Sign Out:** Full-width `color-mix(in srgb, var(--color-exp) 8%)` tinted button with hover deepening to 14%.
- `BankAccountsSection` removed — now lives on the dedicated Accounts page.
- `ThemeToggle` removed from profile — replaced by the new Appearance card.
- `SettingsRow` inline helper component: icon in a rounded square + label + sub + chevron, handles `destructive` prop for red-tinted danger rows.
- All dead tokens fixed; zero hardcoded hex/rgba.

**AppLayout.tsx (updated):** Added `import { ThemePicker }` + `<ThemePicker />` between `<ToastContainer />` and `<WalkthroughTour />`.

---

## Prompt 13 — Groups + Splits Pages
**Date:** 2026-06-04
**Status:** Done
**What happened:**

**groups/page.tsx (744→~400 lines rebuilt):** All state variables, callbacks, and API handlers preserved verbatim.
- **List view:** Header panel with title + subtitle + "+ New Group" accent button. Group cards: emoji, name, member count `Badge`, budget `ProgressBar` + spent/budget row if budget exists, edit/delete/chevron actions. Hover border animates to `var(--accent)`.
- **Detail view:** Back button ("← Groups") + emoji + name + member count + budget subtitle in header panel. Two `GCard`s side by side: "You Owe" (`var(--color-exp)` when > 0, "—" otherwise) + "Owed to You" (`var(--color-inc)` when > 0). These are computed from splits data loaded at detail open — no extra API call needed. Budget `ProgressBar` if budget exists. Tab pills: Transactions / Splits (+ unsettled count badge) / Settle Up.
- **Splits tab:** Each split as a Card with header (description + Settled/Pending `Badge` + DM Mono total + Edit button) + per-share rows (avatar initials circle + name + amount + "Settle Up" CTA button). Settle Up calls `settleShare()` unchanged.
- **Settle Up tab:** Settlement rows with `var(--color-exp)` payer and `var(--color-inc)` payee in DM Mono.
- **All modals:** `backdropFilter: blur(2px)` + `springIn` animation + `var(--bg-card)` + `var(--border)` + `var(--radius-xl)`. All dead tokens fixed (`var(--bg-secondary)` → `var(--bg-alt)`, `var(--bg-border)` → `var(--border)`, `var(--accent-blue)` → `var(--accent)`, `var(--accent-red)` → `var(--color-exp)`, `var(--accent-green)` → `var(--color-inc)`, hardcoded rgba → `color-mix`). GroupModal `createPortal` stays unchanged.

**splits/page.tsx (rebuilt):** All handlers preserved.
- **Header:** standard dark panel, "Split Expenses", subtitle, "+ Add Split" button.
- **AI Parse Strip:** prominent `color-mix(info)` tinted strip at top of page (outside Modal). Sparkles icon, description text, input + Parse button. Same `aiAPI.parseSplit()` call.
- **Split cards:** `var(--bg-card)` + settled tint border. Header row: description + Settled/Pending `Badge` + DM Mono total + date + "Your share" in `var(--color-inc)`. Participant rows: initials avatar + name + DM Mono share amount + "Mark settled" toggle button. Edit/Delete icon buttons with hover color-mix effects.
- **New/Edit Split Modal:** uses `Modal` component. `GCard` for AI Parse section inside modal. Amount input with ₹ prefix in `var(--font-mono)`. Share preview GCard ("Split N ways → ₹X each"). Error block uses `color-mix`.
- **Dead tokens fixed:** all dead `rgba(0,229,160,...)`, `rgba(244,63,94,...)`, `var(--accent-green)`, `var(--accent-blue)` etc. replaced.

---

## Prompt 12 — AI Chat Page
**Date:** 2026-06-04
**Status:** Done
**What happened:**

**AIResponseCard.tsx (updated):**
- `colorStyles` object: all dead token references replaced — `var(--accent-blue)` → `var(--accent)`, `var(--accent-blue-bg)` → `var(--accent-light)`, `var(--accent-blue-border)` → `var(--accent-border)`, hover `rgba(99,102,241,0.2)` → `var(--accent-tint)`; green → `var(--color-inc)` + `color-mix`; yellow → `var(--color-warn)` + `color-mix`.
- `highlightValues`: `var(--accent-blue)` → `var(--accent)`.
- Internal avatar: `linear-gradient(..., #8b5cf6)` → `color-mix(in srgb, var(--color-info) 15%, var(--bg-card))` circle with `var(--color-info)` text.
- Internal avatar hidden when `type="chat"` (external avatar in the page handles it for bubbles).
- Card outer div: `var(--bg-border)` → `var(--border)`, `borderLeft: '3px solid var(--accent-blue)'` → `var(--accent)`, `borderRadius` → `var(--radius-lg)`.
- `type="button"` added to action buttons. Font strings → `var(--font-body)`.

**ai-chat/page.tsx (rebuilt):**
- `HEADER_H=64` + `CHIPS_H=48` = `TOP_H=112` fixed top area. `INPUT_H=64`. All use `position: fixed` with correct `top/bottom/left/right` offsets.
- **Fixed Header (64px):** `var(--bg-card)` bg, `var(--border)` bottom. Sparkles in `color-mix(info 15%)` circle. "FinTrack AI" heading + "Your personal financial advisor" subtitle.
- **Fixed Quick Prompt Chips (48px):** Below header. `["Analyze my spending", "Can I afford a trip?", "Budget advice", "Tax estimate"]`. `var(--accent-light)` bg + `var(--accent-border)` + `var(--accent)` text. Click → `setInput(chip)` (populates input, does not send).
- **Messages Area:** fills `top=TOP_H` to `bottom=messagesBottom`. AI bubble: `var(--bg-card)` + `1px solid var(--border)` + `borderRadius: '15px 15px 15px 4px'`, left-aligned, Sparkles avatar to left. User bubble: `var(--accent)` + white text + `borderRadius: '15px 15px 4px 15px'`, right-aligned.
- **Timestamps:** 10px `var(--text-faint)` below each bubble, formatted as "hh:mm AM/PM".
- **Typing indicator:** Sparkles avatar + three dots in `var(--accent-3)` with `bounce` animation + staggered delays.
- **Empty state:** centered Sparkles icon in info circle + descriptive text.
- **Fixed Input Bar (64px):** `var(--bg-card)` bg + `var(--border)` top. Textarea `var(--bg-alt)` pill background, focus ring → `var(--accent)`. Send button: `var(--accent)` + white when `canSend`, `var(--bg-alt)` + `var(--text-muted)` when not.
- `Message` interface extended with `timestamp: Date`. Timestamps set on creation.
- Removed: `PageShell`, `PageHelp`, `Skeleton*` imports.

---

## Prompt 11 — Budgets Page
**Date:** 2026-06-04
**Status:** Done
**What happened:**
- Full rebuild of `frontend/app/budgets/page.tsx`. All CRUD handlers (create, edit, delete) preserved verbatim.
- **Header:** `var(--bg-card)` panel, "Budgets" in `var(--font-display)`, month subtitle, "+ Add Budget" accent button.
- **Summary GCards:** Two side-by-side GCards: "Total Budget" in `var(--accent)` DM Mono, "Spent So Far" in `var(--text-primary)` normally / `var(--color-exp)` when over total budget.
- **Overall Progress Card:** `var(--bg-card)`, "Overall Usage" heading, overall `%` in 18px DM Mono (`var(--color-exp)` when over), `ProgressBar` height 8px (auto-turns red via pct > 100 mechanism), remaining/over text below.
- **Over-Budget Alert Banner:** `color-mix(in srgb, var(--color-warn) 12%, transparent)` bg, `color-mix(in srgb, var(--color-warn) 28%, transparent)` border, `AlertCircle` icon in `var(--color-warn)`, lists category names. Only shown when `overBudgetList.length > 0`.
- **Budget Category Cards:** `var(--bg-card)` + `color-exp` tint border when over. Left: emoji in 36px rounded square (`var(--accent-light)` normal / `color-mix(exp 12%)` over-budget), category name + budget amount. Right: spent in 15px DM Mono (`var(--color-exp)` if over, `var(--text-primary)` if not) + "+₹X over" Badge if over / "₹X left" muted text if not. `ProgressBar` 6px height, `var(--color-exp)` fill when over. Edit/Delete icon buttons.
- **Inline edit:** keeps existing pattern — input with ₹ prefix in `var(--font-mono)`, Save/Cancel inline below card.
- **Add Budget Modal:** `Modal` component, category `<select>` + amount input with ₹ prefix in DM Mono, `var(--accent)` CTA.
- **Dead tokens fixed:** `var(--accent-red*)` → `var(--color-exp)` + `color-mix`, `var(--accent-yellow*)` → `var(--color-warn)` + `color-mix`, `var(--accent-green*)` → `var(--color-inc)` + `color-mix`, `var(--accent-blue*)` → `var(--accent)` + `var(--accent-light)`, `var(--bg-secondary)` → `var(--bg-alt)`, `var(--bg-border)` → `var(--border)`, inline font strings → `var(--font-*)`.
- **Removed:** `PageShell`, `FadeIn`, `EmptyState`, `PageHelp`, `formatCurrency` (replaced with inline `fmt()`).

---

## Prompt 10 — Goals Page
**Date:** 2026-06-04
**Status:** Done
**What happened:**
- Full rebuild of `frontend/app/goals/page.tsx`. All CRUD handlers (create, edit, delete, addFunds, lifeEvent) preserved verbatim; only JSX/styles changed.
- **Header:** `var(--bg-card)` panel + ambient glow spot. "Your Goals" in `var(--font-display)` with `fontStyle: 'italic'` at 34px. Active goal count subtitle. `fmt(totalSaved)` in `var(--color-inc)` + `fmt(totalRemaining)` subtitle line. "New Goal" button with `rgba(255,255,255,0.1)` bg + `rgba(255,255,255,0.3)` border + white text (sits on dark card, readable).
- **Overall Progress GCard:** shown only when goals exist. "Overall Progress" in `var(--font-head)`, overall `%` in `var(--accent)` DM Mono 20px, `ProgressBar` full width, completion count subtitle.
- **AI Life Event Strip:** `color-mix(in srgb, var(--color-info) 8%, var(--bg-card))` bg, `Brain` icon, "AI Life Event Planner" title, chevron — taps to open Life Event Modal. Matches the AI insight strip pattern from Dashboard.
- **Empty state:** simple inline placeholder with 🎯 emoji + CTA button (removed `EmptyState` component import).
- **Goal Cards:** `var(--bg-card)` with `color-inc` tint border on completed. Left: emoji (26px) + name + deadline text. Right: `%` in 22px DM Mono `var(--accent)` + "saved" label. `ProgressBar` at 7px height (uses `goal.color` or `var(--accent-2)`, green on complete). Footer: "Saved ₹X of ₹Y" in DM Mono. Add Funds / Edit / Delete actions. Confirm-delete inline.
- **Modals:** New Goal, Edit Goal, Add Funds, Life Event — all use `Modal` component from Prompt 5. Target amount inputs have `₹` prefix in `var(--font-mono)`. `var(--bg-alt)` inputs, `var(--accent)` CTA buttons, `color-mix` for tinted borders/backgrounds.
- **Dead token fixes:** `var(--accent-blue)` → `var(--accent)`, `var(--accent-blue-bg)` → `var(--accent-light)`, `var(--accent-green)` → `var(--color-inc)`, `var(--accent-green-bg)` → `color-mix(...)`, `var(--accent-red)` → `var(--color-exp)`, `var(--accent-yellow)` → `var(--color-warn)`, `var(--bg-secondary)` → `var(--bg-alt)`, `var(--bg-border)` → `var(--border)`, hardcoded `rgba(0,229,160,...)` / `rgba(245,158,11,...)` in life event result → `color-mix`, inline font strings → `var(--font-*)`.
- **Removed:** `CircleProgress` SVG component (dead SVG stroke token `var(--bg-border)`), `PageShell`, `FadeIn`, `PageHelp`, `EmptyState` imports. `GOAL_COLORS` array keeps hex values (user-selectable data palette, not CSS tokens — same pattern as `CARD_COLORS` in Accounts).

---

## Prompt 9 — Accounts Page
**Date:** 2026-06-04
**Status:** Done
**What happened:**
- Full rebuild of `frontend/app/accounts/page.tsx` (912 → ~380 lines). All CRUD handlers, form state, and API calls preserved verbatim; only JSX/styles changed.
- **Net Worth Header:** `var(--bg-card)` panel with ambient glow spot, animated `useCountUp` net worth in DM Mono 48px. Three StatPills (Banks/CC Debt/Wallets) inline below. `var(--color-inc)` for assets, `var(--color-exp)` for debt.
- **Bank Accounts:** Each account is a Card with a full-width coloured band at top (background = `b.color || var(--accent)`). Band contains: emoji icon, name, masked last4, account type, Default badge (`rgba(255,255,255,0.22)` bg), balance in 20px white DM Mono. Below band: History / Edit OutlineBtn + Star (set-default) / Trash action row.
- **Credit Cards:** Coloured top panel (card's `c.color`) with name, network+last4, utilisation Badge (`rgba(255,255,255,0.22)`), outstanding balance in 20px white DM Mono, due date in `var(--color-warn)` if ≤ 7 days. Below panel: limit/available text row, `ProgressBar` (color = `var(--color-warn)` if >30% util, else `var(--accent-2)`), Edit/Trash buttons.
- **Wallets:** 2-column CSS grid of `GCard` tiles. Each: emoji + name + inline-editable balance (click to edit, Enter/Escape to confirm). Balance in `var(--accent)` DM Mono.
- **Modals (all 3 + delete confirm):** `var(--bg-card)` + `var(--border)` + `var(--radius-xl)` + `backdropFilter: blur(2px)` + `springIn` animation. All inputs use `var(--bg-alt)` + `var(--border)`. Save buttons use `var(--accent)`. Cancel buttons use `var(--bg-alt)` + `var(--border)`. Font tokens throughout.
- **Dead tokens replaced:** `var(--surface-1)` → `var(--bg-card)`, `var(--bg-border)` → `var(--border)`, `var(--bg-secondary)` → `var(--bg-alt)`, `var(--accent-blue)` → `var(--accent)`, `var(--accent-green)` → `var(--color-inc)`, `var(--accent-red)` → `var(--color-exp)`, `var(--accent-yellow)` → `var(--color-warn)`, `var(--accent-mint/amber/rose-bg)` → `color-mix` equivalents, `var(--bg-border-strong)` → `var(--border)`, inline font strings → `var(--font-*)`.
- Removed: `PageShell`, `Button` component (replaced with inline buttons), `ChevronDown/Up` (card expansion removed in favour of always-visible details).

---

## Prompt 8 — Analytics Page
**Date:** 2026-06-04
**Status:** Done
**What happened:**
- Full rebuild of `frontend/app/analytics/page.tsx`. Removed `PageShell`, `PageHelp`, `Button` dependency for layout; kept `Button` only for salary allocation CTA.
- **Chart colour system:** `readChartColors()` reads `--color-inc`, `--accent`, `--accent-2`, `--accent-tint`, `--border`, `--text-faint`, `--bg-card` via `getComputedStyle` on mount and on every `theme`/`palette` change (via `useThemeStore`). Stored in `cc` state and fed into all Recharts components as literal color values. This makes charts palette-reactive without needing CSS vars inside SVG attributes.
- **Header card:** standard `var(--bg-card)` panel + Export button.
- **Period pills:** month / quarter / year toggle. Affects how many months of trend data the AreaChart shows (6 / 9 / 12).
- **4 KPI GCards (2×2):** Total Spent, Daily Average, vs Last Month (%), Savings Rate. All in `var(--font-mono)` + `tabular-nums`. `numberReveal` animation on values.
- **Income vs Expenses AreaChart (Recharts v3):** SVG `<linearGradient>` defs inside chart — income = `cc.inc` at 25% opacity, expense = `cc.exp` at 20% opacity, both fade to transparent. Lines 2px. `CartesianGrid` horizontal only, `cc.border` colour. Axis ticks: `cc.faint`, 11px, DM Mono. `YAxis` hidden. Custom `ChartTooltip` with `var(--bg-card)` + `var(--border)` + `var(--font-mono)` on values.
- **Spending Breakdown:** PieChart donut (innerRadius 36, outerRadius 54) + category list. Category colors come from API `cat.color`. List shows colour dot, name, fmt() amount, `%` Badge.
- **Weekly Pattern BarChart:** computed from `allTransactions` by day-of-week. Default fill `cc.tint`, highest-value bar fill `cc.exp`. Same custom tooltip.
- **Payment Methods, Bank Balances, Year-over-Year:** kept, all dead tokens fixed.
- **AI Salary Allocation + Regret Patterns:** logic 100% preserved. `var(--accent-blue)` → `var(--accent)`, `var(--accent-green)` → `var(--color-inc)`, `var(--accent-red)` → `var(--color-exp)`, `var(--surface-1)` → `var(--bg-card)`, `var(--bg-border)` → `var(--border)`, inline font strings → `var(--font-*)` tokens.
- **Recharts v3 note:** `CartesianGrid` takes `horizontal` boolean prop (not `horizontalPoints`). `Area` `type="monotone"` still works. `Pie` component API unchanged.

---

## Prompt 7 — Transactions Page + TransactionModal
**Date:** 2026-06-04
**Status:** Done
**What happened:**

**transactions/page.tsx (rewritten):**
- Removed `PageShell`, `Button`, `Input`, `PageHelp` imports — layout built inline.
- **Header card:** `var(--bg-card)` panel, title + subtitle, inline Export + Add buttons.
- **Search bar:** icon-left input with `var(--bg-card)` base, `var(--border)` border, accent border on focus.
- **Filter pills:** `filterPillStyle(active)` helper — active = `var(--accent)` bg + white text, inactive = `var(--bg-card)` + `var(--text-muted)` + `var(--border)`. Covers All / ↑ Income / ↓ Expenses / month / #tag.
- **Summary GCards:** two (+ Net on desktop) side-by-side GCards, `var(--color-inc)` / `var(--color-exp)` on amounts with `var(--font-mono)`.
- **Transaction list:** `var(--bg-card)` + `var(--border)` wrapper; delegates to `TransactionList`.
- **AI Quick Add strip:** GCard at bottom with Zap icon, tappable → quick-add modal.
- **Month filter popover:** all `var(--accent-blue)` → `var(--accent)`, all `var(--bg-border)` → `var(--border)`, `var(--font-body/head)` on text.
- **Quick-add modal:** `var(--shadow-modal)`, `var(--radius-xl)`, `var(--bg-alt)` textarea, `var(--color-exp)` on error.

**TransactionModal.tsx (updated — logic 100% preserved):**
- **Type toggle:** dark pill container (`var(--bg-alt)` + `var(--border)`). Active income = `var(--color-inc)` bg + white text. Active expense = `var(--text-primary)` bg + `var(--bg-card)` text (inverted — dark/light safe).
- **Amount input:** `var(--font-mono)` + `fontVariantNumeric: tabular-nums`; ₹ prefix in `var(--font-mono)`; border colour uses `color-mix` from `var(--color-inc/exp)`.
- **Payment method:** active = `var(--accent-light)` + `var(--accent)`, inactive = `var(--bg-card)` + `var(--border)`.
- **Category dropdown:** `var(--bg-card)` dropdown, `var(--border)` borders, `var(--shadow-elevated)` shadow.
- **New-cat prompt:** `var(--accent-light)` + `var(--accent-border)` banner; approve btn = `var(--accent)`.
- **Tags:** `var(--accent-light)` + `var(--accent-border)` pills, `var(--accent)` text.
- **Error state:** `color-mix(in srgb, var(--color-exp) 10%, transparent)` tint.
- **All token fixes:** `var(--bg-secondary)` → `var(--bg-alt)`, `var(--bg-border)` → `var(--border)`, `var(--bg-primary)` → `var(--bg-card)` (calendar), `var(--accent-blue)` → `var(--accent)`, `var(--accent-green/red/*)` → semantic equivalents.
- `reusable labelStyle` and `inputBase` objects defined once at top of render.

**TransactionRow.tsx (updated):**
- `var(--surface-1)` → `transparent` (transparent bg shows parent card bg through).
- `var(--surface-3)` → `var(--bg-hover)` on hover.
- `var(--accent-green)` → `var(--color-inc)` for income amount.
- `var(--accent-red)` → removed (expense amount now uses `var(--text-primary)` per spec).
- `var(--accent-blue)` on tags → `var(--accent)`.
- Added `is_regretted` emoji indicator.
- Added `fontVariantNumeric: tabular-nums` on amount.
- Category icon bg: `bg || 'var(--bg-alt)'` (no rgba fallback).
- All inline font strings → `var(--font-body)` / `var(--font-mono)`.

---

## Prompt 6 — Dashboard Page
**Date:** 2026-06-04
**Status:** Done
**What happened:**
Full rebuild of `frontend/app/dashboard/page.tsx`. Old 720-line file replaced with clean 350-line version.

**Sections built:**
1. **Salary Banner** — kept from old design, simplified: uses GCard, `var(--accent)` colors, fmt() for amounts, `type="button"` on dismiss.
2. **Header Card** — `var(--bg-card)` with dot SVG pattern at `opacity: 0.06`, greeting, month label, `useCountUp`-animated net balance at 40–48px DM Mono, three StatPill components (Income/Spent/Saved%). Net balance turns `var(--color-exp)` when negative.
3. **AI Insight Strip** — `color-mix(in srgb, var(--color-info) 8%, var(--bg-card))` background; `aiAPI.report()` fetched on mount (server-side cache means it's fast); Sparkles icon + chevron; navigates to `/ai-chat` on click; 2-line clamp via `-webkit-box`.
4. **Weekly Money Mood** — GCard, 3 emoji buttons (😊😐😟), `background: var(--accent)` + white label on selected, local state only.
5. **Spending This Month** — SectionHead with spentPct% action; Card with budget rows; `ProgressBar` per category; amount in `var(--color-exp)` when over budget; `var(--font-mono)` + `fontVariantNumeric: tabular-nums` on amounts.
6. **Recent Activity** — SectionHead + "View All"; 5 inline transaction rows with emoji avatar, description, category·date, amount; income in `var(--color-inc)`, expense in `var(--text-primary)`.
7. **Goals Mini Preview** — 2-column grid of up to 2 goal cards; emoji, name, ProgressBar, pct%/remaining; only renders when goals exist.

**Data changes:**
- Added `goalsAPI.getAll()` to the data fetch (new call).
- `analyticsAPI.trends()` and `analyticsAPI.forecast()` still called as fire-and-forget (kept per spec, not displayed directly but kept in historical cache).
- `aiAPI.report()` moved from button-click to mount (non-blocking, fire-and-forget).
- Cache key and TTL unchanged (10 min).

**Removed:** sparkline SVG charts, `StatsCards`, `BudgetAlerts`, `SpendingForecast`, `PageShell`, `PageHelp`, `FadeIn`, `Button` imports — all replaced by inline layout.

**Verification:** No hardcoded hex, no Tailwind classes, all ₹ amounts use `fmt()`, all buttons have `type="button"`.

---

## Prompt 5 — Shared UI Components
**Date:** 2026-06-04
**Status:** Done
**What happened:**

**Card.tsx (updated):** `var(--surface-1/2/3)` → `var(--bg-card/alt/hover)`. `var(--bg-border)` → `var(--border)`. Logic preserved.

**GCard.tsx (new):** Accent-tinted surface: `background: var(--accent-light)`, `border: 1.5px solid var(--accent-border)`, `borderRadius: var(--radius-lg)`. Works for both light (opaque tint) and dark (rgba tint via Prompt 1 tokens).

**ProgressBar.tsx (new):** Props `pct` (0–150), `color?`, `height?` (default 5px). Track: `var(--border)`. Fill: `var(--color-exp)` when `pct > 100`, else `color ?? var(--accent-2)`. Width clamped to 0–100% visually. Transition: `width 0.8s cubic-bezier(.4,0,.2,1)`, `background 0.3s ease`.

**Badge.tsx (new):** Inline-flex pill, `background: var(--accent-light)`, `color: var(--accent)`, `fontFamily: var(--font-body)`. `color` and `bg` props for overrides.

**Modal.tsx (updated):** Overlay `rgba(0,0,0,0.55)` + `backdropFilter: blur(2px)` + `WebkitBackdropFilter`. Modal box: `var(--bg-card)`, `var(--radius-xl)` (was `radius-lg`). Header/footer borders `var(--border)` (was `var(--bg-border)`). Close button `var(--bg-alt)` (was `var(--bg-hover)`). Title font `var(--font-display)`. Added `type="button"` to close button.

**BottomSheet.tsx (updated):** Background `var(--bg-card)` (was `var(--bg-secondary)`). All `var(--bg-border)` → `var(--border)`. Handle 40px wide. Added `backdropFilter: blur(2px)` to backdrop overlay. Title font `var(--font-display)`. Added `type="button"` to close button.

**StatTile.tsx (updated):** Background `var(--bg-card)`. Border `var(--border)`. Icon accent `var(--accent)` (was `var(--accent-blue)`). Value: `fontFamily: var(--font-mono)` + `fontVariantNumeric: tabular-nums`. Label font: `var(--font-head)`. Trend pill: `color-mix(in srgb, var(--color-inc/exp) 12%, transparent)` bg, `var(--color-inc/exp)` text.

**Scope note:** Button, Input, DatePicker, FAB, TransactionRow, ToastContainer, AIResponseCard still have dead tokens — those are out of scope for Prompt 5 and will be fixed when their respective pages are redesigned in Prompts 6–15.

---

## Prompt 4 — Sidebar + BottomNav Redesign
**Date:** 2026-06-04
**Status:** Done
**What happened:**

**Sidebar.tsx:**
- Background: `var(--bg-secondary)` → `var(--bg-card)`. Border: `var(--bg-border)` → `var(--border)`.
- Logo: old green gradient square → solid `var(--accent)` square with `border: var(--accent-border)`. White TrendingUp icon. Wordmark uses `var(--font-display)`.
- Active nav item: `var(--bg-hover)` bg → `var(--accent-light)` bg, `var(--accent-blue)` → `var(--accent)` for border and text. Inactive icon color: `var(--text-secondary)` → `var(--text-muted)`.
- User avatar: old blue+green gradient → solid `var(--accent)` circle, white initials, `var(--font-display)`.
- Divider: `var(--bg-border)` → `var(--border)`.
- Logout hover: old `var(--accent-red-*)` (dead tokens) → `color-mix(in srgb, var(--color-exp) 10%, transparent)` for bg, `var(--color-exp)` for text, `color-mix(in srgb, var(--color-exp) 22%, transparent)` for border. No hardcoded hex.
- Added `type="button"` to collapse toggle and logout buttons.

**BottomNav.tsx:**
- Nav bar: `var(--bg-secondary)` → `var(--bg-card)`. Border: `var(--bg-border)` → `var(--border)`. Box-shadow lightened for light mode.
- Active tab treatment: removed sliding top-pill indicator; replaced with accent pill background around the icon (`padding: 5px 14px`, `borderRadius: 20px`, `background: var(--accent)`, white icon). `popIn` animation retained via `key` flip.
- Label: `var(--accent-blue)` → `var(--accent)`. Inactive: `var(--text-muted)`.
- More sheet: replaced 3-section categorised list (14 items) with a **2×3 grid** of 6 tiles (Accounts, Goals, Budgets, AI Chat, Groups, Settings). Each tile: accent square icon container when active, `var(--accent-light)` card bg when active, staggered entry animation.
- Sheet handle: 36px → **40px** wide, `var(--bg-border)` → `var(--border)`.
- Backdrop: `rgba(0,0,0,0.5)` → **`rgba(0,0,0,0.35)`**.
- Sheet border: `var(--bg-border)` → `var(--border)`. "More" header font: `var(--font-display)`.
- Removed logout button from More sheet (Settings leads to profile/logout).
- Removed unused imports: `LogOut`, `ChevronRight`, `BarChart2`, `Brain`, `Banknote`, `Receipt`, `TrendingUp`, `RefreshCw`, `CalendarDays`.
- Added `type="button"` to all button elements. Main tab links use `<a>` with `onClick` to avoid Next.js `<Link>` prefetch overhead in the nav.
- `moreActive`: simplified to `!mainTabs.some(t => isActive(t.href))`.

---

## Prompt 3 — AppLayout: Ambient Glow + Chrome
**Date:** 2026-06-04
**Status:** Done
**What happened:**
- Added `buildGlowBackground(theme)` pure helper that produces a `background` CSS string using `var(--bg-glow)` directly as gradient stops — no `getComputedStyle` needed because `--bg-glow` is already a complete `rgba(...)` value in the token system and CSS resolves `var()` references in gradient stops natively.
- Dark shape: two diagonal ellipses (top-right + bottom-left corners) over `#000000`.
- Light shape: single wide ellipse washing down from top-centre over `var(--bg-page)`.
- Root `<div>` gets `background: glowBackground`, `backgroundAttachment: 'fixed'`, and `transition: background 0.5s ease` — glow shifts smoothly when palette or theme changes.
- Removed redundant `background` from `<main>` (it was `var(--bg-primary)` which no longer exists; the root div background now shows through correctly since main has no background set).
- **Token fixes throughout** (dead names from Prompt 1 rename):
  - `var(--bg-primary)` → removed / replaced with glow background on root
  - `var(--bg-border)` → `var(--border)` in FAB tooltip borders
  - `var(--accent-blue)` → `var(--accent)` on both Add-Transaction FABs
  - Hardcoded indigo gradient on AI FAB → `linear-gradient(135deg, var(--accent-2), var(--accent-3))`
  - Hardcoded `rgba(99,102,241,...)` box-shadows on FABs → `var(--accent-tint)` / `var(--accent-border)`
- All other behaviour preserved: `loadTheme`, backend warm-up, tour logic, sidebar collapse, FAB visibility rules, `ErrorBoundary`, `ToastContainer`, `WalkthroughTour`.

---

## Prompt 2 — Theme Store Extension
**Date:** 2026-06-04
**Status:** Done
**What happened:**
- Added `PaletteName` type union: `'ember' | 'ocean' | 'violet' | 'forest' | 'rose'`.
- Added `palette: PaletteName` field (default `'ocean'`) and `setPalette(p)` action to `ThemeStore` interface and implementation.
- Extracted `applyAttributes(theme, palette)` helper that sets both `data-theme` and `data-palette` on `document.documentElement` in one call — used by `setTheme`, `setPalette`, and `loadTheme` to guarantee both attributes are always in sync.
- `loadTheme()` now reads `fintrack-palette` from localStorage, validates against `VALID_PALETTES`, falls back to `'ocean'`, self-heals stale/invalid stored values, and calls `applyAttributes`.
- `setTheme` reads current palette from `get()` before calling `applyAttributes` so the palette attribute is preserved on theme toggle.
- Updated pre-hydration `<script>` in `app/layout.tsx`: reads both `fintrack-theme` and `fintrack-palette`, applies same validation logic (ES5-compatible — uses `indexOf` not `includes`, `var` not `const`), sets both attributes atomically before React hydrates — eliminates flash of wrong palette.

---

## Prompt 1 — Design Token System (`globals.css`)
**Date:** 2026-06-04
**Status:** Done
**What happened:**
- Replaced the old monolithic `:root / [data-theme="dark"] / [data-theme="light"]` blocks with a `[data-palette="X"]` × `[data-palette="X"][data-theme="dark"]` system.
- 5 palettes defined: ember (orange), ocean (sky-blue), violet (purple), forest (emerald), rose (rose-red).
- Each palette has full light tokens with palette-tinted backgrounds; dark tokens share AMOLED surfaces (#000 / #0D0D0D / #111 / #181818 / #1E1E1E / #272727) and differ only in accent + glow.
- All 18 token names per palette × mode: `--bg-page/card/alt/hover`, `--border/border-strong`, `--bg-glow`, `--accent/2/3`, `--accent-light/border/tint`, `--color-inc/exp/warn/info`, `--text-primary/secondary/muted/faint`.
- `:root` fallback mirrors ember light so SSR/hydration never flashes unstyled.
- Theme-independent tokens consolidated in `:root`: `--font-display/head/body/mono`, `--space-1…12`, `--radius-sm/md/lg/xl`, `--shadow-card/elevated/modal`, `--transition-fast/base/slow`.
- `body` updated to use `var(--bg-page)` and `var(--font-body)`; removed old `--bg-ambient` background-image (will be restored in Prompt 3 via AppLayout).
- `h1–h6` updated to `var(--font-display)`.
- Scrollbar thumb updated to `var(--border)`.
- All keyframes and utility classes preserved verbatim.
- Verified: every `#hex` match in the file is on a `--property: #hex;` declaration line — no hardcoded colours outside the token block.
**Note:** `FinTrack_Prototype.jsx` was not present in the repo; palette values derived from the prompt's colour spec using Tailwind ramp equivalents (orange-500/600, sky-500/600, violet-500/600, emerald-500/600, rose-500/600).
