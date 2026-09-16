# Dashboard Load Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix slow dashboard loads by (1) removing the expensive opportunity-detection scan from the request path entirely, (2) deduplicating repeated computation inside it for when it does run, (3) parallelizing a sequential DB write loop, (4) dropping two dashboard calls whose results are never used, and (5) caching the remaining non-critical dashboard data client-side so repeat opens don't hit the backend at all.

**Architecture:** `POST /api/ai/opportunities/detect` (10 detectors, ~15 queries, with 3x/2x redundant bank-balance/avg-expense computation, plus a sequential per-row upsert loop) currently runs synchronously on every dashboard open. It moves to a new daily cron, following the exact structure of the existing `daily brief intraday refresh` cron (same "active in the last 2 days" user-scoping query). The dashboard switches from calling `POST /detect` to the already-existing, cheap `GET /api/ai/opportunities` (a single `SELECT`). The detector internals get refactored so `getBankBalance`/`getAvgMonthlyExpenses` are computed once per run and passed into every detector that needs them, and the upsert loop becomes `Promise.all` instead of a sequential `for...await` (safe: each opportunity has a distinct `type`, so concurrent upserts never conflict with each other under the existing partial unique index). On the frontend, a new tiny `localStorage` TTL-cache helper (mirroring the pattern the dashboard's main 5 calls already use) gets applied to the remaining non-critical fire-and-forget calls.

**Tech Stack:** Node/Express 5 + pg + node-cron (backend), Jest + supertest (backend tests), Next.js 16 + TypeScript (frontend), Vitest (frontend tests). No new dependencies.

**Coding rules that apply (from CLAUDE.md / memory):** JSX inline styles only, CSS variables for color, parameterized SQL, migrations replay on every backend start (not touched by this plan — no schema changes), currency via `Math.round(n).toLocaleString('en-IN')`, no emojis, comments only where the WHY is non-obvious.

---

## File structure

| File | Responsibility |
|---|---|
| `backend/src/routes/opportunities.js` | Dedupe shared computation, parallelize upsert, export `detectOpportunities`/`saveOpportunities` for the cron (modify) |
| `backend/tests/opportunities.routes.test.js` | Update signatures for the refactored detectors, add dedup + parallel-upsert regression tests (modify) |
| `backend/src/index.js` | Store the opportunities router in a named variable; add the daily detection cron (modify) |
| `frontend/lib/apiCache.ts` | Tiny TTL-based localStorage cache primitive (new) |
| `frontend/lib/apiCache.test.ts` | Tests for the cache primitive (new) |
| `frontend/app/dashboard/page.tsx` | Swap `opportunityAPI.detect()` for `.getAll()`, drop 2 unused calls, cache the rest (modify) |

---

### Task 1: Dedupe shared computation in the opportunity detectors

**Files:**
- Modify: `backend/src/routes/opportunities.js`
- Modify: `backend/tests/opportunities.routes.test.js`

`getBankBalance(userId)` currently gets computed independently inside `detectIdleCash`, `detectAllocationGap`, and `detectEmergencyFundLow` (3x); `getAvgMonthlyExpenses(userId)` independently inside `detectIdleCash` and `detectEmergencyFundLow` (2x). Read `backend/src/routes/opportunities.js` in full first — the exact current line numbers matter less than the exact current function bodies, which you'll be changing.

- [ ] **Step 1: Update the existing tests for the new signatures (write these first — this is the failing-test step)**

Open `backend/tests/opportunities.routes.test.js`. Replace the entire `describe('detectIdleCash / detectEmergencyFundLow — personalized emergency fund target', ...)` block with:
```js
describe('detectIdleCash / detectEmergencyFundLow — personalized emergency fund target', () => {
    test('detectIdleCash and detectEmergencyFundLow agree on the same target months', async () => {
        const plan = { risk_profile: 'balanced', emergency_fund_target_months: 9, has_plan: true };

        const idle = await detectIdleCash('user-1', plan, 1500000, 50000);
        expect(idle.description).toContain('9-month');

        const low = await detectEmergencyFundLow('user-1', plan, 100000, 50000);
        expect(low.title).toContain('9 months');
        expect(low.description).toContain('9 months');
    });

    test('detectIdleCash falls back to the default 6-month target with no plan row', async () => {
        const plan = { risk_profile: 'balanced', emergency_fund_target_months: 6, has_plan: false };
        const idle = await detectIdleCash('user-1', plan, 1500000, 50000);
        expect(idle.description).toContain('6-month');
    });
});
```
(`bankBalance`/`avgExpenses` are now passed directly as numbers instead of being mocked via `pool.query` — these two functions will no longer query the database themselves at all.)

Add `detectAllocationGap`, `detectOpportunities`, and `saveOpportunities` to the top-of-file `require(...)` destructure:
```js
const {
    getFinancialPlan,
    detectIdleCash,
    detectEmergencyFundLow,
    detectCreditCardInterest,
    detectSpendingSpike,
    detectAllocationGap,
    detectOpportunities,
    saveOpportunities,
} = require('../src/routes/opportunities');
```

Append this new describe block:
```js
describe('detectAllocationGap — no longer queries bank balance itself', () => {
    test('accepts bankBalance as a parameter instead of querying it', async () => {
        pool.query.mockResolvedValueOnce({
            rows: [{ type: 'mutual_fund', total: '900000' }],
        });
        const result = await detectAllocationGap('user-1', 100000);
        // total portfolio = 100000 (bank) + 900000 (mutual_fund) = 1000000
        // bank% = 10% (matches RECOMMENDED_PCT.bank exactly -> no gap on bank)
        // mutual_fund% = 90% vs recommended 30% -> a 60-point gap, biggest
        expect(result.category).toBe('mutual_fund');
        expect(pool.query).toHaveBeenCalledTimes(1); // only the investments query, no bank-balance query
    });
});

describe('detectOpportunities — computes shared values once', () => {
    test('queries bank balance and avg expenses exactly once each, not once per detector that needs them', async () => {
        pool.query.mockImplementation((sql) => {
            if (sql.includes('FROM bank_accounts')) return Promise.resolve({ rows: [{ total: '1500000' }] });
            if (sql.includes("type = 'expense'") && sql.includes('3 months')) return Promise.resolve({ rows: [{ avg: '50000' }] });
            return Promise.resolve({ rows: [] });
        });

        await detectOpportunities('user-1');

        const bankBalanceCalls = pool.query.mock.calls.filter(c => c[0].includes('FROM bank_accounts'));
        const avgExpenseCalls = pool.query.mock.calls.filter(c => c[0].includes("type = 'expense'") && c[0].includes('3 months'));
        expect(bankBalanceCalls).toHaveLength(1);
        expect(avgExpenseCalls).toHaveLength(1);
    });
});

describe('saveOpportunities — parallel upsert', () => {
    test('upserts every detected opportunity with the right params', async () => {
        pool.query.mockResolvedValue({ rows: [] });
        const detected = [
            { type: 'idle_cash', title: 'T1', description: 'D1', amount_saved: 100, priority: 1, action_label: 'A1', action_route: '/x', expires_at: null },
            { type: 'spending_spike', title: 'T2', description: 'D2', amount_saved: 200, priority: 2, action_label: 'A2', action_route: '/y', expires_at: null },
        ];
        await saveOpportunities('user-1', detected);
        expect(pool.query).toHaveBeenCalledTimes(2);
        expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO opportunities'), ['user-1', 'idle_cash', 'T1', 'D1', 100, 1, 'A1', '/x', null]);
        expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO opportunities'), ['user-1', 'spending_spike', 'T2', 'D2', 200, 2, 'A2', '/y', null]);
    });

    test('does not wait for one upsert to resolve before starting the next', async () => {
        let resolveFirst;
        const firstPromise = new Promise(r => { resolveFirst = r; });
        let secondCallStarted = false;
        pool.query.mockImplementationOnce(() => firstPromise);
        pool.query.mockImplementationOnce(() => { secondCallStarted = true; return Promise.resolve({ rows: [] }); });

        const detected = [
            { type: 'a', title: 't', description: 'd', amount_saved: 0, priority: 1, action_label: 'l', action_route: '/r', expires_at: null },
            { type: 'b', title: 't', description: 'd', amount_saved: 0, priority: 1, action_label: 'l', action_route: '/r', expires_at: null },
        ];
        const promise = saveOpportunities('user-1', detected);
        // A sequential (for...await) implementation would NOT have started
        // the second query yet at this point, since it would still be
        // awaiting the first (unresolved) promise.
        await Promise.resolve();
        expect(secondCallStarted).toBe(true);
        resolveFirst({ rows: [] });
        await promise;
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx jest tests/opportunities.routes.test.js`
Expected: FAIL — `detectIdleCash`/`detectEmergencyFundLow`/`detectAllocationGap` still expect to query internally (extra unconsumed mocks / wrong descriptions), and `detectOpportunities`/`saveOpportunities` are not exported yet.

- [ ] **Step 3: Implement — change the detector signatures**

In `backend/src/routes/opportunities.js`, change `detectIdleCash`:
```js
async function detectIdleCash(userId, plan, bankBalance, avgExpenses) {
    if (avgExpenses <= 0) return null;

    const targetMonths = plan.emergency_fund_target_months;
    if (bankBalance <= avgExpenses * (targetMonths + 2)) return null;

    const idleAmount = fmt(bankBalance - avgExpenses * targetMonths);
    if (idleAmount <= 0) return null;

    return {
        type: 'idle_cash',
        title: `${inr(idleAmount)} sitting idle in savings account`,
        description: `Your bank balance of ${inr(bankBalance)} is well beyond your ${targetMonths}-month expense buffer of ${inr(avgExpenses * targetMonths)}. Moving the surplus to a liquid fund (~7% returns vs ~3.5% savings interest) could earn meaningfully more.`,
        amount_saved: fmt(idleAmount * 0.05),
        priority: idleAmount < 100000 ? 2 : 1,
        action_label: 'Explore liquid funds',
        action_route: '/investments',
        expires_at: null,
    };
}
```
(only the function signature and the removed `const [bankBalance, avgExpenses] = await Promise.all([...])` line change — the body below that line is untouched.)

Change `detectAllocationGap`:
```js
async function detectAllocationGap(userId, bankBalance) {
    const invRes = await pool.query(`SELECT type, COALESCE(SUM(units * current_nav_or_price), 0) AS total FROM investments WHERE user_id = $1 GROUP BY type`, [userId]);

    const invTotals = {};
    for (const row of invRes.rows) invTotals[row.type] = parseFloat(row.total);
    // ...rest of the function body is unchanged from here down (categories,
    // total, RECOMMENDED_PCT, LABELS, the biggest-deviation loop, the return).
}
```
(remove the `Promise.all` and the `getBankBalance(userId)` call; `bankBalance` is now a parameter.)

Change `detectEmergencyFundLow`:
```js
async function detectEmergencyFundLow(userId, plan, bankBalance, avgExpenses) {
    const targetMonths = plan.emergency_fund_target_months;
    if (avgExpenses <= 0 || bankBalance >= avgExpenses * targetMonths) return null;
    // ...rest of the function body (the return object) is unchanged.
}
```

- [ ] **Step 4: Implement — add `detectOpportunities` (if not already present) computing shared values once, and `saveOpportunities`**

Find the existing `detectOpportunities` function and replace it entirely:
```js
async function detectOpportunities(userId) {
    const [plan, bankBalance, avgExpenses] = await Promise.all([
        getFinancialPlan(userId),
        getBankBalance(userId),
        getAvgMonthlyExpenses(userId),
    ]);
    const results = await Promise.all([
        detectIdleCash(userId, plan, bankBalance, avgExpenses),
        detectCreditCardInterest(userId),
        detectHighInterestLoan(userId),
        detectSpendingSpike(userId),
        detectAllocationGap(userId, bankBalance),
        detectEmergencyFundLow(userId, plan, bankBalance, avgExpenses),
        detectForecastWarning(userId),
        detectPersonalityInsight(userId),
        detectBehavioralPattern(userId),
        detectSalaryIntelligenceInsight(userId),
    ]);
    return results.filter(r => r !== null);
}

// Distinct opportunity `type`s never collide under the partial unique index
// (idx_opportunities_user_type_active), so upserting them concurrently is
// safe -- this replaces a sequential for...await loop that made N detected
// opportunities cost N round-trips in series instead of running together.
async function saveOpportunities(userId, detected) {
    await Promise.all(detected.map(opp => pool.query(
        `INSERT INTO opportunities (user_id, type, title, description, amount_saved, priority, action_label, action_route, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (user_id, type) WHERE status = 'active'
         DO UPDATE SET title=$3, description=$4, amount_saved=$5, priority=$6,
             action_label=$7, action_route=$8, expires_at=$9, detected_at=NOW()`,
        [userId, opp.type, opp.title, opp.description, opp.amount_saved, opp.priority, opp.action_label, opp.action_route, opp.expires_at]
    )));
}
```

- [ ] **Step 5: Update `POST /detect` to use `saveOpportunities`**

Replace the route body:
```js
router.post('/detect', async (req, res) => {
    try {
        const detected = await detectOpportunities(req.user.id);
        await saveOpportunities(req.user.id, detected);

        const activeRes = await pool.query(
            `SELECT * FROM opportunities WHERE user_id = $1 AND status = 'active' ORDER BY priority ASC, detected_at DESC`,
            [req.user.id]
        );

        res.json({ detected_count: detected.length, opportunities: activeRes.rows });
    } catch (err) {
        console.error('[Opportunities]', err.message);
        res.status(500).json({ error: 'Server error.' });
    }
});
```
(this removes the old `for (const opp of detected) { await pool.query(...) }` loop and the comment above it — `saveOpportunities` now owns that logic.)

- [ ] **Step 6: Export the two new functions**

Find the `module.exports.detectForecastWarning = detectForecastWarning;` line at the bottom of the file and add directly after it:
```js
module.exports.detectAllocationGap = detectAllocationGap;
module.exports.detectOpportunities = detectOpportunities;
module.exports.saveOpportunities = saveOpportunities;
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd backend && npx jest tests/opportunities.routes.test.js`
Expected: PASS (all tests, including the new ones)

- [ ] **Step 8: Run the full backend suite**

Run: `cd backend && npx jest`
Expected: PASS — every suite (nothing else calls these detector functions directly with the old signature).

- [ ] **Step 9: Commit**

```bash
git add backend/src/routes/opportunities.js backend/tests/opportunities.routes.test.js
git commit -m "perf(opportunities): compute bank balance and avg expenses once per run instead of per detector"
```
with this trailer on its own final line:
```
Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
```

---

### Task 2: Move opportunity detection to a daily cron

**Files:**
- Modify: `backend/src/index.js`

No new automated test for this task — none of this file's existing 15+ cron jobs have dedicated tests in this codebase; they're verified by reading the code against the established pattern and by the full backend suite still passing (proving nothing else broke). This matches how the personal-loans due-date cron was handled earlier in this codebase's history.

- [ ] **Step 1: Read the current opportunities mount line and the "daily brief intraday refresh" cron in full**

Find `app.use('/api/ai/opportunities', require('./routes/opportunities'));` in `backend/src/index.js` and read the full `// ─── Cron: daily brief intraday refresh` block (search for that comment) to confirm the exact current active-user-scoping SQL and loop structure before copying it.

- [ ] **Step 2: Store the opportunities router in a named variable**

Change:
```js
app.use('/api/ai/opportunities', require('./routes/opportunities'));
```
to:
```js
const opportunitiesRoutes = require('./routes/opportunities');
```
placed near the other named route requires (e.g. next to `const aiRoutes = require('./routes/ai');`), and update the mount line to:
```js
app.use('/api/ai/opportunities', opportunitiesRoutes);
```
(keep this mount line in its original position in the middle-of-file route-mounting block — only the `require` moves up to be named and stored.)

- [ ] **Step 3: Add the cron**

Add this new cron job directly after the `// ─── Cron: daily brief intraday refresh` block ends (after its closing `}, { timezone: 'Asia/Kolkata' });`):
```js
// ─── Cron: daily opportunity detection — 7am IST ─────────────────────────────
// Moves the expensive multi-detector scan (10 detectors, ~10 queries even
// after dedup) off the dashboard's request path -- opportunities like idle
// cash or a high-interest card don't need to be recomputed on every single
// page open. The dashboard now reads the already-detected list via
// GET /api/ai/opportunities (one cheap SELECT) instead of triggering a fresh
// POST /detect synchronously on every visit.
cron.schedule('0 7 * * *', async () => {
    console.log('[Cron] Detecting opportunities...');
    let success = 0, failed = 0;
    try {
        // Same "active in the last 2 days" scoping already used by the daily
        // brief refresh -- skip the DB work for accounts nobody is looking at.
        const { rows: users } = await pool.query(
            `SELECT id AS user_id FROM users u
             WHERE EXISTS (
                 SELECT 1 FROM transactions t WHERE t.user_id = u.id AND t.created_at > NOW() - INTERVAL '2 days'
             ) OR EXISTS (
                 SELECT 1 FROM daily_briefings b WHERE b.user_id = u.id AND b.opened_at > NOW() - INTERVAL '2 days'
             )`
        );

        for (const { user_id } of users) {
            try {
                const detected = await opportunitiesRoutes.detectOpportunities(user_id);
                await opportunitiesRoutes.saveOpportunities(user_id, detected);
                success++;
            } catch (err) {
                failed++;
                console.error(`[Cron:Opportunities] user ${user_id}:`, err.message);
            }
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        console.log(`[Cron:Opportunities] done — success: ${success}, failed: ${failed}`);
    } catch (err) {
        console.error('[Cron:Opportunities] fatal:', err.message);
    }
}, { timezone: 'Asia/Kolkata' });
```

- [ ] **Step 4: Run the full backend suite**

Run: `cd backend && npx jest`
Expected: PASS — every suite.

- [ ] **Step 5: Commit**

```bash
git add backend/src/index.js
git commit -m "perf(opportunities): detect opportunities via a daily cron instead of on every dashboard load"
```

---

### Task 3: Frontend — read pre-detected opportunities instead of triggering detection, and drop two unused calls

**Files:**
- Modify: `frontend/app/dashboard/page.tsx`

No dedicated test file for this task (page.tsx files aren't unit-tested in this repo).

- [ ] **Step 1: Read the current dashboard data-fetching `useEffect` in full**

Find the block starting with `fetchData();` followed by the run of fire-and-forget `.then(...).catch(() => {})` calls in `frontend/app/dashboard/page.tsx`, and confirm the exact current lines before editing (this plan text may not reflect the file's current exact line numbers).

- [ ] **Step 2: Swap the opportunities call**

Change:
```ts
opportunityAPI.detect().then(res => setOpportunities(res.data?.opportunities ?? [])).catch(() => {});
```
to:
```ts
opportunityAPI.getAll().then(res => setOpportunities(res.data?.opportunities ?? [])).catch(() => {});
```
(the response shape is identical — `GET /api/ai/opportunities` already returns `{opportunities: [...], summary: {...}}`, and `opportunityAPI.getAll()` already exists in `frontend/lib/api.ts`, calling that exact endpoint. No other file needs to change for this step.)

- [ ] **Step 3: Remove the two calls whose results are never used**

Delete these two lines entirely:
```ts
analyticsAPI.getWealthVelocity().catch(() => {});
analyticsAPI.getAssetAllocation().catch(() => {});
```
Confirm before deleting that neither `getWealthVelocity` nor `getAssetAllocation`'s response is consumed anywhere else in this file (grep the file for `WealthVelocity` and `AssetAllocation` — there should be no `.then(...)` attached to either call and no state variable populated from them). If you find a consumer this plan missed, do NOT delete that call — report DONE_WITH_CONCERNS instead and leave it in place.

- [ ] **Step 4: Type-check and lint**

Run: `cd frontend && npx tsc --noEmit && npx eslint app/dashboard/page.tsx`
Expected: clean

- [ ] **Step 5: Run the full frontend suite**

Run: `cd frontend && npx vitest run`
Expected: PASS — every suite (this page has no dedicated tests, but nothing else should reference the removed calls).

- [ ] **Step 6: Commit**

```bash
git add frontend/app/dashboard/page.tsx
git commit -m "perf(dashboard): read pre-detected opportunities instead of triggering detection on load, drop 2 unused calls"
```
with trailer:
```
Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
```

---

### Task 3.5: Lazy-detect opportunities on a user's first-ever `GET /`

**Files:**
- Modify: `backend/src/routes/opportunities.js`
- Modify: `backend/tests/opportunities.routes.test.js`

**Why:** Task 2 moved detection to a once-daily 7am cron that only scans users active in the last 2 days (a transaction or an opened daily briefing). Task 3 made the dashboard read via `GET /` instead of triggering detection on `POST /detect`. Together, this means a user with zero opportunity rows ever created (a brand-new signup, or anyone who hasn't logged a transaction or opened their briefing recently) would see an empty opportunities section indefinitely — not just until the next cron run, but forever, until they happen to satisfy the cron's activity filter. This task closes that gap: `GET /` detects once, inline, the very first time a user has no opportunity rows at all (any status), then serves the fast read path for every call after that — matching old on-first-load behavior without paying the detection cost on every subsequent load.

Read the current `GET /` route handler in `backend/src/routes/opportunities.js` in full first (it currently runs three `Promise.all`'d queries: active rows, dismissed count, acted-on count) before editing.

- [ ] **Step 1: Write the failing test**

In `backend/tests/opportunities.routes.test.js`, add:
```js
describe('GET / — lazy-detects on a user\'s first-ever call', () => {
    test('runs detection and saves before responding when the user has zero opportunity rows of any status', async () => {
        const app = express();
        app.use(express.json());
        app.use((req, res, next) => { req.user = { id: 'user-1' }; next(); });
        app.use('/', opportunitiesRouter);

        pool.query.mockImplementation((sql) => {
            if (sql.includes('SELECT 1 FROM opportunities')) return Promise.resolve({ rows: [] }); // no rows at all yet
            if (sql.includes('FROM bank_accounts')) return Promise.resolve({ rows: [{ total: '1500000' }] });
            if (sql.includes("type = 'expense'") && sql.includes('3 months')) return Promise.resolve({ rows: [{ avg: '50000' }] });
            if (sql.includes("status = 'active'")) return Promise.resolve({ rows: [{ id: 'opp-1', type: 'idle_cash' }] });
            if (sql.includes("status = 'dismissed'")) return Promise.resolve({ rows: [{ count: '0' }] });
            if (sql.includes("status = 'acted_on'")) return Promise.resolve({ rows: [{ count: '0' }] });
            return Promise.resolve({ rows: [] });
        });

        const res = await request(app).get('/');
        expect(res.status).toBe(200);
        expect(res.body.opportunities).toEqual([{ id: 'opp-1', type: 'idle_cash' }]);

        const existsCheck = pool.query.mock.calls.some(c => c[0].includes('SELECT 1 FROM opportunities'));
        expect(existsCheck).toBe(true);
    });

    test('skips detection entirely when the user already has at least one opportunity row', async () => {
        const app = express();
        app.use(express.json());
        app.use((req, res, next) => { req.user = { id: 'user-1' }; next(); });
        app.use('/', opportunitiesRouter);

        pool.query.mockImplementation((sql) => {
            if (sql.includes('SELECT 1 FROM opportunities')) return Promise.resolve({ rows: [{ '?column?': 1 }] }); // has a row already
            if (sql.includes("status = 'active'")) return Promise.resolve({ rows: [{ id: 'opp-existing' }] });
            if (sql.includes("status = 'dismissed'")) return Promise.resolve({ rows: [{ count: '2' }] });
            if (sql.includes("status = 'acted_on'")) return Promise.resolve({ rows: [{ count: '1' }] });
            return Promise.resolve({ rows: [] });
        });

        const res = await request(app).get('/');
        expect(res.status).toBe(200);
        expect(res.body.opportunities).toEqual([{ id: 'opp-existing' }]);

        // Only the exists-check + the 3 summary queries should run -- never
        // a bank-balance or avg-expense query, since detection must not fire.
        const bankBalanceCalls = pool.query.mock.calls.filter(c => c[0].includes('FROM bank_accounts'));
        expect(bankBalanceCalls).toHaveLength(0);
    });
});
```
Check the real existing top of `backend/tests/opportunities.routes.test.js` for how `express`, `request` (supertest), and the router are already imported/mounted in this file's other route-level tests (there may already be an existing pattern for testing `GET /` or `POST /detect` through a mounted Express app with a fake auth middleware — reuse that exact pattern, including the correct import name for the router itself, e.g. `opportunitiesRouter` may actually be named differently in this file's existing imports). Adjust the test scaffolding above to match whatever pattern already exists in this file rather than introducing a second, inconsistent way of mounting the router — if no such pattern exists yet in this file (only direct function-call tests exist so far), it's fine to introduce one, following supertest conventions already used elsewhere in this backend's test suite (check another route test file, e.g. `backend/tests/personalLoans.routes.test.js` or similar, for the established supertest mounting convention in this codebase).

- [ ] **Step 2: Run tests, confirm they fail** (route doesn't lazy-detect yet).

- [ ] **Step 3: Implement**

Change the `GET /` handler to:
```js
router.get('/', async (req, res) => {
    try {
        const existsRes = await pool.query(`SELECT 1 FROM opportunities WHERE user_id = $1 LIMIT 1`, [req.user.id]);
        if (existsRes.rows.length === 0) {
            // First time we've ever seen this user on this endpoint -- detect
            // once inline so they don't wait for the next daily cron run.
            // Every call after this one takes the fast read-only path below.
            const detected = await detectOpportunities(req.user.id);
            await saveOpportunities(req.user.id, detected);
        }

        const [activeRes, dismissedRes, actedRes] = await Promise.all([
            pool.query(`SELECT * FROM opportunities WHERE user_id = $1 AND status = 'active' ORDER BY priority ASC, detected_at DESC`, [req.user.id]),
            pool.query(`SELECT COUNT(*) FROM opportunities WHERE user_id = $1 AND status = 'dismissed'`, [req.user.id]),
            pool.query(`SELECT COUNT(*) FROM opportunities WHERE user_id = $1 AND status = 'acted_on'`, [req.user.id]),
        ]);

        res.json({
            opportunities: activeRes.rows,
            summary: {
                active_count: activeRes.rows.length,
                dismissed_count: parseInt(dismissedRes.rows[0].count, 10),
                acted_on_count: parseInt(actedRes.rows[0].count, 10),
            },
        });
    } catch (err) {
        console.error('[Opportunities]', err.message);
        res.status(500).json({ error: 'Server error.' });
    }
});
```
Note the exists-check is scoped to ANY status (not just `status = 'active'`) — a user who has previously had opportunities detected, then dismissed or acted on every single one, must NOT be re-detected on every subsequent `GET /` just because their active count happens to be zero. Only a user with literally zero rows ever (brand new to this feature) triggers the inline detection.

- [ ] **Step 4: Run tests to verify they pass.**

- [ ] **Step 5: Run the full backend suite** (`cd backend && npx jest`) — confirm nothing else broke.

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/opportunities.js backend/tests/opportunities.routes.test.js
git commit -m "perf(opportunities): lazy-detect on a user's first-ever GET so new/inactive users aren't stuck waiting for the daily cron"
```
with trailer:
```
Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
```

---

### Task 4: A tiny reusable localStorage TTL-cache primitive

**Files:**
- Create: `frontend/lib/apiCache.ts`
- Test: `frontend/lib/apiCache.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getCached, setCached } from './apiCache';

beforeEach(() => localStorage.clear());

describe('getCached / setCached', () => {
    it('returns null when nothing is cached', () => {
        expect(getCached('missing-key', 60000)).toBeNull();
    });

    it('round-trips data written by setCached within the TTL', () => {
        setCached('k1', { foo: 'bar' });
        expect(getCached('k1', 60000)).toEqual({ foo: 'bar' });
    });

    it('returns null once the TTL has elapsed', () => {
        const now = Date.now();
        vi.spyOn(Date, 'now').mockReturnValue(now);
        setCached('k2', { foo: 'bar' });
        vi.spyOn(Date, 'now').mockReturnValue(now + 61000);
        expect(getCached('k2', 60000)).toBeNull();
        vi.restoreAllMocks();
    });

    it('returns null for malformed JSON instead of throwing', () => {
        localStorage.setItem('k3', 'not json');
        expect(getCached('k3', 60000)).toBeNull();
    });

    it('does not throw when localStorage.setItem throws (e.g. quota exceeded)', () => {
        const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
        expect(() => setCached('k4', { x: 1 })).not.toThrow();
        spy.mockRestore();
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run lib/apiCache.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// Lightweight per-key localStorage cache with a TTL, used for dashboard data
// that doesn't need to be fresh on every single page open. Never throws --
// a private window, cleared storage, or a blocked accessor should degrade to
// "always fetch", never break the page. Mirrors the inline cache pattern the
// dashboard's main summary/trends/transactions/budgets/goals fetch already
// used before this helper existed.
export function getCached<T>(key: string, ttlMs: number): T | null {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        const { data, ts } = JSON.parse(raw);
        if (typeof ts !== 'number' || Date.now() - ts > ttlMs) return null;
        return data as T;
    } catch {
        return null;
    }
}

export function setCached(key: string, data: unknown): void {
    try {
        localStorage.setItem(key, JSON.stringify({ data, ts: Date.now() }));
    } catch {
        // Storage full or blocked -- caching is a nice-to-have, never fatal.
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run lib/apiCache.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Type-check and lint**

Run: `cd frontend && npx tsc --noEmit && npx eslint lib/apiCache.ts`
Expected: clean

- [ ] **Step 6: Commit**

```bash
git add frontend/lib/apiCache.ts frontend/lib/apiCache.test.ts
git commit -m "feat(dashboard): tiny TTL-based localStorage cache primitive"
```
with trailer:
```
Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
```

---

### Task 5: Apply the cache to the remaining dashboard fire-and-forget calls

**Files:**
- Modify: `frontend/app/dashboard/page.tsx`

No dedicated test (same reasoning as Task 3).

- [ ] **Step 1: Read the current state of the fire-and-forget block** (post Task 3's edits) in full to confirm exact current line content before editing.

- [ ] **Step 2: Import the cache helper**

Add near the other `@/lib/...` imports in `frontend/app/dashboard/page.tsx`:
```ts
import { getCached, setCached } from '@/lib/apiCache';
```

- [ ] **Step 3: Add a small local helper and apply it to the six calls that benefit from it**

Directly above the fire-and-forget calls (after `fetchData();`), add:
```ts
        // Data that doesn't need to be fresh on every single dashboard open --
        // cache it client-side so a repeat visit within the TTL costs nothing.
        // Opportunities and the weekly briefing are deliberately NOT cached
        // here: opportunities is now already a single cheap SELECT (detection
        // itself runs on a daily cron, not per-request), and the briefing has
        // its own weekly-scoped freshness logic already.
        function fetchCached<T>(key: string, ttlMs: number, fetcher: () => Promise<{ data: T }>, onData: (data: T) => void) {
            const cached = getCached<T>(key, ttlMs);
            if (cached !== null) { onData(cached); return; }
            fetcher().then(res => { onData(res.data); setCached(key, res.data); }).catch(() => {});
        }

        const TEN_MIN = 10 * 60 * 1000;
        const FIFTEEN_MIN = 15 * 60 * 1000;
        const THIRTY_MIN = 30 * 60 * 1000;

        fetchCached<any>(`accounts-cache-${user.id}`, TEN_MIN, () => accountsAPI.getAll(), data => setAccounts(data.accounts ?? data ?? []));
        fetchCached<any>(`investments-cache-${user.id}`, TEN_MIN, () => investmentAPI.getAll(), data => setInvestments(data.investments ?? []));
        fetchCached<any>(`investment-ratio-cache-${user.id}`, FIFTEEN_MIN, () => analyticsAPI.getInvestmentRatio(), data => setInvestmentRatio(data));
        fetchCached<any>(`credit-utilization-cache-${user.id}`, FIFTEEN_MIN, () => debtAPI.getCreditUtilization(), data => setCreditUtilization(data));
        fetchCached<any>(`dti-cache-${user.id}`, FIFTEEN_MIN, () => debtAPI.getDti(), data => setDti(data));
        fetchCached<any>(`active-loan-count-cache-${user.id}`, FIFTEEN_MIN, () => loanAPI.getAll(true), data => setActiveLoanCount((data.loans || []).length));
        fetchCached<any>(`salary-intel-cache-${user.id}`, THIRTY_MIN, () => aiAPI.salaryIntelligence(), data => { if (data?.detected) setSalaryData(data); });
```
and then delete the now-superseded originals:
```ts
        accountsAPI.getAll().then(res => setAccounts(res.data.accounts ?? res.data ?? [])).catch(() => {});
        investmentAPI.getAll().then(res => setInvestments(res.data.investments ?? [])).catch(() => {});
        analyticsAPI.getInvestmentRatio().then(res => setInvestmentRatio(res.data)).catch(() => {});
        debtAPI.getCreditUtilization().then(res => setCreditUtilization(res.data)).catch(() => {});
        debtAPI.getDti().then(res => setDti(res.data)).catch(() => {});
        loanAPI.getAll(true).then(res => setActiveLoanCount((res.data.loans || []).length)).catch(() => {});
        aiAPI.salaryIntelligence().then(res => { if (res.data?.detected) setSalaryData(res.data); }).catch(() => {});
```
Leave `opportunityAPI.getAll()...` and `briefingAPI.getLatest()...` exactly as Task 3 left them, uncached, at the end of this block.

Confirm the effect's dependency array (`[user, month, year]`) doesn't need to change — `user.id` is already a dependency via `user`, and the cache keys correctly scope by `user.id` so switching accounts (logout/login as a different user) never serves another user's cached data.

- [ ] **Step 4: Type-check and lint**

Run: `cd frontend && npx tsc --noEmit && npx eslint app/dashboard/page.tsx`
Expected: clean

- [ ] **Step 5: Run the full frontend suite**

Run: `cd frontend && npx vitest run`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/app/dashboard/page.tsx
git commit -m "perf(dashboard): cache secondary dashboard data client-side so repeat opens skip the backend"
```
with trailer:
```
Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
```

---

### Task 6: Manual verification + connection pool note

**Files:** none (verification only; no code changes in this task).

- [ ] **Step 1: Run both full test suites one final time**

Run: `cd backend && npx jest`
Run: `cd frontend && npx vitest run`
Expected: both fully green.

- [ ] **Step 2: Manual dashboard check (best effort)**

If a dev server can be started against the deployed backend (per this project's usual local-frontend-talks-to-prod-backend setup): open `/dashboard`, confirm it renders without errors, and check the Network tab (or backend logs) that `POST /api/ai/opportunities/detect` is no longer called on load — only `GET /api/ai/opportunities` should fire. Reload the page a second time within a few minutes and confirm accounts/investments/credit-utilization/DTI/salary-intelligence do NOT re-hit the network (served from `localStorage` instead).

- [ ] **Step 3: Document the connection pool finding without changing it yet**

`backend/src/db/pool.js` currently sets `max: 10`. Do NOT change this number as part of this plan — check Supabase's actual connection limit for the project's plan tier first (via the Supabase dashboard, outside this repo) before deciding whether 10 is actually the bottleneck or already close to the ceiling. Note in your final report whether this was checked and what was found; if the limit is comfortably above 10, flag it as a candidate follow-up, not something to change blindly here.

- [ ] **Step 4: Report**

Summarize: which of the two identified dead calls (if any) were found to have a consumer and thus NOT removed, the final backend/frontend test counts, and the pool-limit finding from Step 3.

---

## Self-review

- **Spec coverage:** move detection off the request path (Task 2), dedupe bank-balance/avg-expense computation (Task 1), parallelize the upsert loop (Task 1), drop the two unused calls (Task 3), cache the remaining non-critical dashboard data (Tasks 4-5) — every element of the agreed plan has a task. ✔
- **Placeholders:** none — every step has runnable code.
- **Type consistency:** `detectIdleCash(userId, plan, bankBalance, avgExpenses)`, `detectAllocationGap(userId, bankBalance)`, `detectEmergencyFundLow(userId, plan, bankBalance, avgExpenses)` — signatures match exactly between Task 1's implementation and its own tests. `saveOpportunities(userId, detected)` matches its call site in `POST /detect` (Task 1) and the new cron (Task 2). `getCached<T>(key, ttlMs)`/`setCached(key, data)` match between Task 4's implementation, its tests, and Task 5's usage.
- **Known deliberate scope decisions (not oversights):** `opportunityAPI.getAll()` and `briefingAPI.getLatest()` are deliberately left uncached (see Task 5's inline comment for why); the connection pool size is investigated, not changed, in Task 6, since changing it without knowing Supabase's actual ceiling could make things worse, not better.
- **Update after Task 5 (post-hoc, following user review):** the original plan for Task 5 accepted TTL-only expiry with no write-triggered invalidation. A final whole-branch review found this created a real regression (these keys weren't cached at all before this branch) and the user chose to add invalidation rather than accept the staleness. Task 5 was extended to wire `localStorage.removeItem(...)` for `accounts-cache-*`, `investments-cache-*`, `investment-ratio-cache-*`, `credit-utilization-cache-*`, `dti-cache-*`, and `active-loan-count-cache-*` at the relevant mutation sites (`accounts/page.tsx`, `BankAccountsSection.tsx`, `investments/page.tsx`, `debt-intelligence/page.tsx`, and — after the same final review flagged transaction entry as the most common source of staleness — `TransactionModal.tsx`/`TransactionList.tsx` for the accounts/investment-ratio/dti keys specifically). `salary-intel-cache-*` remains uninvalidated (not mutation-driven). Known remaining gap, accepted as a bounded (TTL-capped) follow-up rather than a blocker: the transfer branch of `TransactionModal.tsx`, plus `BulkOpsPanel.tsx`/`SmsImporter.tsx`/`txQueue.ts`, mutate transactions but have no cache invalidation of any kind (including the pre-existing, unrelated `dashboard-cache-*` keys) — worth a future ticket, not fixed here since it would mean inventing invalidation logic in four places that never had it, well beyond this branch's scope.
- **Update after the final whole-branch review — Task 3.5 fix:** the final review found that `detectOpportunities` legitimately returns `[]` for users with too little financial data yet, which meant the original lazy-detect gate (an existence check on the `opportunities` table) never actually "stuck" for that population — it re-ran the full detection scan on every single load, indefinitely. Fixed via a new migration (`072_users_opportunities_scanned_at.sql`) adding `users.opportunities_scanned_at`; `GET /` now gates lazy-detect on that column being `NULL` and sets it to `NOW()` after any successful `saveOpportunities` call (zero-or-more rows), while a failed attempt leaves it `NULL` so the next request retries (preserving the accepted retry-on-failure behavior from the earlier `3bb4a02` fix).
