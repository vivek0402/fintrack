# Frontend Audit — Pre-Redesign

## Current design patterns
- **Token system**: `globals.css` defines a 5-palette (ember/ocean/violet/forest/rose) × 2-theme (`data-theme` dark/light) system via `[data-palette="X"][data-theme="Y"]` selectors (not all shown in the read range, but referenced everywhere). Core vars in use across the app: `--bg-page`, `--bg-card`, `--bg-alt`, `--bg-hover`, `--border`, `--text-primary`, `--text-secondary`, `--text-muted`, `--text-faint`, `--accent`, `--accent-light`, `--accent-border`, `--accent-tint`, `--accent-2`, `--accent-3`, `--color-inc`, `--color-exp`, `--color-warn`, `--font-display`, `--font-body`, `--font-mono`, `--font-head` (note: `--font-head` is used in dashboard but not defined in the visible globals.css — likely a bug/typo for `--font-display`).
- **Layout**: Sidebar is collapsible (64px/220px) rather than fixed 240px; BottomNav uses pill-shaped active indicators with `popIn` animation; AppLayout adds a `page-glow` radial gradient background and multiple floating FABs (AI chat, add transaction).
- **Cards**: Heavy use of `var(--bg-card)` + `1px solid var(--border)` + `var(--radius-lg/xl)` boxes everywhere — dashboard is a stack of bordered cards, not a hierarchy-led layout.
- **Numbers**: Already mostly use `fmt = (n) => '₹' + Math.round(n).toLocaleString('en-IN')` and `var(--font-mono)` — this convention is in good shape.
- **Modals**: `Modal.tsx` already uses `createPortal` and switches to `BottomSheet` on mobile — good foundation, but styling (`--bg-card`, `--radius-xl`, springIn animation) doesn't match the new spec (radius-lg, scaleIn 150ms, 3-region sticky header/body/footer).
- **Skeletons**: Already exist (`Skeleton`, `SkeletonText`, `SkeletonCard`, `SkeletonCircle`, etc.) using `shimmer` keyframe — close to spec but need `SkeletonNumber` and exact dimensions per spec.
- **Auth pages**: Login page is fully custom-styled (gradient background, ambient glow blobs, hardcoded hex colors like `#060b18`, `#6366f1`, inline `inputStyle` function) — does not use the Input/Button components at all, doesn't reference CSS vars consistently (mixes `var(--accent-blue)` which isn't in the documented token set).
- **Buttons**: `Button.tsx` has primary/secondary/ghost/danger/icon variants but uses `--bg-alt`, `--bg-hover`, `--accent-light` etc. — needs remap to new tokens, plus add `lg` size already exists.

## What makes the UI look generic
- KPI-grid dashboard (4 equal stat tiles) competes with the "hero number" instead of supporting it — no single dominant number.
- Sidebar has 25+ flat nav items with no grouping — overwhelming, no information hierarchy.
- Heavy reliance on bordered card boxes for every section creates visual monotony — editorial/typographic hierarchy is absent.
- Auth pages use decorative gradient glows and a generic dark-SaaS look, inconsistent with the rest of the app's token system.
- Multiple competing accent colors (`--accent-2`, `--accent-3`, gradients) dilute the "numbers are the hero" principle.

## What will be different after the rebuild
- Single dominant net-position number on dashboard (DM Mono, 52px+, color-coded), supporting elements de-emphasized.
- Sidebar reorganized into 4 labeled groups (Track/Understand/Grow/Tools) with ~11 items instead of 25+, matching new IA exactly as specified.
- Strict 2-theme (dark/light) token system with consistent surface/border/text scale (`--bg-base/surface-1/2/3`, `--border-subtle/visible`); old palette/multi-accent system replaced, with **compat aliases** added so unrebuilt pages (accounts, net-worth, investments, tax, loans, splits, etc.) keep working against old variable names.
- Auth pages rebuilt on the shared Input/Button components, pure `#0a0a0a` background, no decorative gradients/glows.
- Modals/sheets restyled to spec (radius-lg, 3-region layout, scaleIn/slideUp per spec timings) while keeping existing createPortal architecture.
- Transactions page becomes a true ledger (date-grouped rows, sticky group headers) instead of a card-list.
