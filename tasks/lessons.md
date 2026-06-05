# Lessons Learned

_Add entries here as the redesign progresses — things that surprised you, patterns that worked well, or gotchas to avoid in future prompts._

<!-- Format:
## Prompt N — <Short Title>
- Lesson or observation
-->

## Prompt 15 — Remaining Pages
- For a cluster of 8 pages with the same dead-token pattern, full rewrites are faster and safer than trying to surgically edit each one — except for very long files (798+ lines) where targeted `replace_all` edits are less error-prone.
- `rgba(0,229,160,0.12)` and similar values in `PLAN_META` or `CATEGORY_COLORS` constants are **allocation/category data values** (shown as user-facing swatches), not CSS token violations. Keep them as hex/rgba alongside the explanatory comment.
- `scoreColor()` and similar utility functions that return colour strings for dynamic use should return semantic CSS vars (`var(--color-inc)` etc.) so they automatically adapt to palette switches. Never return hardcoded hex from these functions.
- `ProgressBar` from Prompt 5 replaces all inline progress bar `div` stacks in reports, forecasts, and health score sections. This is a clean win — one component, one place to maintain.
- Dead imports (`PageShell`, `EmptyState`, `FadeIn`, `PageHelp`) should be removed along with their usage to prevent TypeScript warnings and bundle bloat. `EmptyState` → inline `<div>` with emoji + text + button. `FadeIn` → remove wrapper (or replace with `animation: fadeUp`). `PageHelp` → remove entirely.
- When doing bulk token replacements with `replace_all: true`, always check that the exact string being replaced (including CSS var name) doesn't have a name collision. For example, `var(--accent-green)` and `var(--accent-green-bg)` need separate replacements — don't do the shorter one first or it'll partially corrupt the longer one.

## Prompt 14 — Profile Page + ThemePicker
- Palette swatch active state: `outline: 3px solid var(--text-primary)` + `outlineOffset: 2px` is the cleanest approach — it uses a semantic token that is always high-contrast against both light and dark card backgrounds. Never use the palette accent colour itself for the active outline (it would be invisible when the swatch IS that colour).
- The floating ThemePicker at `bottom: 90px, left: 16px` sits partially inside the desktop sidebar (220px wide, zIndex 50). Since ThemePicker has `zIndex: 400`, it appears on top. This is a deliberate design choice — a small palette button in the bottom-left corner of the sidebar is a common pattern (VS Code, Figma). If this conflicts aesthetically, move to `left: 236px` on desktop.
- `Promise.allSettled()` is the correct primitive for "clear all known cache keys" — it continues even if some keys don't exist on the server (404 is expected for keys that were never cached).
- `SettingsRow` as a typed inline helper with `destructive?: boolean` keeps the profile page clean without a separate file. The `icon` prop accepts `React.ReactNode` so any Lucide icon works.
- `BankAccountsSection` was removed from Profile because Prompt 9 added a full Accounts page. When a page gets its own dedicated route, remove the duplicated section from Profile to avoid conflicting UIs. Confirm with the user if unsure.

## Prompt 13 — Groups + Splits Pages
- "You Owe" and "Owed to You" can be computed directly from the `splits` data already loaded at group detail open — no separate settlements API call needed for the summary GCards. Compute inline: `youOwe = splits where paid_by !== 'Me' AND my share is unsettled`, `owedToYou = splits where paid_by === 'Me' AND others' shares are unsettled`.
- The AI Parse strip belongs prominently on the page surface (not just inside the modal). Users should be able to paste text without opening a modal first. Put it in both places — on the page and inside the modal.
- For split share rows in group detail, the "Settle Up" button per-share is more discoverable than a bulk settle button. The `settleShare(sp, sh)` call is per-share, so showing it inline on each row maps 1:1 to the API.
- When a 744-line file contains all logic in a single default export with an inline subcomponent (`GroupModal`) at the bottom, the safest refactor strategy is: (1) copy all `useState`/`useCallback`/handlers verbatim, (2) rewrite only the JSX return blocks, (3) keep `GroupModal` as a named function at module bottom with its own `createPortal`. Don't move handlers into the modal — they belong in the parent scope.

## Prompt 12 — AI Chat Page
- The full-height chat UI needs ALL elements `position: fixed` with explicit `top/bottom/left/right` offsets — otherwise AppLayout's `<main>` padding clips content. The pattern is: `top: TOP_H, bottom: messagesBottom` for the scrollable area; `bottom: inputBarBottom` for the input bar.
- `leftOffset = isMobile ? '0' : '220px'` is a hard-coded sidebar width. When the sidebar is collapsible, this won't match the collapsed state. A follow-up fix would be to read sidebar width from a shared store or CSS var.
- The `AIResponseCard` internal avatar conflicts with an external bubble avatar. Solving it with `type !== 'chat'` conditional is clean — the calling code tells the component "you're inside a chat bubble, don't render your own avatar."
- Quick prompt chips should populate the input (`setInput(chip)`) rather than send directly (`handleSend(chip)`). Populating lets the user see and edit the text before sending — better UX for suggested prompts.
- `borderLeft: 'none'` in the passed `style` prop to AIResponseCard removes the component's own `borderLeft: '3px solid var(--accent)'` via the spread override. This is the correct technique for chat bubble usage where no accent border is wanted.
- `transition: 'background var(--transition-fast), color var(--transition-fast)'` on the send button creates a smooth state change from `var(--accent)` active → `var(--bg-alt)` inactive, much better than opacity-only changes.

## Prompt 11 — Budgets Page
- The `ProgressBar` component's built-in `pct > 100` → `var(--color-exp)` logic handles both the category over-budget state AND the overall progress card — pass the raw unclipped percentage and the component handles the visual automatically. No need for a separate `barColor` variable for normal bars.
- For category cards with a state-dependent border colour, template literals work cleanly: `border: \`1px solid ${isOver ? 'color-mix(in srgb, var(--color-exp) 20%, transparent)' : 'var(--border)'}\`` — readable and fully token-based.
- The over-budget alert banner uses `color-mix(in srgb, var(--color-warn) 12%, transparent)` for background and `28%` for border — the `12%/28%` split gives a subtle tint background with a visible but not overwhelming border. This ratio works well for warning states.
- Emoji icon for a budget category comes from `budget.category_icon || budget.category_emoji || '📊'` — the API may use either field name, so check both.
- The inline edit input for budget limit benefits from a ₹ prefix div (same pattern as modal inputs): `position: absolute, left: 8` inside a `position: relative` wrapper on the input. This avoids needing a separate Input component for a small inline edit.

## Prompt 10 — Goals Page
- Hex values in user-selectable color palette arrays (`GOAL_COLORS`, `CARD_COLORS`) are data values, not styling tokens — they're stored on records and shown as user choices. Keeping them as hex is correct and expected; no need to convert to CSS vars.
- `fontStyle: 'italic'` on a `var(--font-display)` heading requires the font to have an italic variant loaded. Cabinet Grotesk from Fontshare includes italic — verify the font link in `layout.tsx` loads the italic weight before using this in production.
- The "New Goal" button on the dark header card uses `rgba(255,255,255,0.1)` bg + `rgba(255,255,255,0.3)` border instead of CSS tokens — this is intentional because the button must contrast against an unknown-palette dark card surface. CSS tokens like `var(--border)` would be invisible on a dark background.
- The `CircleProgress` SVG component used `var(--bg-border)` for the SVG stroke track. SVG stroke attributes cannot resolve CSS custom properties in all environments (same issue as Recharts). The `ProgressBar` component (which uses HTML divs) is the correct replacement — it resolves CSS vars correctly.
- Converting inline edit forms (below goal cards) to Modal components is better UX and reduces layout shift. The `form id="..."` pattern lets `type="submit" form="..."` buttons in the Modal footer submit the form without nesting.

## Prompt 9 — Accounts Page
- For coloured card bands where the background is a user-stored hex (e.g. `b.color`), use white text and `rgba(255,255,255,0.N)` for overlaid badges/secondary text — this is the safest approach since you don't know if the stored color is light or dark.
- `ProgressBar` `color` prop accepts a CSS custom property string like `'var(--color-warn)'` — the component just sets `background: fillColor` so any CSS value works, including `var()` references.
- Defining `SectionHead` as an inline helper component with typed props (`title`, `total`, `totalColor`, `onAdd`) inside the page file avoids the need to pass untyped style objects — the component knows exactly what it needs.
- The 912-line file was primarily long due to duplicated modal JSX (3 modals × ~100 lines each) with identical structure. Extracting `inputSt`, `labelSt`, `outlineBtn`, `iconBtn` as shared constants at the module level eliminates ~200 lines of duplication across modals.
- For `var(--bg-glow)` used as a decorative spot inside a header card: wrap it in a `div` with `opacity: 0.4` and `borderRadius: 50%` — this creates the soft radial glow effect without needing `color-mix` or JS.

## Prompt 8 — Analytics Page
- Recharts SVG `fill` and `stroke` attributes cannot reference CSS custom properties (`var(--color-inc)` doesn't work inside SVG). The solution is `getComputedStyle(document.documentElement).getPropertyValue('--color-inc').trim()` — read the actual color value at runtime and pass it as a literal string to Recharts components.
- Re-run the `getComputedStyle` read inside a `useEffect` that depends on `[theme, palette]` from the theme store. This ensures chart colours update when the user switches palette or dark/light mode.
- `<linearGradient>` defs must be placed as children of the Recharts chart component (e.g. `<AreaChart><defs>...</defs></AreaChart>`). They work in the SVG context Recharts creates, and `fill="url(#gradientId)"` on the `Area` component resolves correctly.
- `CartesianGrid horizontal vertical={false}` is the Recharts v3 pattern for horizontal-only gridlines. The prop is boolean, not a points array.
- For the weekly pattern bar chart, `Cell` components must be placed as children of the `Bar` to set per-bar fill. Map over the data array inside the `Bar` to emit one `Cell` per entry with the conditional fill.
- `hexToRgba` helper: always check if the incoming value starts with `rgb` (it might already be `rgba(...)` from the CSS token) before trying to parse it as hex. The `--accent-tint` token in dark mode is `rgba(...)` not a hex.

## Prompt 7 — Transactions Page + TransactionModal
- The type toggle "active expense = `var(--text-primary)` bg" is an inversion pattern: light mode → dark bg + white text; dark mode → light bg + dark text. It's theme-safe because `var(--text-primary)` and `var(--bg-card)` are always high-contrast opposites.
- `color-mix(in srgb, var(--color-exp) 30%, transparent)` on the amount input border gives a tinted income/expense border without needing separate token definitions.
- When a row has `background: transparent` instead of `var(--surface-1)`, it inherits the parent card's background automatically. This is the right approach for list rows inside a Card wrapper — no token needed on the row itself.
- Extracting `labelStyle` and `inputBase` as `React.CSSProperties` constants inside the render function eliminates repetitive inline object literals across 10+ form fields in the modal.
- The 833-line modal can be faithfully updated by leaving all `useState`, `useEffect`, and handler logic completely untouched — only changing the JSX style props. Keep logic and visual layers separate; never refactor logic while doing visual redesign.

## Prompt 6 — Dashboard Page
- Define `SectionHead` and `StatPill` as inline helper components inside the page file rather than exporting them. They're too small and page-specific to warrant their own files, and co-location makes the page self-contained.
- The `-webkit-line-clamp` / `-webkit-box-orient` pattern still requires `display: '-webkit-box'` as a string in React inline styles. TypeScript will complain without `as React.CSSProperties` cast.
- `aiAPI.report()` should be called on mount (fire-and-forget), not gated behind a button. The server caches the result per-user for 6h, so the UX cost is near zero and the dashboard feels smarter.
- `color-mix(in srgb, var(--color-info) 8%, var(--bg-card))` works correctly for the AI strip background — adapts automatically between light (near-white tint) and dark (near-black tint) because `var(--bg-card)` is the base.
- For the dashboard mood buttons: `border: \`1px solid ${mood === m.key ? 'var(--accent)' : 'var(--border)'}\`` — template literals work fine in inline styles for conditional CSS var references.
- Keep the `dataLoading` skeletons inline rather than importing `SkeletonCard` for every sub-section — match the exact layout shape so there's no layout shift when data arrives.

## Prompt 5 — Shared UI Components
- `fontVariantNumeric: 'tabular-nums'` is the correct React inline-style property for CSS `font-variant-numeric: tabular-nums`. Always add it alongside `fontFamily: var(--font-mono)` on financial number display so digits align in columns.
- `color-mix(in srgb, var(--color-inc) 12%, transparent)` is the pattern for tinted badge backgrounds derived from semantic colour tokens — use it everywhere old `var(--accent-green-bg)` / `var(--accent-red-bg)` patterns appear.
- `backdropFilter: 'blur(2px)'` needs a paired `WebkitBackdropFilter: 'blur(2px)'` for Safari and Capacitor iOS WebView.
- `var(--radius-xl)` (24px) on modal boxes gives a more premium feel than `var(--radius-lg)` (16px). Sheets (BottomSheet) use `20px 20px 0 0` hardcoded on the top corners — not a token — because the bottom corners are always 0.
- Dead tokens in a component won't throw errors — they silently fall back to `initial`/`unset`. This makes them invisible bugs. Always grep for old token names after any major rename (Prompt 1 pattern). The grep list from Prompt 5 (Button, Input, etc.) is the backlog for Prompts 6–15.
- Keep new primitive components (GCard, Badge, ProgressBar) dependency-free and style-only — no state, no effects, no imports from lucide or stores. That keeps them fully server-renderable and testable in isolation.

## Prompt 4 — Sidebar + BottomNav
- `color-mix(in srgb, var(--color-exp) 10%, transparent)` is the cleanest way to create a semi-transparent tint from a CSS custom property without hardcoding hex or rgba. Supported in Chrome 111+, Firefox 113+, Safari 16.2+ — fine for a 2026 app.
- CSS cannot do `rgba(var(--some-token), 0.1)` — the token must already be a full color value to use directly, or `color-mix` must be used. Never try to wrap a CSS custom property in `rgba()`.
- The old `moreSections` + `sectionsWithIndex` pattern was the right call when the sheet had 14 items across 3 categories, but for 6 items a flat array + CSS grid is far simpler. Don't over-structure small datasets.
- For CSS gradient active indicators (like the sliding top pill), the browser cannot interpolate them — use background on a wrapper element instead. A simple pill `div` with `background: var(--accent)` achieves the same visual result and animates via `transition: background 200ms ease`.
- Main nav `<a>` tags with `onClick` + `e.preventDefault()` + `router.push()` avoid unnecessary Next.js `<Link>` prefetch overhead in frequently-rendered nav items.

## Prompt 3 — AppLayout Ambient Glow
- `--bg-glow` is already a full `rgba(r, g, b, a)` value, so it can be dropped directly into a CSS gradient stop as `var(--bg-glow)` — no `getComputedStyle` extraction is needed. The browser resolves the custom property at paint time.
- `transition: background 0.5s ease` on a div with a gradient background won't interpolate between gradient shapes (browsers can't interpolate `radial-gradient`), but it does produce a smooth cross-fade when the underlying CSS custom property (`--bg-glow`) changes value, because the browser re-paints the gradient on each frame during the transition. The visual result is a smooth colour shift.
- The `<main>` content element should NOT carry its own `background` when the intent is to show the root div's glow through it. Redundant `background` values on child elements will obscure the glow.
- Every time tokens are renamed (Prompt 1 pattern), audit all inline styles in layout-level components immediately — they're the most likely to reference old names and silently fall back to transparent/unset.

## Prompt 2 — Theme Store Extension
- The pre-hydration `<script>` runs before any JS bundle loads, so it must be ES5-compatible. Use `var`, `indexOf` instead of `includes`, and avoid arrow functions or template literals — they will crash on older WebViews (Capacitor target).
- Extracting `applyAttributes(theme, palette)` as a single helper prevents drift: every code path that changes either attribute goes through the same function, so `data-theme` and `data-palette` can never get out of sync.
- `setTheme` must read `get().palette` (not a captured closure value) to get the current palette at call time. Same for `setPalette` reading `get().theme`. Zustand's `get()` is the right tool here.

## Prompt 1 — Design Token System
- `FinTrack_Prototype.jsx` was referenced as the source of truth but is not in the repo. For future prompts that reference it, derive values from the written spec in the prompt — don't block on the missing file.
- The old `body` rule used `--bg-ambient-1/2/3` for `background-image`; those tokens no longer exist. The ambient glow is intentionally deferred to Prompt 3 (AppLayout). Removing the `background-image` line from `body` is the correct interim state.
- Keeping `--shadow-card/elevated/modal` in the theme-independent `:root` block was necessary because utility class `.card-interactive:hover` already references `var(--shadow-elevated)`. Don't remove tokens that are consumed by utility classes unless those classes are also updated.
- The `[data-palette="X"][data-theme="dark"]` compound selector has higher specificity than `[data-palette="X"]` alone, so dark overrides apply correctly without needing `!important`.
