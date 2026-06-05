# Design System — Finance Tracker

## Product Context
- **What this is:** A personal finance web + mobile app (PWA, Capacitor Android) with AI-powered insights via Gemini
- **Who it's for:** Individuals who take money seriously and want clarity over their financial story
- **Space/industry:** Personal finance, budgeting, net worth tracking
- **Project type:** Dashboard web app + mobile PWA

## Aesthetic Direction
- **Direction:** Industrial/Refined
- **Decoration level:** Intentional — solid surfaces with precise borders. No glassmorphism except one single backdrop blur on the ⌘K command overlay.
- **Mood:** Cold obsidian surfaces, surgical typography, data that feels live. "This was built for someone who takes money seriously." The user should feel competent and calm in the first 3 seconds — not overwhelmed by UI tricks.
- **Reference products:** Linear, Superhuman (craft tier); Copilot Money (design leadership in the category)
- **Category departures:**
  1. Full-width "financial pulse" view instead of a KPI card grid — opens to your financial story, not a dashboard of metrics
  2. ⌘K / FAB as the primary AI surface — Gemini is a command palette over the whole app, not a sidebar widget

## Typography

- **Display/Hero numbers:** DM Mono — all financial figures, always, tabular-nums. Currency symbol at 60% the size of the numeral. Never render a currency figure in a proportional font.
- **Headings:** Cabinet Grotesk 700/800 — replaces Sora. Tighter, more confident.
- **Body/UI:** Satoshi — replaces DM Sans. Better optical spacing at small sizes.
- **Code/Terminal:** DM Mono (consistent with number rendering)
- **Loading:** Google Fonts / Fontshare CDN
  ```html
  <!-- Cabinet Grotesk + Satoshi from Fontshare -->
  <link href="https://api.fontshare.com/v2/css?f[]=satoshi@300,400,500,600,700&f[]=cabinet-grotesk@400,500,700,800,900&display=swap" rel="stylesheet">
  <!-- DM Mono from Google Fonts -->
  <link href="https://fonts.googleapis.com/css2?family=DM+Mono:ital,wght@0,300;0,400;0,500;1,400&display=swap" rel="stylesheet">
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

- **Approach:** Restrained with surgical accents — color is rare and meaningful
- **Design principle:** Surface colors shift slightly toward violet as elevation increases, creating depth without gradients

### CSS Variables
```css
:root {
  --bg-primary:         #080c18;   /* page background */
  --bg-secondary:       #0d1425;   /* cards, panels */
  --bg-card:            #111a30;   /* elevated cards, modals */
  --bg-hover:           #192140;   /* hover states, selected rows */
  --bg-border:          #1e2d4a;   /* subtle borders (1px) */
  --bg-border-strong:   #2a3d5e;   /* visible dividers */

  --text-primary:       #f0f4ff;   /* slightly blue — matches cold surface */
  --text-secondary:     #8899bb;   /* muted text */
  --text-muted:         #4a5d7e;   /* timestamps, labels, placeholders */

  --accent-mint:        #00e5a0;   /* positive, income, success — more electric than #10b981 */
  --accent-rose:        #ff3d5e;   /* negative, expenses, error */
  --accent-indigo:      #6366f1;   /* interactive, focus, links — more distinctive than #3b82f6 */
  --accent-amber:       #f59e0b;   /* warnings, budget alerts */

  --accent-mint-bg:     rgba(0, 229, 160, 0.08);
  --accent-mint-border: rgba(0, 229, 160, 0.2);
  --accent-rose-bg:     rgba(255, 61, 94, 0.08);
  --accent-rose-border: rgba(255, 61, 94, 0.2);
  --accent-indigo-bg:   rgba(99, 102, 241, 0.1);
  --accent-amber-bg:    rgba(245, 158, 11, 0.08);

  --transition-fast:    150ms;
  --transition-base:    250ms;
  --transition-slow:    400ms;
}
```

### Light Mode
```css
[data-theme="light"] {
  --bg-primary:       #f8f9fc;
  --bg-secondary:     #ffffff;
  --bg-card:          #f1f4fa;
  --bg-hover:         #e8ecf4;
  --bg-border:        #e2e8f0;
  --bg-border-strong: #cbd5e1;
  --text-primary:     #0f1729;
  --text-secondary:   #4a5568;
  --text-muted:       #94a3b8;
  --accent-mint:      #059669;   /* darker for contrast on light bg */
  --accent-rose:      #e11d48;
  --accent-indigo:    #4f46e5;
  --accent-amber:     #d97706;
}
```

### Semantic Rules
- Positive values, income, savings: always `--accent-mint`
- Negative values, expenses, deficits: always `--accent-rose`
- Interactive elements, focus rings, links: `--accent-indigo`
- Budget warnings, caution states: `--accent-amber`
- Never use color as the only distinguishing signal (accessibility)

## Spacing

- **Base unit:** 8px
- **Density:** Comfortable
- **Scale:**
  ```
  2xs:  2px
  xs:   4px
  sm:   8px
  md:  16px
  lg:  24px
  xl:  32px
  2xl: 48px
  3xl: 64px
  ```
- **Row height:** 52px minimum on desktop, 60px on mobile (thumb targets)
- **Border radius:**
  ```
  sm:   4px   — tags, badges, small chips
  md:   8px   — buttons, inputs, small cards
  lg:  12px   — cards, panels
  xl:  16px   — modals, large containers
  full: 9999px — pills, avatars
  ```

## Layout

- **Approach:** Grid-disciplined with one editorial exception (the financial pulse home screen)
- **Home screen:** Full-width financial pulse view — large net position number (DM Mono, 52px) at top, full-width area chart below, then stat row, then transactions. No KPI card grid.
- **Navigation:** Left rail — 48px wide (icon-only) by default, expands to 220px on hover/focus. Icon-only collapses preserve content space.
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
- **Chart animation:** Mount on first render only, cubic-bezier(0.16,1,0.3,1) 600ms. Never loop.
- **⌘K overlay:** Fade-in 200ms with backdrop-blur (the ONLY place backdrop-filter is used)

## Data Visualization (Recharts)

- Remove all default Recharts borders, backgrounds, gridlines — start from zero
- **Gridlines:** Horizontal only, `--bg-border` color, 1px, no vertical lines
- **Area charts:** Gradient fill from `rgba(0,229,160,0.2)` at line to `rgba(0,229,160,0)` at base. Line: 1.5px, `--accent-mint`.
- **Tooltips:** Surface `--bg-card`, 1px border `--bg-border-strong`, DM Mono for the number, Satoshi for label. No drop shadows.
- **All chart numbers:** DM Mono, tabular-nums, appropriate semantic color
- **Axis labels:** 11px, `--text-muted`, DM Mono

## AI Interface (Gemini / ⌘K)

The AI layer is a command palette, not a chat widget:
- Desktop: `⌘K` (Mac) / `Ctrl+K` (Windows) launches full-screen overlay
- Mobile: Floating action button (FAB) in bottom right, 56px
- The overlay uses `backdrop-filter: blur(20px)` on the surface behind it — the only use of blur in the entire app
- Single text input at center. No chat history visible on open. Full history accessible by scrolling up.
- The command surface can: log transactions, query data, set budgets, navigate, answer questions about spending
- Visual treatment: background `rgba(8,12,24,0.92)` + backdrop blur, single border `--bg-border`, input uses `--accent-indigo` focus ring

## Anti-Patterns (never do these)

- No glassmorphism on cards or panels
- No purple/violet gradients as accent
- No 3-column feature grids with icons in colored circles
- No alternating row colors in tables
- No proportional fonts for currency figures
- No looping chart animations
- No drop shadows on tooltips
- No vertical gridlines in charts
- No centering everything

## Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-04-02 | Cabinet Grotesk replaces Sora | Tighter, more confident, better at display sizes |
| 2026-04-02 | Satoshi replaces DM Sans | Better optical spacing at small sizes |
| 2026-04-02 | DM Mono for all financial figures | Makes currency data feel instrumental, not decorative |
| 2026-04-02 | #00e5a0 replaces #10b981 | More electric mint — stronger premium signal |
| 2026-04-02 | #6366f1 replaces #3b82f6 | Indigo is more distinctive than standard blue in this space |
| 2026-04-02 | Backgrounds shift toward violet with elevation | Creates depth without gradients — intentional, not accidental |
| 2026-04-02 | Full-width pulse view as home | Competitors all use KPI grids — this is the deliberate departure |
| 2026-04-02 | ⌘K command palette for AI | AI as infrastructure, not a feature — Superhuman-pattern |
| 2026-04-02 | No glassmorphism | It's category-ubiquitous now, no longer a differentiator |
| 2026-04-02 | Initial design system created | Created by /design-consultation — research + Claude subagent synthesis |
| 2026-06-04 | **AMOLED black (#000000) kept** instead of cold obsidian (#080c18) | Superior on OLED panels (true black = off pixels); difference is imperceptible on LCD; chosen consciously over the design doc spec |
| 2026-06-04 | **Light mode --accent-blue: #4f46e5** (not #2563eb) | Aligns with indigo family (#6366f1 dark / #4f46e5 light) for coherent cross-theme identity |
| 2026-06-04 | **--glass-bg/border vars retired** | Redefined to solid `--bg-card/--bg-border-strong` values. TrendChart and CategoryChart tooltips no longer use backdropFilter. Glassmorphism ban now enforced in code, not just spec. |
| 2026-06-04 | **Font stack unified** across all components | Purged bare `Sora,sans-serif` → `'Cabinet Grotesk','Sora',sans-serif` and `DM Sans,sans-serif` → `'Satoshi','DM Sans',sans-serif`. Currency/number contexts changed to `'DM Mono',monospace`. Remaining tech debt: non-SVG hardcoded hex in page files (color-picker swatches for user content are intentional and left alone). |
| 2026-06-04 | **Home screen KPI grid and ⌘K search retained** for now | Converting to financial-pulse home and full AI command palette is a product-scope rewrite, not a token change. Logged here as accepted scope debt — build as a discrete feature sprint, not part of a token reconciliation. |
