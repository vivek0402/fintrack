# Codebase Audit Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix every real issue surfaced by a four-track audit (backend correctness, frontend correctness, security, performance/cost) of the FinTrack app: one confirmed-exploitable IDOR, a cluster of IST/UTC day-boundary bugs (same root cause as an already-fixed daily-brief bug, missed in several nearby spots), dormant-user LLM cost waste, several cache-invalidation gaps causing visibly stale data after common user actions, a handful of N+1 query patterns, and assorted minor hardening/cleanup items.

**Context:** This app is India-only (currency ₹/INR, IST timezone). The backend is Node/Express 5 + `pg` (no ORM) on Render; cron jobs use `node-cron` with `{ timezone: 'Asia/Kolkata' }` on the schedule but historically sometimes did UTC/server-local math *inside* the handler — that mismatch is the single most repeated bug in this plan. The frontend is Next.js/TypeScript with Zustand + a hand-rolled `localStorage` TTL cache (`frontend/lib/apiCache.ts`, `getCached`/`setCached`) that a prior branch applied to the dashboard; several other pages and mutation flows never got the same treatment.

**Tech Stack:** Node/Express 5 + pg + node-cron (backend), Jest + supertest (backend tests), Next.js 16 + TypeScript (frontend), Vitest (frontend tests). No new dependencies expected.

**Coding rules that apply:** JSX inline styles only, CSS variables for color, parameterized SQL always, NUMERIC columns come back from `pg` as strings (wrap in `parseFloat`/`Number` before arithmetic), currency via `Math.round(n).toLocaleString('en-IN')`, no emojis, comments only where the WHY is non-obvious.

---

## Task list (priority order — security and correctness first, then cost, then polish)

| # | Area | Task |
|---|---|---|
| 1 | Security | Fix confirmed IDOR: `bank_account_id` ownership in `oneTimeExpenses.js` |
| 2 | Security | Fix IDOR-shape gaps: `category_id`/`account_id` ownership in `transactions.js`, `budgets.js`, `recurring.js` |
| 3 | Security | Hardening bundle: JWT algorithm pinning, file upload MIME filtering, password length, bcrypt cost consistency |
| 4 | Correctness | Fix recurring-transactions cron IST bug (`index.js`) |
| 5 | Correctness | Fix `mondayOf()` IST bug (`ai.js`) |
| 6 | Correctness | Fix `getDailyBriefData` month-boundary IST bugs (`ai.js`) |
| 7 | Correctness | Fix `insights.js` peer-benchmarks + `opportunities.js` forecast-warning month-boundary IST bugs |
| 8 | Performance | Scope weekly/daily AI briefing crons to active users |
| 9 | Performance | Cache `analytics/page.tsx`'s data fetches |
| 10 | Performance | Throttle NAV-refresh cron; cache `detect-patterns` and `health-report` LLM calls |
| 11 | Performance | N+1 fixes: `planning.js`, `groups.js`, `transactions.js` budget-alert lookup |
| 12 | Correctness | Frontend cache invalidation: budgets, goals, personal loans, recurring processing |
| 13 | Correctness | Frontend cache invalidation: bulk ops, SMS importer, offline queue, transfer branch |
| 14 | Polish | Fix `notificationTrigger.ts` NUMERIC-string bug; add double-click guard to loan write-off |
| 15 | Correctness | Fix `budgets/page.tsx` + `analytics/page.tsx` local-time-vs-IST inconsistency |
| 16 | Performance | Memoize `transactions/page.tsx` income/expense totals |
| 17 | Performance | Verify (and fix if warranted) missing composite index; cache `debt-intelligence/page.tsx` |

---

### Task 1: Fix confirmed IDOR — `bank_account_id` ownership check missing in `oneTimeExpenses.js`

**Files:** Modify `backend/src/routes/oneTimeExpenses.js`, its test file (create if none exists — check first).

**Root cause:** `POST /` and `PUT /:id` accept `bank_account_id` from `req.body`, `parseInt` it, and write it straight into `one_time_expenses.bank_account_id` with no check that the account belongs to `req.user.id`. `GET /` then does `LEFT JOIN bank_accounts ba ON ba.id = o.bank_account_id` with no `AND ba.user_id = o.user_id`, and returns `ba.name AS bank_account_name`. Since `bank_accounts.id` is a `SERIAL` (small sequential integer, not scoped per-user), any authenticated attacker can iterate `bank_account_id: 1, 2, 3...` on their own one-time expenses and have the response echo back other users' real bank account names. Compare with the SAME file's `credit_card_id` handling, which already does `SELECT id FROM credit_cards WHERE id=$1 AND user_id=$2` before accepting it — that pattern was simply never applied to `bank_account_id`.

- [ ] **Step 1: Read the current file in full** — confirm exact current POST/PUT/GET handler code and the existing `credit_card_id` ownership-check pattern to mirror exactly.

- [ ] **Step 2: Write a failing regression test first.** If `backend/tests/oneTimeExpenses.routes.test.js` (or similarly named) doesn't exist yet, create it following this codebase's established supertest + mocked-pool convention (check `backend/tests/personalLoans.routes.test.js` for the exact scaffolding). Add tests:
  - `POST /` with a `bank_account_id` belonging to a DIFFERENT user's account → expect 400/403 (not silently accepted).
  - `PUT /:id` with a `bank_account_id` belonging to a different user → expect 400/403.
  - `GET /` response never includes another user's `bank_account_name` even when `bank_account_id` was accepted (defense-in-depth: confirm the join is user-scoped).
  Run the tests, confirm they fail against current code.

- [ ] **Step 3: Implement the fix.**
  - In `POST /` and `PUT /:id`: before accepting `bank_account_id`, run `SELECT id FROM bank_accounts WHERE id=$1 AND user_id=$2` (mirroring the exact `credit_card_id` check already in this file) and reject with 400 if not found/not owned.
  - In `GET /`'s `LEFT JOIN bank_accounts ba ON ba.id = o.bank_account_id`, add `AND ba.user_id = o.user_id` to the join condition (defense-in-depth — even if the write-side check above is bypassed somehow, the read never leaks a cross-user name).

- [ ] **Step 4-5: Run the targeted test file, then the full backend suite** (`cd backend && npx jest`). All must pass.

- [ ] **Step 6: Commit.**
```
git add backend/src/routes/oneTimeExpenses.js backend/tests/oneTimeExpenses.routes.test.js
git commit -m "fix(security): verify bank_account_id ownership in one-time expenses (IDOR)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Fix IDOR-shape gaps — `category_id`/`account_id` ownership checks

**Files:** Modify `backend/src/routes/transactions.js`, `backend/src/routes/budgets.js`, `backend/src/routes/recurring.js`, and their test files.

**Root cause:** Same shape as Task 1 but lower real-world risk since `categories.id` is a UUID (not sequential/guessable) — still worth fixing for defense-in-depth and consistency with how `credit_card_id`/`goal_id` are already checked in the same handlers.

- `transactions.js` POST (`~143-185`) and PUT (`~516-587`): `category_id` and `account_id` inserted/updated straight from `req.body` with no ownership check, while `credit_card_id`/`goal_id` in the SAME handlers correctly check ownership.
- `budgets.js` POST (`~37-51`): `category_id` unchecked; `GET /` (`~20`) joins `categories` with no `user_id` match.
- `recurring.js` POST (`~24-53`): same pattern; `GET /` (`~13`) has the same unscoped join.

- [ ] **Step 1: Read all three files in full**, confirm exact current handler code and the existing `credit_card_id`/`goal_id` ownership-check pattern in `transactions.js` to mirror.

- [ ] **Step 2: Write failing tests** in each file's existing test suite (or add if missing) proving a `category_id`/`account_id` belonging to another user is rejected on write, and that GET responses never leak another user's category/account name via the join.

- [ ] **Step 3: Implement.** For each of the three files: add a `SELECT id FROM categories WHERE id=$1 AND user_id=$2` (and `accounts`/`bank_accounts` equivalent for `account_id` in `transactions.js`) check before accepting the value on create/update; add the missing `AND <table>.user_id = <owner>.user_id` to each unscoped join. `categories` may be a shared/system table with some rows having `user_id IS NULL` (system default categories) — check the actual schema/existing category-fetch logic elsewhere in the codebase (e.g. how `GET /api/categories` scopes user-created vs. system categories) before writing the ownership check, so system categories aren't wrongly rejected.

- [ ] **Step 4-5: Run each targeted test file, then the full backend suite.** All must pass.

- [ ] **Step 6: Commit.**
```
git add backend/src/routes/transactions.js backend/src/routes/budgets.js backend/src/routes/recurring.js backend/tests/transactions.routes.test.js backend/tests/budgets.routes.test.js backend/tests/recurring.routes.test.js
git commit -m "fix(security): verify category_id/account_id ownership in transactions, budgets, recurring

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```
(adjust the exact test file names/paths to whatever actually exists in the repo)

---

### Task 3: Security hardening bundle

**Files:** Modify `backend/src/middleware/auth.js`, `backend/src/index.js` (any other `jwt.verify` call sites), `backend/src/routes/ai.js` (image upload multer config), `backend/src/routes/documents.js` (upload multer config), `backend/src/routes/auth.js` (password length), `backend/src/routes/profile.js` (bcrypt cost).

Four independent, small, low-risk changes — bundle into one task since each is a one-or-two-line fix with no interaction between them:

- [ ] **Step 1: Pin JWT algorithm.** Every `jwt.verify(token, process.env.JWT_SECRET)` call site (found in `middleware/auth.js` and `index.js`, ~4 sites total — grep `jwt.verify(` across `backend/src`) gets an explicit `{ algorithms: ['HS256'] }` third argument. Write/update a test confirming a token signed with a different algorithm (or `alg: none`) is still rejected (should already pass, this is defense-in-depth, but pin it down with a test regardless).

- [ ] **Step 2: File upload MIME validation.** `backend/src/routes/ai.js`'s `/parse-image` multer config and `backend/src/routes/documents.js`'s upload multer config currently have no `fileFilter`. Add one, mirroring the pattern already used correctly in `backend/src/routes/pdfImport.js`/`camsImport.js` (`fileFilter` restricting to `application/pdf` there) — for `ai.js`'s image endpoint, restrict to common image MIME types (`image/jpeg`, `image/png`, `image/webp`, `image/heic` if this app supports it — check the frontend's image-picker/camera component for what it actually sends before deciding the allowlist); for `documents.js`, check what file types the feature is meant to support (read the frontend's document-upload component) and restrict accordingly rather than accepting anything. Write a test for each confirming a disallowed MIME type is rejected with 400, not silently processed.

- [ ] **Step 3: Raise minimum password length.** `backend/src/routes/auth.js`'s register (`~155`) and password-reset (`~323`) both enforce a 6-character minimum — raise to 8. Update any existing test that used a 6-7 character password as a "valid" fixture to use an 8+ character one instead (search test files for password fixtures shorter than 8 chars used in a "should succeed" test case — do NOT change the test's *intent*, e.g. a test that deliberately tests "password too short" should now use a 7-char password to still trigger the rejection, not stay at 5).

- [ ] **Step 4: Consistent bcrypt cost.** `backend/src/routes/profile.js`'s password-change route uses `bcrypt.hash(password, 10)` while register/reset in `auth.js` use cost 12 — change `profile.js` to 12 for consistency. No behavior change other than cost factor; existing tests should be unaffected unless one hardcodes/mocks a specific cost value (check and adjust if so).

- [ ] **Step 5: Run the full backend suite.** All must pass.

- [ ] **Step 6: Commit.**
```
git add backend/src/middleware/auth.js backend/src/index.js backend/src/routes/ai.js backend/src/routes/documents.js backend/src/routes/auth.js backend/src/routes/profile.js <any test files touched>
git commit -m "fix(security): pin JWT algorithm, validate upload MIME types, raise min password length, unify bcrypt cost

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: Fix recurring-transactions cron IST bug

**Files:** Modify `backend/src/index.js`.

**Root cause:** The recurring-transactions cron (`0 0 * * *`, scheduled with `{ timezone: 'Asia/Kolkata' }` — correctly fires at IST midnight) computes `const today = new Date().toISOString().split('T')[0];` inside the handler — UTC-based. IST midnight is 18:30 UTC the *previous* day, so `today` is always exactly one calendar day behind the real IST date at the moment this cron runs. The query `WHERE next_due_date <= $1` then under-matches by one day, **every single day, permanently** — every recurring transaction (rent, EMI, subscriptions) posts one day late.

- [ ] **Step 1: Read the current cron handler in full** (search `index.js` for the recurring-transactions cron, around line 355) and re-confirm `ai.js`'s already-fixed `dateStr` helper's exact implementation (`d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })`) to reuse the identical approach.

- [ ] **Step 2: Write a regression test** (this file has no dedicated cron tests per this codebase's convention — if there's truly no test infrastructure for `index.js` crons, this step may reduce to a manual trace + a note in the report; check first whether ANY cron in `index.js` has ever had a dedicated unit test by grepping test files for `index.js`-derived cron logic before concluding none exists).

- [ ] **Step 3: Implement.** Since `aiRoutes.dateStr` is already exported (from the daily-brief fix), reuse it here exactly as the 9pm push cron fix did: `const today = aiRoutes.dateStr(new Date());` — confirm `aiRoutes` is already in scope at this point in the file (it is, per the 9pm cron fix). This is a one-line change plus removing the old UTC computation.

- [ ] **Step 4: Run the full backend suite.** All must pass.

- [ ] **Step 5: Commit.**
```
git add backend/src/index.js
git commit -m "fix(recurring): use IST day boundary for the recurring-transactions cron, not UTC

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Tasks 5-7 — actual outcome (superseded the plan below, per mid-flight user decision)

Tasks 5, 6, and 7 as originally written below turned out to undercount the scope: investigating `mondayOf()` surfaced ~10 more UTC-vs-IST instances scattered through `ai.js` alone, and a subsequent code-quality review found the identical bug class live in 8 more route files entirely outside `ai.js`/`insights.js`/`opportunities.js` (`agents.js`, `debt.js`, `groups.js`, `milestones.js`, `planning.js`, `recurring.js`, `oneTimeExpenses.js`, `splits.js`) — most notably `recurring.js`'s `POST /process`, a route hit live from the dashboard/budgets pages on every load, duplicating the exact bug Task 4 believed it had already closed via the cron alone.

Per an explicit mid-flight user decision, the fix was generalized rather than done as the three narrow tasks below:
1. Extracted `backend/src/utils/istDate.js` (`istDateStr`, `istMonthYear`, `istDayOfMonth`, `istDaysInMonth`, `istMonthStart`, `istPriorMonthStart`, `istNextMonthStart`, `istMonthsAgoStart`, `mondayOf`) as the one shared source of truth for every "what day/month/week is it for the IST user" computation.
2. Commit `41a3b7d` rewired `ai.js` (including `mondayOf`, `getBriefingData`, `getDailyBriefData`, `/parse-sms`, `/afford`, the chat prompt, `/salary-intelligence`, `/quick-add`, `/forecast-calendar`, `/health-report`), `insights.js`'s peer-benchmarks, and `opportunities.js`'s `detectForecastWarning` — this supersedes Tasks 5, 6, and 7 below in full.
3. Commit `a007e5f` (+ test-coverage follow-up `f9ab559`) extended the same shared helper to `agents.js`, `debt.js`, `groups.js`, `milestones.js`, `planning.js`, `recurring.js` (3 separate fixes, including the `POST /process`/`POST /` pair), `oneTimeExpenses.js`, and `splits.js`.

**Deliberately left open, per a second mid-flight user decision to stop here and move to the plan's remaining tasks:** a residual set of `now`-derived UTC date computations still exist in `index.js` (crons other than the two already fixed), `ai.js` (one confirmed-benign remaining hit, `t.date.toISOString()...` operating on a persisted value, not "now"), `behaviorAnalysis.js`, `creditCardBalance.js`, `pdfImport.js`, `transactions.js`, and `amortization.js` — none of these were triaged for live-vs-benign status. Worth a dedicated future pass. Also flagged but explicitly NOT fixed (separate, pre-existing, currently-dormant risk, only latent because the server runs in UTC): `recurring.js`'s `POST /process` day-advancement loop still walks `next_due_date` via local (non-UTC) `Date` methods, inconsistent with `POST /`'s new UTC-anchored arithmetic for the *initial* due date — would only diverge if the server's `TZ` were ever set away from UTC.

The three sub-plans below are left as originally written for historical/audit-trail purposes; do not re-execute them.

### Task 5 (superseded): Fix `mondayOf()` IST bug

**Files:** Modify `backend/src/routes/ai.js`, `backend/tests/ai.dailyBriefing.routes.test.js` (or wherever `mondayOf` might already have coverage — check `backend/tests/` for existing `mondayOf` tests first).

**Root cause:** `mondayOf(d = new Date())` computes the current week's Monday using `date.getDay()`/`date.getDate()`/`date.setHours(0,0,0,0)` — all server-local (UTC) time — then returns `date.toISOString().split('T')[0]`. This sits inside the SAME file whose neighboring `dateStr()` helper was already fixed to be IST-aware specifically because of this exact bug class (per the comment directly above `dateStr`). `mondayOf` feeds `getDailyBriefData`'s `currentWeekStart`/`priorWeekStart` (used by the daily brief) AND `generateWeeklyBriefing` (used by the weekly briefing, exposed via `POST /briefing/generate`). During IST 00:00-05:29 on a Monday, this still reports "Sunday," so the week-to-date window is off by a week.

- [ ] **Step 1: Read `mondayOf`'s current implementation and every call site** (`getDailyBriefData`, `generateWeeklyBriefing`) in full.

- [ ] **Step 2: Write a failing test.** Export `mondayOf` if not already exported (check `module.exports` at the bottom of `ai.js` — it may already be exported per the earlier sweep's citation of `index.js:823` calling `aiRoutes.mondayOf()`; if so it's already exported, just add a test). Add a test proving: a moment that's already Monday in IST but still Sunday in UTC (pick a concrete timestamp, e.g. `2026-01-19T20:00:00.000Z` = `2026-01-20 01:30 IST`, a Tuesday morning — adjust to a real Sunday-night-IST/Monday-UTC-still-Sunday example, verify the actual calendar dates before writing the test) returns the CURRENT week's Monday, not the prior week's.

- [ ] **Step 3: Implement.** Rewrite `mondayOf` to compute in IST rather than server-local/UTC time — the cleanest approach: first convert `d` to its IST calendar-date components (reuse `dateStr(d)` to get the IST `YYYY-MM-DD` string, parse that back into a plain date-only `Date` for the day-of-week math, since day-of-week must be computed against the IST calendar date, not the UTC one), then apply the existing Monday-of-week offset logic, then format the result back through `dateStr`-style formatting (not `.toISOString()`). Be careful with the parse-back step: `new Date('2026-01-20')` parses as UTC midnight, whose day-of-week in JS's `getUTCDay()` (not `getDay()`, which would reinterpret in local/server time again) matches the intended IST calendar date's weekday — use UTC-based getters (`getUTCDay`, `getUTCDate`, `setUTCDate`) throughout this function once you're working with the IST-derived date-only string, to avoid re-introducing a server-timezone dependency.

- [ ] **Step 4-5: Run the targeted test, then the full backend suite.** All must pass.

- [ ] **Step 6: Commit.**
```
git add backend/src/routes/ai.js backend/tests/ai.dailyBriefing.routes.test.js
git commit -m "fix(briefing): make mondayOf() compute the IST week boundary, not server-local time

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6 (superseded): Fix `getDailyBriefData` month-boundary IST bugs

**Files:** Modify `backend/src/routes/ai.js`, its test file.

**Root cause:** Inside `getDailyBriefData`, `monthStart` (`` `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01` ``), `daysInMonth` (`new Date(now.getFullYear(), now.getMonth()+1, 0).getDate()`), and `dayOfMonth` (`now.getDate()`) all use server-local Date methods, sitting right next to the already-IST-fixed `dateStr()` calls in the same function. During IST 00:00-05:29 on the 1st of a month, these still reflect the previous month/day, so "month expense/income so far" queries sum the wrong month, and the "same day of month" 3-month comparison is off by one day.

- [ ] **Step 1: Read `getDailyBriefData` in full**, identify every use of `now.getFullYear()`, `now.getMonth()`, `now.getDate()` and confirm which ones need to become IST-aware (any that already only feed `dateStr()`-wrapped values are fine; the three named above are not).

- [ ] **Step 2: Write a failing test** for at least one of the three (e.g., `monthStart` on a `2026-02-01T00:30:00.000Z` timestamp — which is `2026-02-01 06:00 IST`, actually past the boundary; pick a timestamp genuinely in the IST-already-new-month-but-UTC-still-old-month window, e.g. `2026-01-31T19:00:00.000Z` = `2026-02-01 00:30 IST` — verify this arithmetic carefully before writing the test) should report February, not January.

- [ ] **Step 3: Implement.** Derive an IST-based `Date` object once at the top of `getDailyBriefData` (reuse the same IST-string-then-parse-as-UTC approach from Task 5, or compute a single `istNow` via `new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }))` — check which approach the codebase already prefers by looking at how Task 5's `mondayOf` fix and `txClassifier.js`'s `istHour`/`IST_OFFSET_MS` pattern do it, and be consistent with whichever is already idiomatic here), then derive `monthStart`, `daysInMonth`, and `dayOfMonth` from that IST-adjusted value instead of the raw server-local `now`.

- [ ] **Step 4-5: Run the targeted test, then the full backend suite.** All must pass.

- [ ] **Step 6: Commit.**
```
git add backend/src/routes/ai.js backend/tests/ai.dailyBriefing.routes.test.js
git commit -m "fix(briefing): compute month-boundary fields (monthStart, daysInMonth, dayOfMonth) in IST

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 7 (superseded): Fix `insights.js` peer-benchmarks and `opportunities.js` forecast-warning month-boundary bugs

**Files:** Modify `backend/src/routes/insights.js`, `backend/src/routes/opportunities.js`, their test files.

**Root cause:** Same mechanism as Task 6, two more call sites:
- `insights.js`'s `GET /peer-benchmarks` (`~130-134`) computes `lastMonthStart`/`thisMonthStart` from `now.getFullYear()`/`now.getMonth()` — wrong month during the IST early-morning window on the 1st.
- `opportunities.js`'s `detectForecastWarning` (`~264-268, 283`) looks up the current month's budget via `now.getMonth()+1`/`now.getFullYear()`, and computes `expires_at` the same way — during that window, looks up last month's (likely nonexistent) budget row and silently produces no/wrong forecast warning.

- [ ] **Step 1: Read both functions in full.**

- [ ] **Step 2: Write a failing test for each**, same IST-boundary-timestamp technique as Tasks 5-6.

- [ ] **Step 3: Implement.** Same fix shape as Task 6 — derive month/year from an IST-adjusted date rather than raw `now`. Since this exact fix now applies in three separate files (`ai.js` Task 6, `insights.js`, `opportunities.js`), consider whether a small shared helper is warranted (e.g. exporting an `istNow()`/`istMonthYear()` utility from `ai.js` or a new tiny `backend/src/utils/istDate.js` that all three import) rather than triplicating the same derivation logic — use your judgment based on how much the three call sites' exact needs overlap; if they diverge enough that a shared helper would be awkward, three independent (but each internally correct) fixes are acceptable too. If you do extract a shared helper, this task takes on modifying `ai.js` to use it too (re-verify Task 6's tests still pass) — note this dependency in your report.

- [ ] **Step 4-5: Run the targeted tests, then the full backend suite.** All must pass.

- [ ] **Step 6: Commit.**
```
git add backend/src/routes/insights.js backend/src/routes/opportunities.js <test files> <ai.js if a shared helper was extracted>
git commit -m "fix(insights,opportunities): compute month boundaries in IST for peer-benchmarks and forecast-warning

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 8: Scope weekly/daily AI briefing crons to active users

**Files:** Modify `backend/src/index.js`.

**Root cause:** The weekly AI briefing cron (`0 8 * * 1`, `~819`) and daily AI briefing/push cron (`0 21 * * *`, `~920`) both iterate `SELECT DISTINCT user_id FROM user_fcm_tokens` — every user who ever registered a push token, no activity filter — and each makes a real `aiComplete()` LLM call per user. Every OTHER cron that calls an LLM (intraday daily-brief refresh, opportunity detection) explicitly scopes to `WHERE EXISTS (... transactions ... last 2 days) OR EXISTS (... daily_briefings opened_at ... last 2 days)`. These two were missed, burning LLM cost on dormant accounts daily/weekly, indefinitely.

- [ ] **Step 1: Read both cron handlers in full**, and re-read the exact "active users" scoping query used by the intraday-refresh/opportunity-detection crons to mirror it precisely.

- [ ] **Step 2:** No dedicated cron tests exist in this codebase (confirmed in Task 4) — verify via the full backend suite plus a manual trace in your report, unless you find cron test infrastructure already exists somewhere (check first).

- [ ] **Step 3: Implement.** Add the same `WHERE EXISTS (...)` activity-scoping clause used elsewhere in this file to both crons' user-selection queries — likely changing `SELECT DISTINCT user_id FROM user_fcm_tokens` to something like `SELECT DISTINCT user_id FROM user_fcm_tokens u WHERE EXISTS (SELECT 1 FROM transactions t WHERE t.user_id = u.user_id AND t.created_at > NOW() - INTERVAL '7 days') OR EXISTS (SELECT 1 FROM daily_briefings b WHERE b.user_id = u.user_id AND b.opened_at > NOW() - INTERVAL '7 days')` — use a wider window than the 2-day one used for intraday refresh (these are weekly/daily summary notifications, not a same-day refresh, so a 7-day activity window is more appropriate; use your judgment and explain the choice in your report) rather than blindly copying the 2-day window.

- [ ] **Step 4: Run the full backend suite.** All must pass.

- [ ] **Step 5: Commit.**
```
git add backend/src/index.js
git commit -m "perf(briefing): scope weekly/daily AI briefing crons to active users, stop paying LLM cost for dormant accounts

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 9: Cache `analytics/page.tsx`'s data fetches

**Files:** Modify `frontend/app/analytics/page.tsx`.

**Root cause:** Analytics fires 7 independent, uncached API calls on mount (`analyticsAPI.summary`, `.trends`, `transactionsAPI.getAll({month,year})`, `.getAll({year})` for the heatmap, `analyticsAPI.yearly`, `.paymentMethods`, `accountsAPI.getAll()`), including a full-year transaction fetch — none of the two prior caching passes touched this page despite it being the second-heaviest page in the app.

- [ ] **Step 1: Read the current mount-effect block in `analytics/page.tsx` in full**, note the exact current calls/variable names.

- [ ] **Step 2:** No dedicated test for this page exists (matches the dashboard precedent) — verify via `tsc`/`eslint`/full vitest suite.

- [ ] **Step 3: Implement.** Apply the same `getCached`/`setCached` TTL-cache pattern from `frontend/lib/apiCache.ts` used on the dashboard. Pick sensible per-call TTLs and cache-key naming consistent with the dashboard's convention (`<name>-cache-${user.id}[-${month}-${year} if month-scoped]`). The month/year-scoped calls (`summary`, `trends`, `getAll({month,year})`) should key by month/year like the dashboard's own `dashboard-cache-${user.id}-${month}-${year}`; the full-year heatmap fetch and `yearly`/`paymentMethods` should key by year where relevant; `accountsAPI.getAll()` can reuse the EXACT SAME `accounts-cache-${user.id}` key the dashboard already uses (same underlying data, same TTL) rather than inventing a parallel cache for the same resource — this also means it automatically benefits from the accounts-mutation invalidation already wired into `accounts/page.tsx`/`BankAccountsSection.tsx`.

- [ ] **Step 4: Type-check and lint.** `cd frontend && npx tsc --noEmit && npx eslint app/analytics/page.tsx`.

- [ ] **Step 5: Run the full frontend suite.** `cd frontend && npx vitest run`.

- [ ] **Step 6: Commit.**
```
git add frontend/app/analytics/page.tsx
git commit -m "perf(analytics): cache the 7 data fetches client-side, reuse the dashboard's accounts-cache key

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 10: Throttle NAV-refresh cron; cache `detect-patterns` and `health-report` LLM calls

**Files:** Modify `backend/src/index.js`, `backend/src/routes/ai.js`.

**Root cause:** (a) The mutual-fund NAV-refresh cron (`30 21 * * *`, `~953`) loops over every distinct `scheme_code` calling an external API (`getLatestNav`, mfapi.in) with no delay between iterations — every other loop-over-external-API cron in this file has a `500ms` throttle; this one doesn't, risking third-party rate-limiting. (b) `GET /detect-patterns` and `POST /health-report` in `ai.js` make uncached `aiComplete()` calls despite operating on data (last-3-months transactions / this-month financials) that doesn't change every request — their sibling detectors (`salary_intelligence`, `personality`, `forecast`) already use the `ai_cache` JSONB-column caching layer (`backend/src/utils/aiCache.js`).

- [ ] **Step 1: Read the NAV-refresh cron and both `ai.js` route handlers in full**, and read `backend/src/utils/aiCache.js` plus one of the already-cached detectors (e.g. `salary_intelligence`) to see the exact caching convention to mirror.

- [ ] **Step 2:** For the throttle fix, no dedicated test needed (matches Task 4/8 precedent). For the two caching additions, write failing tests proving a second call with unchanged underlying data does NOT re-invoke `aiComplete` (mirroring the existing "unchanged-points cache skip" test pattern already used for the daily brief).

- [ ] **Step 3: Implement.**
  - Add the same `await new Promise(resolve => setTimeout(resolve, 500));` throttle between iterations in the NAV-refresh cron's loop, matching its siblings.
  - Wire `GET /detect-patterns` and `POST /health-report` through the `aiCache.js` layer the same way `salary_intelligence`/`personality`/`forecast` already do — check what cache key/invalidation trigger those use (likely a TTL plus a data-fingerprint check) and apply the same pattern with an appropriate cache key (`detect_patterns`, `health_report`) added to whatever `ALLOWED_CACHE_KEYS` set gates manual cache-busting (seen in `ai.js`'s `DELETE /cache/:key`) if that set needs extending for consistency.

- [ ] **Step 4-5: Run the targeted tests, then the full backend suite.** All must pass.

- [ ] **Step 6: Commit.**
```
git add backend/src/index.js backend/src/routes/ai.js <test files>
git commit -m "perf(ai): throttle the NAV-refresh cron's external API calls, cache detect-patterns and health-report

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 11: N+1 fixes — `planning.js`, `groups.js`, `transactions.js` budget-alert lookup

**Files:** Modify `backend/src/routes/planning.js`, `backend/src/routes/groups.js`, `backend/src/routes/transactions.js`, their test files.

**Root cause:**
- `planning.js`'s `POST /apply-recalculation` (`~399-404`) does a per-item `UPDATE` loop inside an open transaction — collapsible into a single batch `UPDATE ... FROM (VALUES ...) AS v(id, amount)` (or `UNNEST`).
- `groups.js` has three per-row `INSERT` loops (group creation `~43-49`, split creation `~256-260`, split update `~327-331`) — this codebase already has an established "single multi-row INSERT via unnest" convention (see `pdfImport.js`/`camsImport.js`'s explicit comments to that effect) that these three don't follow.
- `transactions.js`'s post-create `setImmediate` budget-alert block (`~405-418`) does a per-alert `SELECT name FROM categories WHERE id=$1` in a loop — avoidable by adding `JOIN categories c ON c.id=b.category_id` to the budgets query that already runs just above it and selecting `c.name` directly. Runs after the response is sent (no user-facing latency), but it's needless DB round trips on the most frequent write path in the app.

- [ ] **Step 1: Read all three locations in full**, and read `pdfImport.js`/`camsImport.js`'s existing batch-insert pattern to mirror its exact style.

- [ ] **Step 2: Write/update tests** for each: confirm the same end-state (all rows updated/inserted correctly) with an assertion on the QUERY COUNT dropping from N+1 to O(1) (mirroring the "each detector queried exactly once" test style used in the opportunities.js Task 1 tests from the prior branch).

- [ ] **Step 3: Implement** each of the three as a single batched query, preserving exact existing behavior/return values. For `transactions.js`, this is the simplest — just add the join and drop the loop's `SELECT`.

- [ ] **Step 4-5: Run each targeted test, then the full backend suite.** All must pass.

- [ ] **Step 6: Commit.**
```
git add backend/src/routes/planning.js backend/src/routes/groups.js backend/src/routes/transactions.js <test files>
git commit -m "perf: batch per-row loops into single queries in planning, groups, and the budget-alert lookup

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 12: Frontend cache invalidation — budgets, goals, personal loans, recurring processing

**Files:** Modify `frontend/app/budgets/page.tsx`, `frontend/app/goals/page.tsx`, `frontend/components/personal-loans/PersonalLoanModal.tsx`, `frontend/components/personal-loans/RepaymentModal.tsx`, `frontend/app/dashboard/page.tsx` (the `recurringAPI.process()` call site).

**Root cause:** `dashboard-cache-${user.id}-${month}-${year}` bundles summary+trends+transactions+budgets+goals, but neither `budgets/page.tsx` nor `goals/page.tsx` ever calls `localStorage.removeItem` on any mutation — a budget/goal edit leaves the dashboard showing pre-edit figures for up to 10 minutes. Similarly, `PersonalLoanModal.tsx`/`RepaymentModal.tsx` let the user tie a loan/repayment to a bank account (which moves that account's real balance server-side) but have zero cache-invalidation code — the accounts-cache and dashboard-cache stay stale. `recurringAPI.process()` (dashboard mount, and the manual "Process recurring" button in `budgets/page.tsx`) can auto-post real transactions but busts no cache at all.

- [ ] **Step 1: Read all five files' current mutation success paths in full**, and re-read `TransactionModal.tsx`/`TransactionList.tsx`'s existing invalidation block (added in a prior branch) as the exact pattern to extend.

- [ ] **Step 2:** No dedicated tests for these pages/components exist for cache-invalidation behavior specifically (matches prior-branch precedent for page-level components) — verify via `tsc`/`eslint`/full vitest suite; if any of these files DOES have an existing test suite (check `RepaymentModal`/`PersonalLoanModal` — they may, given the personal-loans feature was built with tests per this codebase's history), extend it rather than skipping.

- [ ] **Step 3: Implement.**
  - `budgets/page.tsx`: on create/edit/delete/bulk-apply, bust `dashboard-cache-${user.id}-${cm}-${cy}` for the relevant month(s) (mirroring the exact current-month + transaction's-own-month dual-bust pattern already used in `TransactionModal.tsx`).
  - `goals/page.tsx`: same, on create/update/delete.
  - `PersonalLoanModal.tsx`/`RepaymentModal.tsx`: when an account is tied to the loan/repayment, bust `accounts-cache-${user.id}` and `dashboard-cache-${user.id}-${cm}-${cy}` (current month) after a successful submit.
  - `recurringAPI.process()`'s two call sites (dashboard mount effect, and `budgets/page.tsx`'s manual "Process recurring" handler): when the response indicates `processed > 0`, bust `dashboard-cache-${user.id}-${cm}-${cy}`, `accounts-cache-${user.id}`, `dti-cache-${user.id}`, and `credit-utilization-cache-${user.id}` (recurring items can post to either a bank account or a credit card).

- [ ] **Step 4: Type-check and lint** on all touched files.

- [ ] **Step 5: Run the full frontend suite.**

- [ ] **Step 6: Commit.**
```
git add frontend/app/budgets/page.tsx frontend/app/goals/page.tsx frontend/components/personal-loans/PersonalLoanModal.tsx frontend/components/personal-loans/RepaymentModal.tsx frontend/app/dashboard/page.tsx
git commit -m "fix(cache): invalidate dashboard/accounts/dti caches on budget, goal, loan, and recurring-processing mutations

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 13: Frontend cache invalidation — bulk ops, SMS importer, offline queue, transfer branch

**Files:** Modify `frontend/components/transactions/BulkOpsPanel.tsx`, `frontend/components/transactions/SmsImporter.tsx`, `frontend/lib/txQueue.ts`, `frontend/components/transactions/TransactionModal.tsx` (transfer branch).

**Root cause:** These four transaction-mutation paths have NEVER had any cache-invalidation (not even the older, pre-existing `dashboard-cache-*`/`analytics-cache-*` keys, let alone the newer `accounts-cache-*`/`investment-ratio-cache-*`/`dti-cache-*`/`daily-brief-cache-*` ones) — a previously-accepted, TTL-bounded gap that the user has now asked to close as part of "fix everything."

- [ ] **Step 1: Read all four files in full**, and re-read `TransactionModal.tsx`'s non-transfer path / `TransactionList.tsx`'s delete path for the exact invalidation block to replicate.

- [ ] **Step 2:** Check for existing tests on `BulkOpsPanel.tsx`/`SmsImporter.tsx` (this codebase may have them, given SMS parsing is a built-out feature) — extend if present, otherwise verify via `tsc`/`eslint`/full suite.

- [ ] **Step 3: Implement.** Add the SAME invalidation block (`dashboard-cache-*`/`analytics-cache-*` for the relevant month(s), plus `accounts-cache-*`/`investment-ratio-cache-*`/`dti-cache-*` unconditionally) to:
  - `BulkOpsPanel.tsx`'s bulk edit/delete success paths.
  - `SmsImporter.tsx`'s import-confirm success path.
  - `txQueue.ts`'s offline-queue flush/sync success path (this one may need to bust caches for potentially MULTIPLE different months if queued transactions span months — read the queue's data shape first to determine whether a single current-month bust suffices or whether you need to iterate distinct months across the flushed batch).
  - `TransactionModal.tsx`'s transfer branch (`~363-377`, which calls `transactionsAPI.create` twice) — since a transfer moves money between two accounts, bust `accounts-cache-${user.id}` at minimum, plus the month-scoped caches for both legs' months if they can differ.

- [ ] **Step 4: Type-check and lint** on all touched files.

- [ ] **Step 5: Run the full frontend suite.**

- [ ] **Step 6: Commit.**
```
git add frontend/components/transactions/BulkOpsPanel.tsx frontend/components/transactions/SmsImporter.tsx frontend/lib/txQueue.ts frontend/components/transactions/TransactionModal.tsx
git commit -m "fix(cache): extend cache invalidation to bulk ops, SMS import, offline queue sync, and transfers

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 14: Fix `notificationTrigger.ts` NUMERIC-string bug; add double-click guard to loan write-off

**Files:** Modify `frontend/lib/notificationTrigger.ts`, `frontend/app/personal-loans/page.tsx`.

**Root cause:** (a) `notificationTrigger.ts`'s budget-exceeded notification does `` `₹${b.spent.toLocaleString()}` `` on a value that's actually a NUMERIC-string from the API (typed as `number` in a local interface but not actually one at runtime) — `String.prototype` has no own `toLocaleString`, so it silently falls back to `Object.prototype.toLocaleString` (≈`toString()`), producing "₹65000.00" instead of "₹65,000". The same function correctly wraps analogous fields with `Number(...)` a few lines later — this one spot was missed. (b) `personal-loans/page.tsx`'s write-off button has no loading/disabled guard (unlike the delete flow on the same page, which tracks `deletingId`), so a fast double-click fires `personalLoansAPI.writeOff` twice concurrently.

- [ ] **Step 1: Read both files' relevant sections in full.**

- [ ] **Step 2:** Check for an existing test file for `notificationTrigger.ts` (this codebase tests its `lib/` utilities per the `apiCache.test.ts` precedent) — if one exists, add a test there; if not, decide whether one is warranted (a pure function producing notification strings is easily testable — lean toward adding one, following the `apiCache.test.ts` file's structure as a template).

- [ ] **Step 3: Implement.**
  - Wrap `b.spent`/`b.amount` in `Number(...)` before calling `.toLocaleString()`, matching the pattern already used a few lines below in the same function.
  - Add a `writingOffId` (or similar) state to `personal-loans/page.tsx`, set it before calling `personalLoansAPI.writeOff`, disable/relabel the write-off button while set, clear in a `finally`, mirroring the existing `deletingId` pattern on the same page exactly.

- [ ] **Step 4: Type-check and lint.**

- [ ] **Step 5: Run the full frontend suite.**

- [ ] **Step 6: Commit.**
```
git add frontend/lib/notificationTrigger.ts frontend/app/personal-loans/page.tsx
git commit -m "fix: correct NUMERIC-string formatting in budget notifications, guard loan write-off against double-clicks

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 15: Fix `budgets/page.tsx` + `analytics/page.tsx` local-time-vs-IST inconsistency

**Files:** Modify `frontend/app/budgets/page.tsx`, `frontend/app/analytics/page.tsx`.

**Root cause:** `budgets/page.tsx`'s `goalSurplusNudge` (days-left-in-month) and `analytics/page.tsx`'s `daysElapsed` (feeds daily-average/pacing figures) compute "today" via bare `new Date().getDate()` — the device's local calendar day — while other parts of the SAME app (`RepaymentModal.tsx`, `PersonalLoanModal.tsx`, the just-fixed daily-brief backend) deliberately pin "today" to IST specifically because this is an India-only app and a user's device clock/timezone isn't guaranteed to match. For a user whose device isn't set to IST, these two pages would show a pacing figure computed against a different calendar day than the rest of the app implies.

- [ ] **Step 1: Read both call sites in full.**

- [ ] **Step 2:** Verify via `tsc`/`eslint`/full vitest suite (no dedicated tests expected for these specific `useMemo` calculations per existing page-component convention, unless one already exists — check first).

- [ ] **Step 3: Implement.** Replace the bare `new Date().getDate()` (and any accompanying `getMonth()`/`getFullYear()` used for the same "today" concept in these two spots) with the same `new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })`-then-parse approach already used in `RepaymentModal.tsx`/`PersonalLoanModal.tsx`, extracting the day-of-month from that IST-pinned string rather than the device's local date.

- [ ] **Step 4-5: Type-check, lint, run the full frontend suite.**

- [ ] **Step 6: Commit.**
```
git add frontend/app/budgets/page.tsx frontend/app/analytics/page.tsx
git commit -m "fix: pin 'today' to IST in budget pacing and analytics day-elapsed calculations

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 16: Memoize `transactions/page.tsx` income/expense totals

**Files:** Modify `frontend/app/transactions/page.tsx`.

**Root cause:** `sortedFiltered` is correctly wrapped in `useMemo` (`~242`), but the very next two lines compute `totalIncome`/`totalExpense` via `.filter(...).reduce(...)` directly in the render body — two full unmemoized passes over the (potentially large, "All Time" unbounded) filtered transaction list on every re-render, including re-renders triggered by unrelated state (selection, sort key, modal open/close).

- [ ] **Step 1: Read the current code in full.**

- [ ] **Step 2:** Verify via `tsc`/`eslint`/full vitest suite (check if this page has an existing test file first and extend if so).

- [ ] **Step 3: Implement.** Wrap `totalIncome`/`totalExpense` in `useMemo(() => ..., [filtered])`, matching the pattern one line above.

- [ ] **Step 4-5: Type-check, lint, run the full frontend suite.**

- [ ] **Step 6: Commit.**
```
git add frontend/app/transactions/page.tsx
git commit -m "perf(transactions): memoize income/expense totals instead of recomputing on every render

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 17: Verify missing composite index; cache `debt-intelligence/page.tsx`

**Files:** Possibly a new migration in `backend/src/db/migrations/`; modify `frontend/app/debt-intelligence/page.tsx`.

**Part A — index verification (do NOT blindly add):** The audit flagged a possibly-missing composite index `(user_id, type, date)` on `transactions` (existing indexes are separate `(user_id, date DESC)` and `(user_id, type)`), hit by `WHERE user_id=$1 AND type=... AND date BETWEEN/>=...` in `getDailyBriefData`, analytics summaries, and several crons. This was NOT verified with `EXPLAIN ANALYZE` by the audit — do that first.

- [ ] **Step 1:** If you have a way to connect to a real (or realistically-seeded) instance of this app's Postgres database, run `EXPLAIN ANALYZE` on the actual query shape (`SELECT ... FROM transactions WHERE user_id=$1 AND type=$2 AND date >= $3 AND date <= $4`) with a representative row count for one user. If you do NOT have DB access in this environment, skip the live verification and instead reason about it structurally: check whether Postgres's query planner would need a bitmap-AND of the two existing separate indexes (acceptable but not optimal) versus whether the existing `(user_id, date DESC)` index alone is likely selective enough for a typical personal-finance app's per-user transaction volume (likely hundreds to low thousands of rows, not millions) that a composite index wouldn't meaningfully change performance.
- [ ] **Step 2:** If you conclude the index is genuinely worth adding (real measured improvement, or a structural argument strong enough to justify it even without live measurement), write a migration `backend/src/db/migrations/0NN_transactions_composite_index.sql` (check the actual next available migration number in the directory) adding `CREATE INDEX IF NOT EXISTS idx_transactions_user_type_date ON transactions(user_id, type, date DESC);` and note in your report that this is additive/safe (an extra index has a small write-amplification cost but no correctness risk). If you conclude it's NOT clearly worth it, DO NOT add the migration — report DONE_WITH_CONCERNS explaining your reasoning (which decision was made and why) instead of blindly adding a speculative index.

**Part B — debt-intelligence caching:**

- [ ] **Step 3: Read `debt-intelligence/page.tsx`'s mount effect in full** — 4 concurrent calls (`loanAPI.getAll`, `debtAPI.getPayoffOptimizer`, `.getCreditUtilization`, `.getDti`), no caching.
- [ ] **Step 4:** Verify via `tsc`/`eslint`/full vitest suite.
- [ ] **Step 5: Implement.** Apply `getCached`/`setCached` to all 4 calls. Reuse the EXACT SAME `credit-utilization-cache-${user.id}` and `dti-cache-${user.id}` keys the dashboard already uses (same underlying data) so this page automatically benefits from the invalidation already wired into account/investment/debt mutation flows (and Task 12's new loan/recurring invalidation) — do not create a second, parallel cache for the same data. `loanAPI.getAll`/`getPayoffOptimizer` can use new page-specific keys (`loans-cache-${user.id}`, `payoff-optimizer-cache-${user.id}`) since nothing else currently caches them.
- [ ] **Step 6: Commit.**
```
git add backend/src/db/migrations/<NN>_transactions_composite_index.sql frontend/app/debt-intelligence/page.tsx
git commit -m "perf(debt): cache debt-intelligence page fetches, reusing shared credit-utilization/dti cache keys

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```
(omit the migration file from `git add` if Part A concluded not to add it)

---

## Self-review

- **Spec coverage:** every finding from all 4 audit tracks (security, backend correctness, frontend correctness, performance) has a task. The 4 previously-accepted-as-out-of-scope frontend cache gaps are now included per the user's explicit "fix everything" instruction (Task 13).
- **Ordering:** security and correctness bugs first (higher real-world impact — an active IDOR and a permanently-wrong recurring-transaction date are worse than a slow page), performance/cost next, polish last.
- **Known risk in this plan:** several tasks (5, 6, 7) touch the same general "IST date math" theme and Task 7 explicitly allows extracting a shared helper if the implementer judges it worthwhile — this means Task 7's implementer may need to re-touch `ai.js` after Task 6 already modified it; dispatch these in strict numeric order (not in parallel) to avoid merge conflicts between subagent-driven sessions on the same file.
- **Known deliberate scope decision:** Task 17's composite index is explicitly conditional — do not treat "no migration added" as an incomplete task if the reasoning for skipping it is sound and documented.
- **Test file paths are approximate in several tasks** (e.g. "check first whether X test file exists") since this plan was written from audit findings rather than a fresh read of every file — implementers must verify real current file names/line numbers before editing, per each task's Step 1.
