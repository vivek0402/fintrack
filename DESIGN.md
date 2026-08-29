# Design System — FinTrack

## Product Context
- **What this is:** A personal finance web + mobile app (PWA, Capacitor Android) with AI-powered insights, investment tracking, Indian tax planning, and debt intelligence
- **Who it's for:** Individuals who take money seriously and want surgical clarity over their complete financial picture
- **Space/industry:** Personal finance, budgeting, net worth, investing, tax
- **Project type:** Dashboard web app + mobile PWA

## Aesthetic Direction
- **Direction:** Industrial / Refined, now rendered in glass
- **Decoration level:** Intentional — translucent panels over an ambient data backdrop. Restraint still governs: colour is rare, type does the work, nothing decorates for its own sake.
- **Mood:** Cold obsidian surfaces, surgical typography, data that feels live. "This was built for someone who takes money seriously." The user should feel competent and calm in the first 3 seconds — not overwhelmed by UI tricks.
- **Reference products:** Linear, Superhuman (craft tier); Copilot Money (design leadership in the category)
- **Category departures:**
  1. Numbers are always the hero — every currency figure is the most prominent element in its region; everything else supports it
  2. FAB + dedicated pages as the primary AI surface — not sidebar widgets
  3. The backdrop *is* the user's data — income and expense curves blown up behind the entire app, which the glass panels frost

### Glassmorphism (reversal of the v2 ban — approved 2026-08-24)
The v2 system banned `backdrop-filter` outright. That ban is lifted, but on conditions,
because unconditional glass is what makes an interface look generated:

- **Glass needs something real behind it.** A blurred panel over flat black samples black and
  returns black — the frosting does nothing. The ambient curve backdrop exists to give the blur
  genuine structure. Never ship glass panels over an empty background.
- **No colour orbs, no gradient haze, no film grain.** These are the AI-design clichés this
  system rejects; each was tried and rejected explicitly during the 2026-08-24 review.
- **Character comes from edge and shadow, not backdrop colour** — a specular hairline on the top
  edge, a faint lift at the bottom, a contact shadow underneath. That is what reads as a physical
  sheet rather than a tinted div.
- **Legibility outranks the effect.** Any text over glass must still clear WCAG AA. If a panel's
  content can't be read, the panel loses its translucency, not the text its contrast.

## Typography

- **Display/Hero numbers:** DM Mono — all financial figures, always, `tabular-nums`. Never render a currency figure in a proportional font.
- **Headings:** Cabinet Grotesk 700/800
- **Body/UI:** Satoshi 400/500/600
- **Code/Terminal:** DM Mono (consistent with number rendering)
- **Loading:**
  ```html
  <!-- Cabinet Grotesk + Satoshi from Fontshare -->
  <link href="https://api.fontshare.com/v2/css?f[]=satoshi@300,400,500,600,700&f[]=cabinet-grotesk@400,500,700,800,900&display=swap" rel="stylesheet">
  <!-- DM Mono from Google Fonts -->
  <link href="https://fonts.googleapis.com/css2?family=DM+Mono:ital,wght@0,300;0,400;0,500;1,400&display=swap" rel="stylesheet">
  ```
- **CSS font tokens** (always use these — never hardcode font names):
  ```css
  --font-display: 'Cabinet Grotesk', sans-serif   /* headings */
  --font-body:    'Satoshi', sans-serif            /* body, UI labels, buttons */
  --font-mono:    'DM Mono', monospace             /* numbers, currency, code */
  ```
- **Scale:**
  ```
  xs:    11px / 1.4  — labels, timestamps, captions
  sm:    12px / 1.5  — secondary UI, form labels
  base:  14px / 1.6  — body, buttons, inputs
  md:    15px / 1.65 — primary body text
  lg:    20px / 1.4  — subheadings
  xl:    28px / 1.2  — section headings (Cabinet Grotesk 700)
  2xl:   40px / 1.1  — page headings (Cabinet Grotesk 800)
  hero:  52px / 1.0  — display numbers, net position (DM Mono)
  ```

## Color

- **Approach:** Restrained with semantic accents — color is rare and meaningful
- **Design principle:** Pure black AMOLED surfaces with a flat elevation model (no violet shift — surfaces stay neutral)

### CSS Variables (authoritative — these are the actual tokens in `globals.css`)

#### Dark Theme (default, AMOLED)
```css
[data-theme="dark"] {
  /* Surfaces */
  --bg-base:       #0a0a0a;   /* page background — AMOLED black (true off-pixel) */
  --bg-surface-1:  #111111;   /* cards, panels */
  --bg-surface-2:  #1a1a1a;   /* inputs, dropdowns, elevated surfaces */
  --bg-surface-3:  #222222;   /* hover states, active rows */

  /* Borders */
  --border-subtle:  rgba(255, 255, 255, 0.06);  /* 1px borders on cards */
  --border-visible: rgba(255, 255, 255, 0.12);  /* dividers, focus states */

  /* Text */
  --text-primary:   #f5f5f5;
  --text-secondary: #a0a0a0;
  --text-muted:     #808080;   /* was #555555 — failed WCAG AA (2.66:1); now ~4.4-5:1 */
  --text-inverse:   #0a0a0a;

  /* Semantic colors */
  --color-inc:       #16a34a;                      /* income, positive, success */
  --color-inc-subtle: rgba(22, 163, 74, 0.12);
  --color-exp:       #dc2626;                      /* expense, negative, error */
  --color-exp-subtle: rgba(220, 38, 38, 0.12);
  --color-warn:      #d97706;                      /* warnings, budget alerts */
  --color-warn-subtle: rgba(217, 119, 6, 0.12);
  --accent:          #2563eb;                      /* interactive, selected, CTA */
  --accent-subtle:   rgba(37, 99, 235, 0.12);
  --accent-border:   rgba(37, 99, 235, 0.25);
  --color-info:      #0891b2;                      /* informational, neutral highlight */
  --color-info-subtle: rgba(8, 145, 178, 0.12);

  /* Shadows */
  --shadow-card:  0 1px 3px rgba(0, 0, 0, 0.4);
  --shadow-modal: 0 24px 64px rgba(0, 0, 0, 0.7);

  /* Glass surfaces (v3) — consumed via the .glass-surface class, never inline */
  --glass-surface: rgba(255, 255, 255, 0.045);
  --glass-border:  rgba(255, 255, 255, 0.09);
  --glass-blur:    blur(24px) saturate(125%) brightness(1.06);
  --glass-edge:
    inset 0 1px 0 rgba(255, 255, 255, 0.16),
    inset 0 -1px 0 rgba(255, 255, 255, 0.03),
    0 8px 24px -12px rgba(0, 0, 0, 0.7);

  /* Chart category palette */
  --cat-0: #2563eb;  --cat-1: #16a34a;  --cat-2: #d97706;  --cat-3: #dc2626;
  --cat-4: #7c3aed;  --cat-5: #0891b2;  --cat-6: #db2777;  --cat-7: #65a30d;
}
```

#### Light Theme
```css
[data-theme="light"] {
  --bg-base:       #f8f8f8;
  --bg-surface-1:  #ffffff;
  --bg-surface-2:  #f3f3f3;
  --bg-surface-3:  #e8e8e8;

  --border-subtle:  rgba(0, 0, 0, 0.06);
  --border-visible: rgba(0, 0, 0, 0.14);

  --text-primary:   #111111;
  --text-secondary: #555555;
  --text-muted:     #707070;   /* was #aaaaaa — failed WCAG AA (2.19:1); now ~4.5-4.9:1 */
  --text-inverse:   #ffffff;

  --color-inc:   #16a34a;   /* same green works on light */
  --color-exp:   #dc2626;
  --color-warn:  #d97706;
  --accent:      #2563eb;
  --color-info:  #0891b2;
}
```

### Legacy Aliases (compat — do not use in new code)
Older page files still reference the pre-v2 token names. These are mapped in globals.css via compat aliases and will be phased out:
```
--bg-page        → --bg-base
--bg-card        → --bg-surface-1
--bg-alt         → --bg-surface-2
--bg-hover       → --bg-surface-3
--border         → --border-subtle
--accent-mint    → --color-inc
--accent-rose    → --color-exp
--accent-indigo  → --accent
--accent-amber   → --color-warn
```
Always use the canonical v2 tokens in new code. Never use the legacy names.

### Semantic Rules
- Positive values, income, savings: always `--color-inc`
- Negative values, expenses, deficits: always `--color-exp`
- Interactive elements, focus rings, links: `--accent`
- Budget warnings, caution states: `--color-warn`
- Never use color as the only distinguishing signal (accessibility)

## Spacing

- **CSS tokens:** Always use spacing variables — never hardcode pixel values
  ```css
  --space-1:   4px
  --space-2:   8px
  --space-3:  12px
  --space-4:  16px
  --space-5:  20px
  --space-6:  24px
  --space-7:  28px
  --space-8:  32px
  --space-10: 40px
  --space-12: 48px
  --space-16: 64px
  ```
- **Row height:** 52px minimum on desktop, 60px on mobile (thumb targets)
- **Radius tokens:**
  ```css
  --radius-sm:   6px    — tags, badges, inputs
  --radius-md:  10px    — buttons, small cards
  --radius-lg:  16px    — cards, panels, modals
  --radius-xl:  24px    — large containers, sheets
  --radius-full: 9999px — pills, avatars
  ```
- **Transition tokens:**
  ```css
  --transition-fast: all 0.12s ease   — hover states, focus rings
  --transition-base: all 0.20s ease   — button presses, toggles
  ```

## Layout

- **Home screen:** Dashboard with hero stat tiles, proactive coach alerts, quick-add FAB, and transaction list. Full financial overview visible without scrolling on desktop.
- **Navigation:** Left sidebar on desktop (collapsible); bottom nav on mobile with a "More" sheet for secondary pages
- **Grid:** 12-column on desktop, 4-column on mobile
- **Max content width:** 1280px
- **Breakpoints:** mobile < 768px, tablet 768–1024px, desktop > 1024px

## Motion

- **Approach:** Intentional — only transitions that aid comprehension or signal state
- **Easing:**
  ```
  enter:  cubic-bezier(0.16, 1, 0.3, 1)   — fast start, smooth settle
  exit:   cubic-bezier(0.4, 0, 1, 1)      — quick exit
  move:   cubic-bezier(0.4, 0, 0.2, 1)    — balanced move
  ```
- **Duration:**
  ```
  micro:  50–100ms   — hover states, focus rings
  short:  150–250ms  — button presses, toggles
  medium: 250–400ms  — panel transitions, modal open
  long:   400–700ms  — chart mount animations, page transitions
  ```
- **Chart animation:** Mount on first render only. Never loop.

## Data Visualization (Recharts)

- Remove all default Recharts borders, backgrounds, gridlines — start from zero
- **Gridlines:** Horizontal only, `--border-subtle` color, 1px, no vertical lines
- **Area charts:** Gradient fill from `rgba(22,163,74,0.2)` at line to `rgba(22,163,74,0)` at base. Line: 1.5px, `--color-inc`.
- **Tooltips:** Background `--bg-surface-2`, 1px border `--border-visible`, DM Mono for the number, Satoshi for label. No drop shadows. No `backdropFilter`.
- **All chart numbers:** DM Mono, `tabular-nums`, appropriate semantic color
- **Axis labels:** 11px, `--text-muted`, DM Mono
- **Category colors:** Use `--cat-0` through `--cat-7` tokens — never hardcode hex in chart config

## AI Interface

The AI layer is spread across dedicated pages and a persistent FAB:

- **Quick Add FAB:** Floating action button in bottom-right (56px). Tapping opens the quick-add sheet to log a transaction in natural language.
- **AI Chat (`/ai-chat`):** Full conversational interface with the general-purpose financial assistant.
- **AI Advisor (`/ai-advisor`):** Four specialized domain agents (Debt Coach, Investment Advisor, Tax Planner, Budget Master) with persistent conversation history. Each agent panel has conversation starters and a compact sidebar for switching agents.
- **Inline AI features:** Monthly report, personality analysis, regret patterns, forecast, opportunities, and health report are each surfaced within their respective domain pages — not a central hub.

## Component Library

Every component uses CSS variables only — no hardcoded hex values.

| Component | File | Description |
|---|---|---|
| `PageShell` | `components/layout/PageShell.tsx` | Universal page wrapper — title, subtitle, headerRight slot, responsive padding |
| `Button` | `components/ui/Button.tsx` | 5 variants: primary / secondary / ghost / danger / icon |
| `Card` | `components/ui/Card.tsx` | `--bg-surface-1` container with optional hover lift |
| `StatTile` | `components/ui/StatTile.tsx` | Hero metric tile — DM Mono value, Cabinet Grotesk label, trend pill |
| `TransactionList` | `components/transactions/TransactionList.tsx` | Swipe-left to delete (mobile), hover-edit (desktop) |
| `EmptyState` | `components/ui/EmptyState.tsx` | Standardised empty state: Lucide icon, title, optional CTA |
| `Modal` | `components/ui/Modal.tsx` | `createPortal(content, document.body)` — always at body root |
| `Skeleton` / `SkeletonCard` | `components/ui/Skeleton.tsx` | Shimmer loading — replaces all spinners |
| `Badge` | `components/ui/Badge.tsx` | Colored status/label chip |
| `ProgressBar` | `components/ui/ProgressBar.tsx` | Animated progress with color variants |
| `FAB` | `components/ui/FAB.tsx` | Floating action button for quick add |
| `BottomSheet` | `components/ui/BottomSheet.tsx` | Mobile slide-up sheet |
| `Toast` / `ToastContainer` | `components/ui/ToastContainer.tsx` | Non-blocking ephemeral feedback |
| `NotificationBell` | `components/ui/NotificationBell.tsx` | Header bell with unread count badge |
| `AIResponseCard` | `components/ui/AIResponseCard.tsx` | Formatted AI response with sections and highlights |
| `ThemePicker` | `components/ui/ThemePicker.tsx` | Dark / light theme toggle |
| `WalkthroughTour` | `components/ui/WalkthroughTour.tsx` | Step-by-step onboarding tour overlay |
| `Input` | `components/ui/Input.tsx` | Styled text input with label and error states |
| `DatePicker` | `components/ui/DatePicker.tsx` | Date input with calendar popover |

### Input / Form Pattern
All form inputs use this inline style baseline — never deviate without a documented reason:
```css
background:    var(--bg-surface-2)
border:        1px solid var(--border-subtle)
border-radius: var(--radius-sm)
padding:       10px 12px
color:         var(--text-primary)
font-size:     14px              /* minimum — prevents iOS zoom */
font-family:   var(--font-body)
```

Labels: `11px / 600 / var(--text-secondary) / uppercase / 0.5px letter-spacing`

Error text: `11px / var(--color-exp)`

## Surfaces & Backdrop (v3)

### `.glass-surface` — the card material
Defined once in `globals.css`. Cards opt in by adding the class and dropping their own
`background`/`border`; they keep their own `border-radius` and padding.

```jsx
// before
<div style={{ background: 'var(--bg-surface-1)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: '18px 20px' }}>
// after
<div className="glass-surface" style={{ borderRadius: 'var(--radius-lg)', padding: '18px 20px' }}>
```

Never redefine `--bg-surface-1` to a translucent value — 200+ call sites still rely on it
being opaque, and blanket-converting them produces unreadable stacked translucency.

The shared `Modal`/`BottomSheet` components (`components/ui/`) are glass by default — every
modal and sheet in the app inherits it. Their scrim (`rgba(0,0,0,0.55–0.7)` + blur) sits behind
the dialog, so the glass frosts dimmed page content rather than flat black, same rule as any
other `.glass-surface` use.

### `.ambient-lighting` — what the glass frosts
A fixed, inert SVG layer mounted once in `AppLayout`, sitting at `z-index: 0` beneath all
page content (`main` is lifted to `z-index: 1`). Two soft radial light pools (replaced the
original data-curve version on 2026-08-25 — see Decisions Log):

| Pool | Colour | Position |
|---|---|---|
| Income | `--color-inc` → `--accent` | Upper-right |
| Expenses | `--color-exp` → `--color-warn` | Lower-left |

All four hues are existing semantic tokens, kept from the curve version — the colour still
means something even though the shape no longer traces real data. Deliberately dim
(0.28–0.32 peak stop-opacity) so it reads as light, not paint. Light theme drops the whole
layer to 35% opacity.

## Navigation

- **Desktop:** left sidebar, collapsible, 240px
- **Mobile:** floating glass pill docked 14px from the bottom, inset 12px each side, with the
  add-transaction button as a **detached blue circle beside it**. The two are one flex row —
  as the More panel opens, the button folds to zero width and the pill expands to fill it.
- **Tabs:** four only — Home, Money, Insights, More. AI Chat lives in More → Tools.
- **Active state:** a soft rounded-square (`rgba(255,255,255,0.15)`, `--radius-md`) behind the
  icon, icon switches to solid fill and `--text-primary`. Not a coloured pill — the accent
  colour is reserved for the action button, so the nav stays quiet and the action stays loud.

## Forms

### Destructive actions never sit inside routine forms
Deleting a category uncategorises every transaction using it. It used to be a `✕` on every
row of the category dropdown *inside the add-transaction form* — one mis-tap from a routine
field selection, guarded only by `window.confirm`. Destructive operations belong in a
management surface, never inline in a picker. Additive actions (create a category on the
spot) are fine and stay.

### Pickers open in their own sheet, never as popovers inside a scrolling container
The date picker was a popover anchored upward (`bottom: calc(100% + 8px)`) inside the form's
own `overflow-y: auto` container, so near the top of the sheet it clipped. Any picker that
needs more than a row of space gets its own portalled sheet — it cannot clip, and it works
identically on mobile and desktop via `Modal`.

Pair every date picker with quick options (Today / Yesterday / 2 days ago). Most entries never
need the grid.

### A form's shape follows its type
Transfer shares only *amount* and *date* with expense and income. It has no category, tags,
goal, payment method or investment block, and it needs two account pickers nothing else uses.
Those fields are hidden for transfers rather than rendered and ignored, and the From/To
pickers sit directly beneath the amount, because for a transfer those three fields are the
entire transaction.

Transfer amounts use `--accent`, not `--color-exp` — a transfer is neither a gain nor a loss,
and colouring it red read as money lost.

## Anti-Patterns (never do these)

- No gradient haze or film-grain texture behind glass — two of the three canonical
  AI-generated-design tells (the third, colour orbs, is now the sanctioned backdrop itself —
  see `.ambient-lighting` above and the 2026-08-25 decision log entry for why this one's
  different from the generic version that was rejected).
- No glass over an empty background — if there's nothing behind it, use an opaque surface
- No hardcoded hex in component files — always use CSS variables
- No proportional fonts for currency figures
- No looping chart animations
- No drop shadows on tooltips
- No vertical gridlines in charts
- No alternating row colors in tables
- No using legacy `--bg-primary`, `--accent-mint`, etc. token names in new code
- No `color-mix()` inline — define a semantic token if you need a derived color

## Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-04-02 | Cabinet Grotesk replaces Sora | Tighter, more confident, better at display sizes |
| 2026-04-02 | Satoshi replaces DM Sans | Better optical spacing at small sizes |
| 2026-04-02 | DM Mono for all financial figures | Makes currency data feel instrumental, not decorative |
| 2026-04-02 | Full-width pulse view as home | Competitors all use KPI grids — deliberate departure |
| 2026-04-02 | No glassmorphism | Category-ubiquitous now, no longer a differentiator |
| 2026-06-04 | **AMOLED black (#0a0a0a) for `--bg-base`** | Superior on OLED panels; difference is imperceptible on LCD |
| 2026-06-04 | **Font tokens unified** (`--font-display`, `--font-body`, `--font-mono`) | Single source of truth; purged bare `Sora,sans-serif` and `DM Sans,sans-serif` strings from components |
| 2026-06-04 | **Glassmorphism banned in code** | `backdropFilter` removed from TrendChart, CategoryChart tooltips; `--glass-bg/border` aliases retired |
| 2026-06-04 | **v2 token system adopted** | Old `--bg-primary/secondary/card`, `--accent-mint/rose/indigo/amber` replaced with semantic `--bg-base/surface-1/2/3`, `--color-inc/exp/warn`, `--accent`. Legacy compat aliases maintained for transition. |
| 2026-06-04 | **Violet elevation model retired** | Surfaces stay neutral gray rather than shifting toward violet. AMOLED blacks on dark theme. |
| 2026-06-12 | **`--color-info: #0891b2` added** | Needed for neutral informational states (loan DTI, ITR readiness) without overloading warn or accent |
| 2026-06-12 | **Spacing + radius tokens added** (`--space-*`, `--radius-*`) | Enforce consistent spatial rhythm across the component library |
| 2026-06-12 | **Category palette tokens** (`--cat-0` through `--cat-7`) | Consistent colors across all charts — no per-chart hardcoded hex |
| 2026-06-20 | **`--text-muted` darkened/lightened for contrast** | Both themes' `--text-muted` failed WCAG AA (dark: 2.66:1, light: 2.19:1) on surface backgrounds — used for the 11px `xs` scale (timestamps, captions, labels) where it mattered most |
| 2026-06-20 | **IA consolidation — hub/tab pages** | Net Worth + Wealth Intelligence merged into one tabbed page; 33 nav entries were causing choice paralysis. New `Tabs` component added for reuse across remaining hub merges |
| 2026-08-17 | **`--color-bill-due: #f97316` added** | Calendar's "Bill Due" indicator was hardcoded, violating the no-hardcoded-hex rule. Kept distinct from `--color-warn` (#d97706) — "bill due" and "budget risk" are different semantic concepts and conflating them would blur meaning across the app's other `--color-warn` usages |
| 2026-08-24 | **Glassmorphism ban lifted, conditionally** | Reverses the 2026-06-04 decision. Glass is permitted *only* over the ambient curve backdrop — over flat black the blur samples nothing and the panel is just a tinted div. Delivered as an opt-in `.glass-surface` class rather than by redefining `--bg-surface-1`, so the 200+ existing call sites stay opaque and legible |
| 2026-08-24 | **Ambient curve backdrop added** | Glass needs real structure behind it. Rather than the usual colour orbs, the backdrop is the user's own income/expense curves — reviewed against a grey wash, colour orbs, film grain, a ledger grid and contour rings, all rejected. Meaningful beats decorative, and it dodges the AI-generated look |
| 2026-08-24 | **AMOLED black retained over navy** | A dark-navy base was trialled during the Samsung-Health-inspired review and rejected. `#0a0a0a` stays — genuine OLED pixel-off, and it makes the curve backdrop read as light rather than paint |
| 2026-08-24 | **Mobile nav → floating pill + detached action button** | Inspired by Samsung Health's dock. The full-width docked bar became a floating glass pill; the add button moved out of `AppLayout` and into the dock so the two morph as one unit. Tab count dropped 5 → 4 (AI Chat moved into More → Tools) to keep the pill uncrowded once the button took horizontal space |
| 2026-08-24 | **Nav active state is neutral, not accent** | A soft rounded-square behind the icon rather than a blue pill. Keeps `--accent` exclusive to the action button, so the primary action stays the loudest thing in the dock |
| 2026-08-25 | **Category delete removed from the add form** | It sat as a `✕` on every row of the category dropdown, guarded only by `window.confirm` — the only one in that surface. A data-destroying action (it uncategorises every transaction using that category) one mis-tap from picking a field. Moves to category management |
| 2026-08-25 | **Date picker moved into its own sheet** | Was a popover opening upward inside the form's scrolling container, which clips near the top of the sheet. Portalled sheets cannot clip. Quick options (Today / Yesterday / 2 days ago) added, since most entries never need the calendar grid |
| 2026-08-25 | **Transfer form stripped to its own shape** | Transfer shares only amount and date with expense/income. Tags, notes, category, goal, payment method and the investment block are now hidden for transfers instead of rendered-and-ignored, and From/To sit directly under the amount. Amount uses `--accent` rather than `--color-exp` — a transfer is not a loss |
| 2026-08-25 | **Calendar relocated from Transactions to Insights** | Calendar and List were two tabs on `/transactions` sharing no state — different month, no filters, no select mode. They're different jobs (analysis vs. management), so Calendar moved to its own pill on `/analytics` (`components/analytics/CalendarTab.tsx`); `/calendar` now redirects there instead of to `?view=calendar` |
| 2026-08-25 | **Sort control added to Transactions** | The list had no way to sort — always server/date order. Added `sortTransactions()` (`lib/transactionFilters.ts`) with Newest/Oldest/Largest/Smallest, default Newest, opened from the top bar's sort icon |
| 2026-08-25 | **Transactions top bar rebuilt as a floating glass bar (B2)** | Replaces the old header card + income/expense `GCard` pair + List/Calendar `Tabs`. Net amount is the hero (numbers-as-hero stays the brand rule); income/expense demoted to chips underneath. Search and filter are icon-only — search expands inline in place rather than opening a persistent box (the "B2" option over a docked search box) |
| 2026-08-25 | **Transaction rows go two-line on mobile** | Old mobile row was icon / description+category / amount+re-printed-date — the date duplicated the sticky group header above it, and payment method, tags and the category's colour never showed at all. New shape: line 1 is icon + description + amount; line 2 is a category dot + name, plus a payment-method chip and up to 2 tags, or an amber "Uncategorised" flag when there's no category |
| 2026-08-25 | **Swipe-to-delete gained a resting affordance** | The red delete reveal only rendered while actively dragging — nothing hinted the gesture existed at rest. Added a thin, always-visible red edge strip on the row's right side; the full reveal still only appears mid-drag |
| 2026-08-25 | **`Modal`/`BottomSheet` converted to glass** | The 2026-08-24 rollout was Dashboard-only; every modal and sheet in the app (add-transaction, imports, filters, pickers) still rendered the old opaque `--bg-surface-1`, so they looked stale next to the now-glass pages that open them. Converting the two shared components fixes every call site at once |
| 2026-08-25 | **Bottom nav's glass fill: lighter, then reversed to dense (`.glass-nav`)** | First made more translucent than `.glass-surface`. Once the transaction rows behind it were actually rendering as busy, colorful glass content (see the mobile-rows fix below), that translucency hurt legibility, so `--glass-nav-surface` went dense instead (`rgba(10,10,10,0.88)` dark / `rgba(255,255,255,0.9)` light) — near `--bg-base` but not quite, so the blur still has some presence. Kept as its own modifier rather than touching the shared token |
| 2026-08-25 | **Beside-pill Add button re-enabled on `/transactions`** | `hideAddRoutes` in `BottomNav.tsx` excluded `/transactions` from day one, back when that page's own header owned an add button. It still does (the top bar's `+` icon, plus the separate Quick Add sheet), but the beside-pill button's *position* had drifted out of sync with every other page. Removed the exclusion so the position is uniform everywhere; the page keeps its own additional entry points rather than losing them |
| 2026-08-25 | **Backdrop switched from data curves to ambient lighting** | Reverses the 2026-08-24 decision. Colour orbs were rejected then as one of the three AI-generated-design tells; requested again, mocked up side-by-side against the live curves with that history flagged explicitly, and approved after seeing it fresh. What's different from the originally-rejected generic version: same four semantic hues as the curves (not invented decoration), positioned where the curves used to sit (income upper-right, expense lower-left) rather than arbitrarily, and deliberately dim (0.28–0.32 peak opacity, down from an initial 0.5+ pass) per direct feedback on the first cut. The trade-off named at approval time: the glow position is no longer tied to real data the way the curve's bend was — legible-but-arbitrary was chosen over meaningful-but-busier |
| 2026-08-25 | **Add-transaction form actually rebuilt to match the approved mockup** | The 2026-08-25 "safer add form" pass only shipped the structural safety fixes (category-delete removal, date sheet, transfer split) — the mockup's actual point, four fields by default with the rest collapsed behind "More details," was never built; the form still showed 8-14 groups unconditionally. Fixed: `showMore` state collapses payment method / card / investment details / goal / tags / notes behind a toggle (auto-opens when editing, or when an investment category is picked); Category and Date now sit in the two-col row the mockup shows; fields, the type toggle and pills switched from opaque `--bg-surface-2` to the glass-field look (`color-mix` wash + `--glass-border`); the footer became a single dynamic-label CTA (`Add ₹200 expense`, `Transfer ₹5,000`) instead of a Cancel+Submit pair, since the header's ✕ already closes it; transfer gets a violet swap icon and violet CTA (`#8b5cf6`, matching the existing hardcoded tag-pill violet) since it's neither a gain nor a loss |
| 2026-08-25 | **`Modal`/`BottomSheet` get a denser `.glass-sheet` fill** | The generic `.glass-surface` card recipe (4.5% dark tint) is too faint for a form that must stay legible regardless of what's scrolled behind it. New `--glass-sheet-surface` token (denser than the card default, matching the approved mockup's sheet) applies to both, plus the header close button went from an opaque `--bg-surface-2` square to a translucent `color-mix` circle |
| 2026-08-25 | **Profile redesigned — first page in the full app-wide rollout** | Dashboard and Transactions were the only two of ~34 routes on the glass/ambient-lighting language; this starts the page-by-page rollout (roadmap: small pages first, then Analytics/Insights, then the rest, largest last). All cards converted to `.glass-surface`. Change Password now collapses behind a row instead of sitting permanently open — a security action most people touch once a year doesn't earn permanent screen space, same reasoning as the add-transaction form's "More details". The thin one-row "Data" and "App" cards merged into one "Preferences" card. The inline success/error message box under each form was dropped — every save already fires a toast, so the box was saying the same thing twice; toast alone now matches how feedback works everywhere else in the app |
| 2026-08-25 | **Ambient-lighting mount hoisted to `AppLayoutGate`** | Onboarding, Login, Register, and Forgot Password render with zero app chrome (`AppLayoutGate`'s `noChromeRoutes`) — no `AppLayout`, so no ambient backdrop, since that SVG lived inside `AppLayout` itself. Glass on these pages would have had nothing to frost. New `AmbientLighting` component extracted from `AppLayout` and mounted once in the gate, before the chrome/no-chrome branch, so every route gets it regardless. Same colours and positions, no visual change to already-converted pages |
| 2026-08-25 | **Onboarding redesigned — second page in the rollout** | Wizard card converted to `.glass-surface` now that it has a backdrop to frost. Option tiles/rows inside it (Welcome's feature grid, Currency/Appearance/Import choices, Budget rows) use a lighter glass-field wash (`color-mix` + `--glass-border`) rather than full nested glass, same convention as the add-transaction form's fields — full glass-on-glass reads muddy. No copy, step order, or logic changes |
| 2026-08-25 | **`.glass-field` promoted to a global class; `Input` gets a `variant="glass"` prop** | The nested-glass wash for form fields/tiles was a per-page local const (first onboarding, now needed again for the shared `AuthPanel`). Promoted to a standalone `.glass-field` class (no `backdrop-filter` — it lives inside an already-blurred parent) so the next ~30 pages in the rollout don't redeclare it. `Input` (`components/ui/Input.tsx`) can't take a `className` override, and overriding its `border` via the `style` prop would have clobbered the focus/error color logic on every keystroke — so it got a real `variant` prop instead, default unchanged for every page not yet touched |
| 2026-08-25 | **Auth screens (Login/Register/Forgot Password) redesigned — third page(s) in the rollout** | All three share `AuthPanel`; one conversion covers all of them. Desktop brand panel: opaque `--bg-surface-1` → `.glass-surface`. Its "Net Position" preview card: opaque `--bg-base` → full `.glass-surface` (not the lighter field wash — it's meant to look like a real dashboard card, so it should actually look like one now that the dashboard is glass). Every input on all three pages: `variant="glass"`. Mobile stays the existing bare, card-free layout |
| 2026-08-25 | **FIRE calculator removed entirely, not redesigned** | Came up for its Tier-1 redesign mockup; the user confirmed they never actually open the page and asked for full removal instead of a facelift. Deleted `app/fire/`, `components/fire/`, the `/fire` and `/sip`-adjacent-but-unused backend helpers (`computeCurrentNetWorth`, `computeAverageMonthlyIncomeAndExpenses`, `monthsToReach`), the `/fire`/`/sip` planning routes, the opportunities detector `detectSipUnderinvesting` (pointed at the now-gone page), and the nav entries in both `Sidebar` and `BottomNav`. Also dropped the orphaned `fire_targets` read in the Investment Advisor AI prompt — nothing in the codebase had ever written that table, so `fire_target` was always null in practice. Docs (`README.md`, `docs/AI_FEATURES.md`, `docs/FINTRACK_DOCUMENTATION.md`) updated to match |
| 2026-08-26 | **Scenarios (What-If) removed entirely, same reasoning as FIRE** | Next up for its Tier-1 redesign; the user again confirmed they never open it and asked for removal outright. Deleted `app/scenarios/`, the `getScenarios`/`getScenario`/`createScenario`/`updateScenario`/`deleteScenario`/`simulate` API client methods, the nav entries in `Sidebar` and `BottomNav`, and the entire backend `/scenarios` CRUD + `/scenarios/simulate` block in `planning.js` (the four `simulate*` functions, `buildYearlyProjection`, `classifyDti`, and the now-scenario-only `simulateGrowth`, which was kept during the FIRE cleanup because scenarios still used it). `SCENARIO_TYPES`/`isValidScenarioType` dropped from `validation.js` since planning.js was their only consumer. The live `scenarios` table itself was left alone — same as `fire_targets`, no destructive migration against production data — but every code path that read or wrote it is gone. Docs updated to match; the `033_scenarios.sql` migration-history line was left as a historical record, not a description of current schema |
| 2026-08-26 | **Savings Plan redesigned — kept, unlike FIRE/Scenarios, since the user confirmed regular use** | All four Savings-Plan-tab sections (Pay Yourself First, Round-Up Simulator, 30-Day Challenges, Savings Streak), the Forecast tab (stat tiles, calendar, category breakdown, AI insight), and the Milestones tab (stat tiles, milestone tree cards) converted to `.glass-surface`/`.glass-field`. Mostly mechanical — no IA changes to the three-tab structure. `Card`/`GCard`/`StatTile` don't accept a `className`, so their glass look is applied via a `style` override (a shared `glassTileStyle` const) rather than touching the components themselves, same non-invasive approach as Profile's GCard replacement. Legacy compat-alias tokens this page still used (`--bg-card`, `--border`, `--bg-alt`, `--font-head`) normalized to their current names — no visual change, just off the alias list. One real bug fixed in passing: the Round-Up toggle and its assigned goal reset to off on every reload (never persisted), unlike the per-goal monthly amounts right above them which already saved to `localStorage` — now persisted the same way (`fintrack-round-up-plan` key) |
| 2026-08-26 | **Analytics — Overview tab redesigned, first of six views (Tier 2's biggest page)** | At 2,191 lines across 6 views (Overview, Insights, Calendar, plus Reports/Year-Review/Personality reached only via `?tab=` deep link), this page is being converted one view at a time rather than in one pass — the user's explicit call after seeing the scope. Overview's four sections (KPI grid, charts, bank balances, salary allocation, etc.) were comment-labeled blocks (`{/* ── SPENDING ── */}` etc.) stacked in one long scroll with no actual tab UI behind the comments; promoted to a real hand-rolled sub-tab switch (`innerTab` state, matching how `InsightsTab` already hand-rolls its own inner tabs rather than reusing the shared `Tabs` component, which stays opaque for the ~30 pages still unconverted). All cards → `.glass-surface`, nested tiles (account cards, YoY cards, allocation buckets, insight rows, day-of-week cells) → `.glass-field`. Real bug fixed found during audit: the Year-over-Year card colored a rise in Expenses green (as if it were good) while the KPI grid a few hundred lines above colors the identical concept red — added a `higherIsBetter` flag per YoY card so a rise in Expenses now reads red everywhere, matching the rest of the page |
| 2026-08-26 | **Analytics — Insights tab redesigned, second of six views** | Its own inner 3-way switch (Opportunities / Peer Benchmarks / Behavioral Patterns) was underline-style tabs, a different visual language from the glass pills Overview just got — converted to match, so the whole page now uses one tab language throughout (shown as an explicit either/or in the mockup, not decided unilaterally). All cards → `.glass-surface`, small chips (icon boxes, the "N of 5 patterns" pill) → `.glass-field`; list rows inside the benchmark/pattern cards stay as plain divider lines rather than individually boxed, matching how a dense list reads elsewhere in the app. Real bug fixed found during audit: `patternContext()` can return an empty string for a detected-but-data-thin pattern, and the JSX rendered a `&lt;p&gt;` for it regardless — leaving a blank, oddly-spaced line. Now skipped when there's nothing to show |
| 2026-08-26 | **Analytics — Calendar tab redesigned, third of six views** | Lives in its own `components/analytics/CalendarTab.tsx`, not `page.tsx`. Purely mechanical — no structural decision and no bug found on audit, unlike Overview and Insights. Month-nav card, stat tiles, legend bar, calendar grid, and the day-detail panel → `.glass-surface`; nav buttons, empty padding cells, the day-of-week header row, and scheduled-item rows → `.glass-field`. The two imperative `onMouseEnter`/`onMouseLeave` hover handlers (calendar cells, transaction rows) switched from opaque `--bg-surface-3` to a translucent `color-mix` tint so hover reads correctly over the frosted background. `BottomSheet` (the mobile day-detail sheet) was already glass from the 2026-08-25 rollout, so nothing needed there |
| 2026-08-26 | **Analytics — Reports tab redesigned, fourth of six views (deep-link only)** | Reached via `?tab=reports`, not a pill on the page. Its inner segmented control ("📊 Date Range Report" / "🏆 Health Report Card") was the only tab label in the whole app using emoji — dropped to plain text, shown as an explicit either/or in the mockup rather than decided unilaterally. All cards (header, date-range picker, summary tiles, category breakdown, transactions list, and every Health Report Card section) → `.glass-surface`; quick-range pills, the segmented-control wrapper, and category chips → `.glass-field`. `glassTileStyle` (the `GCard`/`StatTile` style-override const, previously local to `AnalyticsOverviewTab`) hoisted to module scope so every tab on this page can share it. Two cleanups made while touching this file: the "Regenerate" health-report button's identical inline async handler (duplicated at the empty-state and populated-state call sites, flagged in the original audit) extracted to one `generateHealthReport` function; and a transaction category chip's background fell back to the literal string `var(--bg-surface-2)20` when `category_color` was unset — invalid CSS silently ignored by the browser — now only appends the hex-alpha suffix when a real color exists |
| 2026-08-26 | **Analytics — Year Review tab redesigned, fifth of six views (deep-link only)** | Reached via `?tab=year-review`. Purely mechanical — no bug and no decision needed. Header, animated count card, the 4 year-stat tiles, Highlights card, and the Share Your Story wrapper → `.glass-surface`; year pills and the highlight rows inside Highlights → `.glass-field`. Two things deliberately left untouched: the gradient "FinTrack {year}" card inside Share Your Story stays a solid accent gradient rather than glass, since it's meant to be screenshotted and shared outside the app and needs to render the same regardless of what's behind it; and the floating "take a screenshot" toast stays opaque, same reasoning already applied to the shared `ChartTooltip` earlier in this rollout |
| 2026-08-26 | **Analytics — Personality tab redesigned, sixth and last view — the whole page is now glass** | Reached via `?tab=personality`. Header, loading/error states, the dimension-scores card, and the Traits/Strengths/Watch-Outs cards → `.glass-surface`. The hero profile card and the "What to focus on" tips card keep their existing accent-tinted `color-mix` treatment (`--accent-3` for the hero, `--accent` for the tips card), just composited over `--glass-surface`/`--glass-border` instead of the old opaque base — same recipe as the Behavioral Insights AI card from the Insights-tab pass. Dimension progress-bar tracks switched from `--bg-surface-3` to `--border-subtle`, matching every other hand-drawn track converted across this page. This closes out the full six-view Analytics redesign (Overview, Insights, Calendar, Reports, Year Review, Personality) |
| 2026-08-26 | **Goals redesigned — first Tier-2 page after Analytics** | Header, Overall Progress card, AI Life Event Planner strip, search input, and every goal card → `.glass-surface`; form fields, buttons, and toggle tiles inside the four already-glass-sheet modals (New Goal, Edit Goal, Add Funds, AI Life Event Planner) → `.glass-field`. Carried over a precedent from Profile rather than deciding fresh: dropped the header's decorative `--bg-glow` circle, since the global ambient backdrop already provides that atmosphere and a second glow behind the header competed with it. The header's "New Goal" button also dropped its hardcoded `rgba(255,255,255,...)` overlay for the standard glass-field treatment |
| 2026-08-26 | **Health Score redesigned** | Small, self-contained page — no bug, no decision. Score hero, score-history sparkline card, and the Factor Breakdown card → `.glass-surface`; row/header dividers inside Factor Breakdown → `--glass-border`. The back-button hover tint switched from opaque `--bg-surface-3` to a translucent `color-mix`. The recharts tooltip and the small "No change" delta chip were deliberately left opaque, same reasoning as every chart tooltip and small chip left alone throughout this rollout |
| 2026-08-26 | **Planning redesigned — wizard + 5-tab results view** | All 15 `GCard` call sites across the setup wizard and the Start/Monthly/Portfolio/5-Year/Loan tabs → `.glass-surface` via a shared `glassTileStyle` override, since `GCard` can't take a className. Expense rows, the credit-card/goal/loan toggle rows, the risk-profile segmented control, `FundCard` tiles nested inside Portfolio cards, and the Recalculate modal's `DriftRow`s → `.glass-field`; row dividers inside the Monthly waterfall, 5-Year table, and Loan balance list → `--glass-border`. Real (likely-dormant) bug fixed: the Start tab's empty state read "Coming in Phase 5" — internal roadmap language exposed as product copy. The backend's deterministic narrative fallback means this branch is probably unreachable in practice, but the string was wrong regardless, so it's now "Your setup checklist will appear here once your plan finishes generating." |
| 2026-08-26 | **Net Worth redesigned (also covers Wealth Intelligence, which redirects here)** | Mechanical, no bug, no decision. Hero net-worth card and every `Card` across Overview/Velocity/Allocation → `.glass-surface` via a shared `glassTileStyle` override, since `Card` can't take a className. Table row dividers → `--glass-border`; the Allocation tab's recommendation-note box and the dynamic-chart loading skeleton → `.glass-field`. Small chips (the wealth-velocity trend badge, its "Need 2+ months of data" state) left opaque, same as every small badge throughout this rollout |
| 2026-08-26 | **Cash Flow redesigned** | Mechanical, no bug, no decision. Summary tiles and every `Card` (Waterfall, Running Balance, 12-Month Projection table, Fixed Obligations, the collapsible Assumptions card) → `.glass-surface` via a shared `glassTileStyle` override. Table header/row dividers and the fixed-obligations loan-row divider → `--glass-border`; the chart loading skeleton → `.glass-field`. Status chips (Surplus/Tight/At Risk/Healthy) left opaque, same as every small badge throughout this rollout |
| 2026-08-26 | **Debt Intelligence redesigned (Overview + Loans tabs)** | Mechanical, no bug, no decision — the biggest Tier-2 page redesigned so far by surface area (Overview's DTI/Credit-Utilization/Payoff-Optimizer/Prepayment cards, Loans' expandable per-loan amortization detail, 3 modals). Every top-level `Card` → `.glass-surface` via `glassTileStyle`; the avalanche/snowball comparison tiles, loan edit/mark-repaid icon buttons, the amortization summary strip, pagination buttons, prepayment log rows, and modal form fields/Cancel buttons (Add Loan, Edit Loan, Log Prepayment — all already glass-sheet) → `.glass-field`. Table and section dividers → `--glass-border`. AI-recommendation callouts (payoff optimizer, prepayment calculator, credit utilization) kept their existing `--accent-subtle` tint unchanged — already translucent, not opaque cards |
| 2026-08-26 | **Investments redesigned, including the nested CAMS Importer** | Mechanical, no bug, no decision. Stat tiles, the search input, and each asset-type group's holdings `Card` → `.glass-surface` via `glassTileStyle`; holding-row dividers → `--glass-border`. Modal form fields and Cancel buttons (Add Investment, Update Price — both already glass-sheet) → `.glass-field`. In the nested `components/investments/CamsImporter.tsx` (renders inside the already-glass "Import from CAMS" modal, found via a grep audit rather than the top-level page read): the drag-drop dropzone, the "what is a CAS" info callout, and each holding-review row → `.glass-field`; the review step's bottom divider → `--glass-border`. Small badge chips (group-count, "Live" price-source) and disabled-button-state colors left opaque, same precedent as every small chip/disabled-state throughout this rollout |
| 2026-08-26 | **Accounts redesigned — first Tier 3 page** | Net Worth header, bank/credit-card entry cards, and wallet `GCard` tiles → `.glass-surface`; header's decorative `--bg-glow` circle dropped (Profile/Goals precedent). Action-row dividers under bank/card entries → `--glass-border`; colour bands (bank/card brand colour) left untouched — not a surface token. Real inconsistency found on audit and given an explicit A/B mockup: this page's 5 modals (Bank, Card, Pay Bill, Wallet, Delete Confirm) are hand-rolled via `createPortal` rather than the shared `Modal` component, so converting only their fields to `.glass-field` would have left the panel itself opaque — visibly inconsistent with every other modal in the app, which has been `.glass-sheet` since 2026-08-25. Chose option B: panels now use `className="glass-surface glass-sheet"` exactly like `Modal.tsx`, header/footer borders and the close-button's `color-mix` circle copied from that component verbatim so hand-rolled and shared modals are pixel-identical in treatment |
| 2026-08-26 | **Documents redesigned** | Mechanical, no bug, no decision — uses the shared `Card` and already-glass `Modal` components throughout, so no modal-shell question like Accounts had. Document cards → `.glass-surface` via `glassTileStyle`. The type-filter pills and FY-filter select sit directly on the bare page background (no parent card), so they follow the Analytics inner-tab precedent: inactive → `.glass-field`, active → solid `--accent`, border dropped to `none` so the class supplies it. Upload modal's dropzone, form fields, and the FY badge chip on each document card → `.glass-field`; the download icon button (previously opaque `--bg-surface-2`) matches; the delete icon button's existing `color-mix` red tint was left as-is, already translucent |
| 2026-08-26 | **AI Advisor redesigned (covers AI Chat too, which already redirects here)** | Mechanical, no bug, no decision. Note: DESIGN.md's AI Interface section describes four domain agents; the app has since consolidated to one assistant ("Fin") — that description is stale, not something this pass tried to fix. Sidebar and chat panel → `.glass-surface`; sidebar divider and chat-header/input-bar borders → `--glass-border`. The real mechanical work: every `color-mix(FIN_COLOR %, var(--bg-surface-1))` tint (New Chat button, avatar circles, assistant message bubbles, the typing indicator, starter-prompt buttons, chat header background) was mixing against an opaque base — switched to mix against `transparent` now that these sit on glass rather than an opaque card, same reasoning as the Investments/CamsImporter conversion's `dragOver` background handling. Message input → `.glass-field`; conversation-row hover switched from opaque `--bg-surface-3` to a translucent `color-mix` tint, matching the Calendar-tab precedent. Active-conversation's `--accent-subtle` highlight and the Send button's disabled-state colors are unchanged |
| 2026-08-26 | **Groups redesigned (list view, detail view, all 3 modals)** | Mechanical, no bug — the "hand-rolled modal shell" question from Accounts came up again (Group, Split, Link Transaction modals all use `createPortal` directly, not the shared `Modal` component), but since option B is now established precedent rather than a fresh decision, it was applied directly without re-asking: all 3 panels → `className="glass-surface glass-sheet"`. List/detail headers, group-list rows, budget-bar card, empty-state boxes, and transaction/split/settlement rows → `.glass-surface`; `GCard` "You Owe"/"Owed to You" tiles → `.glass-surface` via `glassTileStyle` (can't take className). Main tabs, the split-mode toggle, and the emoji picker follow the Analytics/Documents pill pattern: inactive → `.glass-field`, active → solid `--accent` or `--accent-subtle`. Every modal field, the search-result rows, and icon buttons (Edit/Delete/Back/Add Existing) → `.glass-field`; the unsettled-share avatar's flat `--bg-surface-2` fill → a neutral translucent `color-mix`. Semantic `Badge`/color-mix tints (Settled/Pending, the custom-split balanced-tally box, the "All settled up!" green border) left as-is |
| 2026-08-26 | **Budgets — Budgets tab redesigned, first of four (the app's largest page)** | At 2,106 lines across 4 tabs (Budgets, Recurring, Splits, One-Time), this page is being converted one tab at a time — the user's call after seeing the scope, same as Analytics. Header card, Overall Usage card, budget category cards, the zero-based-mode banner (previously flat `--bg-surface-2` sitting bare on the page), and the filter-empty state → `.glass-surface`; the `StatTile` hero pair → `.glass-surface` via `glassTileStyle`. Health-filter chips and the zero-based toggle follow the established glass-pill pattern. The three module-level style consts (`inputSt`, `iconBtn`, plus a new `glassTileStyle`) are shared by all four tabs, so they were converted now rather than per-tab — Recurring/Splits/One-Time inherit the glass-field recipe automatically when their cycles come. Also converted `components/budgets/SuggestionsBanner.tsx`, whose `color-mix(warn/accent 6%, var(--bg-surface-1))` tint was mixing against an opaque base — switched to `transparent`, matching the over-budget and goal-surplus banners sitting directly beside it that already did. The shared `Tabs` component stays opaque, same as every other page using it |
| 2026-08-26 | **Budgets — Recurring tab redesigned, second of four** | Header card, each recurring schedule row, the add form, the inline edit panel, and the loading skeleton rows → `.glass-surface`. The AI Detect-Patterns strip's `color-mix(info 8%, var(--bg-surface-1))` tint was mixing against an opaque base — switched to `transparent`, same fix as `SuggestionsBanner` in cycle 1; its pattern rows → `.glass-field`. `recInputSt` (form selects) and the `TypeToggle`'s unselected half → glass-field recipe. Inactive rows previously drew their border from `--bg-surface-2` — a *surface* token used as a border colour — now `--glass-border`, with the existing 0.55 opacity still carrying the paused signal. Pause/Resume buttons keep their semantic warn/inc tints (already translucent). Real bug fixed: each row's category chip built `` `${r.category_color \|\| 'var(--bg-surface-2)'}20` ``, which string-concatenates into the literal invalid value `"var(--bg-surface-2)20"` when a category has no colour — the exact same bug already fixed on the Analytics Reports tab, fixed the same way (only append the hex-alpha suffix when a real colour exists) |
| 2026-08-26 | **Budgets — Splits tab redesigned, third of four** | Mechanical, no bug found. Header card and each split card → `.glass-surface`; the participants divider inside each card, the edit/delete icon buttons, and the unsettled "Mark settled" button's border → `--glass-border`. The AI Parse Split strip's `color-mix(info 8%, var(--bg-surface-1))` tint → mixed against `transparent` — the third instance of this same opaque-base fix on this page (`SuggestionsBanner` in cycle 1, Detect-Patterns in cycle 2). Both `GCard`s inside the New/Edit Split modal (the AI Parse box and the "split N ways" summary) → `.glass-field` via a new module-level `glassFieldStyle` override rather than full `.glass-surface`, since they're nested in an already-glass `Modal` and glass-on-glass reads muddy — same convention as onboarding's option tiles. `splitInputSt`, both AI-parse inputs, and participant name inputs → glass-field recipe; unsettled participant avatars switched from flat `--bg-surface-2` to a neutral translucent tint. Settled/Pending badges and the settled state's green tint left as-is — semantic and already translucent |
| 2026-08-26 | **Budgets — One-Time tab redesigned, fourth of four — the rollout is complete** | Mechanical, no bug found. Largest of this page's four tabs. Header card, the three summary tiles, and each expandable expense card → `.glass-surface`; the expanded-body divider and the item table's header/row/total borders → `--glass-border`. The inline add-item form panel (opaque `--bg-surface-3`), its local `fieldInput` const, the per-item category pill, and the card's edit button → `.glass-field`. Both hand-rolled modals got the glass-sheet treatment established on Accounts and reapplied on Groups: the delete-confirm dialog via `className="glass-surface glass-sheet"`, and `otModalStyle` — which is a style *object* serving as a bottom sheet on mobile and a centred dialog on desktop, so it can't take a className — via a new `otGlassSheet` spread that inlines the same recipe. `otInputStyle`, both Cancel buttons, and the mobile sheet's grab handle converted to match. **This closes the app-wide redesign begun 2026-08-25 with Profile**: every route is now on the glass/ambient-lighting language. The only surfaces deliberately left opaque throughout are small badge chips, disabled-button fills, recharts tooltips, and the shared `Tabs` component |
| 2026-08-26 | **`Card`/`GCard`/`StatTile` flipped to glass by default; 12 duplicated override consts deleted** | Post-rollout cleanup. These three were deliberately left opaque back on 2026-08-25 because 200+ call sites across then-unconverted pages relied on it — that rationale died when the last page shipped. By this point **57 of 79 call sites (72%) were passing an identical `glassTileStyle` override**, and the same const was copy-pasted into 12 page files. The components now carry `className="glass-surface"` themselves and only set what differs from that baseline inline (`Card`'s hover lift and its `elevated` variant, which maps to `--glass-sheet-surface`); `undefined` values are skipped by React so the class wins. All 65 override props and 12 const definitions removed — net −64 lines. This also fixed a real defect the audit surfaced: **12 `StatTile`s (11 on Debt Intelligence's DTI section, 1 on Investments' loading state) had been missed during their own passes and were still rendering opaque on pages already shipped as converted** — they now inherit the correct default rather than needing a per-site fix. One override survives on purpose: `glassFieldStyle` in `budgets/page.tsx`, for the two `GCard`s nested inside the already-glass split modal, which need the lighter `.glass-field` wash rather than glass-on-glass |
