# TODOS

## Infrastructure

### Set up frontend test infrastructure (Vitest + React Testing Library)

**What:** Add Vitest + React Testing Library to `frontend/` — config, first tests,
CI wiring.

**Why:** Zero regression safety net across the entire frontend today. Surfaced
concretely by the transactions-page eng review (2026-08-17): two real correctness
bugs — bulk-delete missing an undo window that single-delete has
(`BulkOpsPanel.tsx`), and `selectedIds` never pruned when the filtered list
changes underneath select mode (`page.tsx:173`) — shipped and sat undetected until
caught by manual code review during an unrelated redesign.

**Context:** Backend already has Jest (`backend/package.json`, see
`backend/tests/transactions.routes.test.js`). Frontend has no jest/vitest/playwright
config and no test directories anywhere under `frontend/`. Start with the two bugs
above as the first regression tests once infra exists, then expand coverage
opportunistically as components are touched — don't attempt to backfill the whole
frontend at once.

**Effort:** L
**Priority:** P2
**Depends on:** None
