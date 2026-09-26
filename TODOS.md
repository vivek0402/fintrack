# TODOS

## Infrastructure

### Add a selectedIds-pruning regression test (`page.tsx`)

**What:** Frontend test infra is now in place (`frontend/vitest.config.ts`,
`frontend/vitest.setup.ts`, 25 test files, 212 passing tests) — the broader
"set up Vitest + RTL" work is done. One piece of follow-up remains.

**Why:** The transactions-page eng review (2026-08-17) surfaced two real
correctness bugs: bulk-delete missing an undo window that single-delete has
(`BulkOpsPanel.tsx`), and `selectedIds` never pruned when the filtered list
changes underneath select mode (originally `page.tsx:173`, now the
`pruneSelectedIds` effect around `page.tsx:230`). The bulk-delete undo window
now has real regression coverage in
`frontend/components/transactions/BulkOpsPanel.test.tsx` (see the "commits the
delete after the undo window elapses" / "cancels the delete when undo is
clicked" cases). The `selectedIds` pruning fix has since landed in
`page.tsx` (the `pruneSelectedIds` effect keyed on `filtered`), but
`frontend/app/transactions/page.test.tsx` only covers data fetching and
offline fallback — it has no test that exercises select mode and asserts
stale ids get pruned when the filtered list changes underneath it.

**Context:** Backend already has Jest (`backend/package.json`, see
`backend/tests/transactions.routes.test.js`). Add a test to
`frontend/app/transactions/page.test.tsx` (or a colocated test for the
pruning logic) that enters select mode, selects ids, changes the filter so
some selected ids fall out of `filtered`, and asserts `selectedIds` no
longer contains them.

**Effort:** S
**Priority:** P3
**Depends on:** None
