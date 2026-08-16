# Design System — FinTrack

## Product Context
- **What this is:** A personal finance web + mobile app (PWA, Capacitor Android) with AI-powered insights, investment tracking, Indian tax planning, and debt intelligence
- **Who it's for:** Individuals who take money seriously and want surgical clarity over their complete financial picture
- **Space/industry:** Personal finance, budgeting, net worth, investing, tax
- **Project type:** Dashboard web app + mobile PWA

## Aesthetic Direction
- **Direction:** Industrial / Refined
- **Decoration level:** Intentional — solid surfaces with precise borders. No glassmorphism (enforced in code, not just spec).
- **Mood:** Cold obsidian surfaces, surgical typography, data that feels live. "This was built for someone who takes money seriously." The user should feel competent and calm in the first 3 seconds — not overwhelmed by UI tricks.
- **Reference products:** Linear, Superhuman (craft tier); Copilot Money (design leadership in the category)
- **Category departures:**
  1. Numbers are always the hero — every currency figure is the most prominent element in its region; everything else supports it
  2. FAB + dedicated pages as the primary AI surface — not sidebar widgets

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

## Anti-Patterns (never do these)

- No glassmorphism on cards or panels (enforced — `backdropFilter` banned on surfaces)
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
