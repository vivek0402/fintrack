# Daily Brief Plain-Language Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the Daily Brief card so it reads like a plain-language update instead of a stats dashboard: two fixed chips (Today, Heads up), a jargon-free narrative, and an action box that only shows for genuinely urgent items.

**Architecture:** Backend changes to `backend/src/routes/ai.js` — trim `rankActionCandidates()` to urgent-only candidates (bills/risk, dropping filler fallbacks), add two merged points (`today_status`, `heads_up`) to `buildDailyBriefPoints()`, and rewrite the LLM narrative prompt to ban report-style phrasing. A migration makes `action_of_the_day` nullable since the action box can now legitimately have nothing to say. Frontend change to `frontend/app/dashboard/page.tsx` replaces the current 3-primary/7-secondary/"Show more" chip structure with the two new merged points, no toggle.

**Tech Stack:** Node/Express backend, PostgreSQL, Jest for backend tests, Next.js/React frontend (TypeScript, inline styles, no component test harness for this page — verified via `tsc --noEmit` and manual browser check).

**Spec:** `docs/superpowers/specs/2026-08-14-daily-brief-plain-language-design.md`

---

### Task 1: Make `action_of_the_day` nullable

**Files:**
- Create: `backend/src/db/migrations/065_daily_briefings_action_of_the_day_nullable.sql`

**Why this is first:** Task 2 makes `rankActionCandidates()` return `null` on quiet days. The `daily_briefings.action_of_the_day` column is currently `TEXT NOT NULL` (see `042_daily_briefings.sql`) — inserting `null` would fail at the database before any application code runs. This must land before Task 2's behavior change reaches the INSERT.

- [ ] **Step 1: Create the migration file**

```sql
ALTER TABLE daily_briefings ALTER COLUMN action_of_the_day DROP NOT NULL;
```

- [ ] **Step 2: Verify it's idempotent (matches project convention — migrations re-run on every server start)**

`DROP NOT NULL` on an already-nullable column is a no-op in Postgres, so no `IF EXISTS`-style guard is needed. No manual verification command beyond reading the file — this matches the plain `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` style already used in `043_daily_briefings_updated_at.sql`.

- [ ] **Step 3: Commit**

```bash
git add backend/src/db/migrations/065_daily_briefings_action_of_the_day_nullable.sql
git commit -m "feat(db): allow daily_briefings.action_of_the_day to be null

The action box will soon only render for genuinely urgent items -- on a
quiet day there's nothing to say, and the column needs to allow that."
```

---

### Task 2: Trim `rankActionCandidates()` to urgent-only candidates

**Files:**
- Modify: `backend/src/routes/ai.js:1653-1686` (the `rankActionCandidates` function)
- Modify: `backend/src/routes/ai.js:1935-1938` (exports block — add two exports, one used by this task's test, one used by Task 3's)
- Test: `backend/tests/ai.rankActionCandidates.test.js`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/ai.rankActionCandidates.test.js`:

```javascript
process.env.JWT_SECRET = 'test-secret';
// utils/gemini.js constructs its own real Groq/Gemini clients at require time
// (separately from the mocked utils/ai.js below) and the Groq SDK throws if
// the key is missing — a dummy value is enough since nothing here calls it.
process.env.GROQ_API_KEY = 'test-groq-key';

jest.mock('../src/db/pool', () => ({
    query: jest.fn(),
    connect: jest.fn(),
}));
jest.mock('../src/utils/ai', () => ({
    aiComplete: jest.fn().mockResolvedValue('Test narrative.'),
    MODELS: {},
    nimClient: {},
}));
jest.mock('../src/utils/fcm', () => ({
    sendToUser: jest.fn(),
    userHasTokens: jest.fn().mockResolvedValue(false),
}));
jest.mock('../src/middleware/auth', () => (req, res, next) => next());

const { rankActionCandidates } = require('../src/routes/ai');

function baseData(overrides = {}) {
    return {
        bills_due_soon: { count: 0, total: 0 },
        risk_flags: [],
        top_opportunities: [],
        pace: { ideal_daily_budget: 2204, avg_daily_so_far: 1266 },
        logging_streak: 5,
        ...overrides,
    };
}

describe('rankActionCandidates', () => {
    test('returns null when nothing is urgent (no bills, no risk)', () => {
        expect(rankActionCandidates(baseData())).toBeNull();
    });

    test('does not fall back to an opportunity plug when nothing urgent exists', () => {
        const data = baseData({
            top_opportunities: [{ title: 'x', description: 'y', priority: 1, action_label: 'Do the thing' }],
        });
        expect(rankActionCandidates(data)).toBeNull();
    });

    test('does not fall back to a logging-streak nudge when nothing urgent exists', () => {
        const data = baseData({ logging_streak: 10 });
        expect(rankActionCandidates(data)).toBeNull();
    });

    test('surfaces a due bill', () => {
        const data = baseData({ bills_due_soon: { count: 1, total: 1200 } });
        expect(rankActionCandidates(data)).toBe(
            'You have 1 bill due soon — make sure funds are set aside.'
        );
    });

    test('surfaces a severe forecast warning', () => {
        const data = baseData({
            risk_flags: [{ type: 'forecast_budget_warning', over_pct: 35, description: 'Forecast says you will overspend.' }],
        });
        expect(rankActionCandidates(data)).toBe('Forecast says you will overspend.');
    });

    test('surfaces a spending spike', () => {
        const data = baseData({
            risk_flags: [{ type: 'spending_spike', pct_above: 50, description: 'Dining spend spiked this month.' }],
        });
        expect(rankActionCandidates(data)).toBe('Dining spend spiked this month.');
    });

    test('surfaces a moderate forecast warning', () => {
        const data = baseData({
            risk_flags: [{ type: 'forecast_budget_warning', over_pct: 20, description: 'Trending a bit over budget.' }],
        });
        expect(rankActionCandidates(data)).toBe('Trending a bit over budget.');
    });

    test('a due bill outranks a severe forecast warning', () => {
        const data = baseData({
            bills_due_soon: { count: 1, total: 200 },
            risk_flags: [{ type: 'forecast_budget_warning', over_pct: 35, description: 'Forecast says you will overspend.' }],
        });
        expect(rankActionCandidates(data)).toBe(
            'You have 1 bill due soon — make sure funds are set aside.'
        );
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && npx jest tests/ai.rankActionCandidates.test.js`
Expected: FAIL — `rankActionCandidates` is not exported yet, so `require('../src/routes/ai').rankActionCandidates` is `undefined` and every call throws `TypeError: rankActionCandidates is not a function`.

- [ ] **Step 3: Trim the function and export it**

Replace the current `rankActionCandidates` function body (lines 1653-1686):

```javascript
function rankActionCandidates(data) {
    const { bills_due_soon, top_opportunities, risk_flags, pace, logging_streak } = data;
    const topOpportunity = top_opportunities[0] || null;
    const severeForecast = risk_flags.find(f => f.type === 'forecast_budget_warning' && f.over_pct >= 30);
    const moderateForecast = risk_flags.find(f => f.type === 'forecast_budget_warning' && f.over_pct < 30);
    const spike = risk_flags.find(f => f.type === 'spending_spike');
    const underBudget = pace.ideal_daily_budget > 0 && pace.avg_daily_so_far <= pace.ideal_daily_budget;
    const noOtherSignal = !spike && !severeForecast && !moderateForecast && bills_due_soon.count === 0;

    const candidates = [
        bills_due_soon.count > 0 && {
            score: 90 + Math.min(bills_due_soon.total / 1000, 10),
            message: `You have ${bills_due_soon.count} bill${bills_due_soon.count !== 1 ? 's' : ''} due soon — make sure funds are set aside.`,
        },
        severeForecast && { score: 85, message: severeForecast.description },
        spike && { score: 70 + Math.min(spike.pct_above / 2, 15), message: spike.description },
        moderateForecast && { score: 65, message: moderateForecast.description },
        topOpportunity && {
            score: 40 + (topOpportunity.priority === 1 ? 20 : topOpportunity.priority === 2 ? 10 : 0),
            message: topOpportunity.action_label,
        },
        (noOtherSignal && underBudget && logging_streak > 2) && {
            score: 30,
            message: `You're pacing under budget and on a ${logging_streak}-day streak — keep it up.`,
        },
        logging_streak > 0 && {
            score: 20,
            message: `Keep your ${logging_streak}-day logging streak alive — log today's transactions!`,
        },
        { score: 0, message: "Log today's transactions to start a streak and keep your numbers accurate." },
    ].filter(Boolean);

    return candidates.reduce((best, c) => (c.score > best.score ? c : best)).message;
}
```

with:

```javascript
// Only genuinely urgent items win a slot here -- a due bill or a real risk
// flag. Opportunities and streak nudges used to fill this box on quiet days;
// now a quiet day means this returns null and the frontend renders nothing
// (daily_briefings.action_of_the_day is nullable as of migration 065).
function rankActionCandidates(data) {
    const { bills_due_soon, risk_flags } = data;
    const severeForecast = risk_flags.find(f => f.type === 'forecast_budget_warning' && f.over_pct >= 30);
    const moderateForecast = risk_flags.find(f => f.type === 'forecast_budget_warning' && f.over_pct < 30);
    const spike = risk_flags.find(f => f.type === 'spending_spike');

    const candidates = [
        bills_due_soon.count > 0 && {
            score: 90 + Math.min(bills_due_soon.total / 1000, 10),
            message: `You have ${bills_due_soon.count} bill${bills_due_soon.count !== 1 ? 's' : ''} due soon — make sure funds are set aside.`,
        },
        severeForecast && { score: 85, message: severeForecast.description },
        spike && { score: 70 + Math.min(spike.pct_above / 2, 15), message: spike.description },
        moderateForecast && { score: 65, message: moderateForecast.description },
    ].filter(Boolean);

    if (candidates.length === 0) return null;
    return candidates.reduce((best, c) => (c.score > best.score ? c : best)).message;
}
```

Then add both this task's and Task 3's exports together at the bottom of the file (lines 1935-1938):

```javascript
module.exports = router;
module.exports.generateWeeklyBriefing = generateWeeklyBriefing;
module.exports.mondayOf = mondayOf;
module.exports.generateDailyBriefing = generateDailyBriefing;
module.exports.rankActionCandidates = rankActionCandidates;
module.exports.buildDailyBriefPoints = buildDailyBriefPoints;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && npx jest tests/ai.rankActionCandidates.test.js`
Expected: PASS — 8 tests.

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/ai.js backend/tests/ai.rankActionCandidates.test.js
git commit -m "feat(ai): stop the daily-brief action box from filling with filler

Opportunities and streak nudges used to backstop the amber 'Today:' box
whenever there was no real bill or risk to flag, so it always had
something to say -- often something generic. Now it only surfaces genuine
bills and risk flags, and returns null (box doesn't render) otherwise."
```

---

### Task 3: Add `today_status` and `heads_up` merged points

**Files:**
- Modify: `backend/src/routes/ai.js:1544-1645` (the `buildDailyBriefPoints` function — append two points to the returned array)
- Test: `backend/tests/ai.buildDailyBriefPoints.test.js`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/ai.buildDailyBriefPoints.test.js`:

```javascript
process.env.JWT_SECRET = 'test-secret';
// utils/gemini.js constructs its own real Groq/Gemini clients at require time
// (separately from the mocked utils/ai.js below) and the Groq SDK throws if
// the key is missing — a dummy value is enough since nothing here calls it.
process.env.GROQ_API_KEY = 'test-groq-key';

jest.mock('../src/db/pool', () => ({
    query: jest.fn(),
    connect: jest.fn(),
}));
jest.mock('../src/utils/ai', () => ({
    aiComplete: jest.fn().mockResolvedValue('Test narrative.'),
    MODELS: {},
    nimClient: {},
}));
jest.mock('../src/utils/fcm', () => ({
    sendToUser: jest.fn(),
    userHasTokens: jest.fn().mockResolvedValue(false),
}));
jest.mock('../src/middleware/auth', () => (req, res, next) => next());

const { buildDailyBriefPoints } = require('../src/routes/ai');

function baseData(overrides = {}) {
    return {
        yesterday: { total: 0, count: 0, top_category: null },
        today_so_far: { total: 0, count: 0 },
        bills_due_soon: { count: 0, total: 0 },
        pace: { ideal_daily_budget: 2204, avg_daily_so_far: 1266 },
        logging_streak: 0,
        top_opportunities: [],
        comparisons: {
            vs_same_weekday_last_week: { current: 0, previous: 0, delta: 0 },
            week_to_date_vs_prior_week: { current: 0, previous: 0, delta: 0, days_elapsed: 1 },
            month_to_date_vs_trailing_avg: null,
        },
        risk_flags: [],
        ...overrides,
    };
}

function findPoint(points, key) {
    return points.find(p => p.key === key);
}

describe('buildDailyBriefPoints — heads_up', () => {
    test('reads "Nothing urgent" when there are no bills or risk flags', () => {
        const headsUp = findPoint(buildDailyBriefPoints(baseData()), 'heads_up');
        expect(headsUp.label).toBe('Heads up');
        expect(headsUp.value).toBe('Nothing urgent');
        expect(headsUp.insight).toBe('No spending or budget risks detected right now');
    });

    test('a due bill wins over a risk flag', () => {
        const data = baseData({
            bills_due_soon: { count: 2, total: 5000 },
            risk_flags: [{ type: 'spending_spike', title: 'Dining spend spiked', description: 'Dining is up this month.' }],
        });
        const headsUp = findPoint(buildDailyBriefPoints(data), 'heads_up');
        expect(headsUp.value).toBe('2 bills due (₹5,000)');
        expect(headsUp.insight).toBe('2 bills due in the next 2 days');
    });

    test('a risk flag surfaces when there is no due bill', () => {
        const data = baseData({
            risk_flags: [{ type: 'spending_spike', title: 'Dining spend is 40% above your 3-month average', description: 'Last month you spent more on dining.' }],
        });
        const headsUp = findPoint(buildDailyBriefPoints(data), 'heads_up');
        expect(headsUp.value).toBe('Dining spend is 40% above your 3-month average');
        expect(headsUp.insight).toBe('Last month you spent more on dining.');
    });
});

describe('buildDailyBriefPoints — today_status', () => {
    test('reads "left today" when running under budget', () => {
        const todayStatus = findPoint(buildDailyBriefPoints(baseData()), 'today_status');
        expect(todayStatus.label).toBe('Today');
        expect(todayStatus.value).toBe('₹938 left today');
        expect(todayStatus.insight).toBe('Running ₹938 under your ₹2,204/day budget');
    });

    test('reads "over today" when running over budget', () => {
        const data = baseData({ pace: { ideal_daily_budget: 1000, avg_daily_so_far: 1500 } });
        const todayStatus = findPoint(buildDailyBriefPoints(data), 'today_status');
        expect(todayStatus.value).toBe('₹500 over today');
        expect(todayStatus.insight).toBe('Running ₹500 over your ₹1,000/day budget');
    });

    test('prompts for income when there is no ideal daily budget yet', () => {
        const data = baseData({ pace: { ideal_daily_budget: 0, avg_daily_so_far: 0 } });
        const todayStatus = findPoint(buildDailyBriefPoints(data), 'today_status');
        expect(todayStatus.value).toBe('Add income to see your daily budget');
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && npx jest tests/ai.buildDailyBriefPoints.test.js`
Expected: FAIL — `findPoint(..., 'heads_up')` and `findPoint(..., 'today_status')` return `undefined` since neither point exists yet, so every assertion throws `TypeError: Cannot read properties of undefined`.

- [ ] **Step 3: Add the two points**

In `buildDailyBriefPoints`, the returned `points` array currently ends with the `opportunity` point (around line 1641, just before the closing `];`):

```javascript
        {
            key: 'opportunity',
            label: 'Top Opportunity',
            value: topOpportunity ? topOpportunity.title : 'All caught up',
            insight: topOpportunity
                ? topOpportunity.description + (top_opportunities.length > 1 ? ` (+${top_opportunities.length - 1} more)` : '')
                : "No new opportunities right now — keep it up!",
            raw: top_opportunities,
        },
    ];

    return points;
```

Add two entries immediately before the closing `];`:

```javascript
        {
            key: 'opportunity',
            label: 'Top Opportunity',
            value: topOpportunity ? topOpportunity.title : 'All caught up',
            insight: topOpportunity
                ? topOpportunity.description + (top_opportunities.length > 1 ? ` (+${top_opportunities.length - 1} more)` : '')
                : "No new opportunities right now — keep it up!",
            raw: top_opportunities,
        },
        // The two points below are what the frontend actually renders as chips
        // (see dashboard/page.tsx) -- the ten points above stay purely as
        // narrative-prompt input. Reuses paceDirection/paceDelta/topRisk already
        // computed earlier in this function; no new calculation.
        {
            key: 'today_status',
            label: 'Today',
            value: paceDirection === null
                ? 'Add income to see your daily budget'
                : paceDirection === 'under'
                    ? `${inr(Math.abs(paceDelta))} left today`
                    : `${inr(Math.abs(paceDelta))} over today`,
            insight: paceDirection === null
                ? 'Add your income to see your ideal daily budget'
                : paceDirection === 'under'
                    ? `Running ${inr(Math.abs(paceDelta))} under your ${inr(pace.ideal_daily_budget)}/day budget`
                    : `Running ${inr(Math.abs(paceDelta))} over your ${inr(pace.ideal_daily_budget)}/day budget`,
        },
        {
            key: 'heads_up',
            label: 'Heads up',
            // Bills win over risk flags -- a due bill is a concrete near-term
            // obligation, a risk flag is a pattern observation. Only one shows
            // at a time so this stays a single glanceable chip.
            value: bills_due_soon.count > 0
                ? `${bills_due_soon.count} bill${bills_due_soon.count !== 1 ? 's' : ''} due (${inr(bills_due_soon.total)})`
                : topRisk ? topRisk.title : 'Nothing urgent',
            insight: bills_due_soon.count > 0
                ? `${bills_due_soon.count} bill${bills_due_soon.count !== 1 ? 's' : ''} due in the next 2 days`
                : topRisk ? topRisk.description : 'No spending or budget risks detected right now',
        },
    ];

    return points;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && npx jest tests/ai.buildDailyBriefPoints.test.js`
Expected: PASS — 6 tests.

- [ ] **Step 5: Run the full backend suite to catch regressions in the existing daily-brief route tests**

Run: `cd backend && npx jest tests/ai.dailyBriefing.routes.test.js tests/ai.rankActionCandidates.test.js tests/ai.buildDailyBriefPoints.test.js`
Expected: PASS — all suites green. (The route test's cache-skip test in particular exercises the full `buildDailyBriefPoints` → `points` JSON round trip; it should be unaffected since it only checks that identical inputs produce identical points, not the specific point keys.)

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/ai.js backend/tests/ai.buildDailyBriefPoints.test.js
git commit -m "feat(ai): add plain-language today_status and heads_up brief points

These are what the frontend will render as the Daily Brief's two anchor
chips -- 'X left today' / 'X over today' instead of 'Pace Check:
X/day', and a single merged bills-or-risk slot instead of two separate
chips. The existing ten points are unchanged and keep feeding the
narrative prompt."
```

---

### Task 4: Rewrite the narrative prompt for plain language

**Files:**
- Modify: `backend/src/routes/ai.js:1727-1743` (the `prompt` template literal inside `generateDailyBriefing`)

There's no automated test for prompt wording — LLM output isn't deterministic, and the spec explicitly calls this a "prompt-quality check, not something a unit test can assert reliably." This task is implement-and-manually-verify, not TDD.

- [ ] **Step 1: Replace the prompt**

Current (lines 1727-1743):

```javascript
        const prompt = `You are a friendly financial advisor writing a very short daily briefing for an Indian personal finance app user.
Based on the sections below, write a warm, encouraging 2-3 sentence narrative about their day.
Weave together at most one TRENDS item and one WATCH FOR item into a single connected observation -- do not enumerate every input.
If WATCH FOR is empty, find something in TRENDS to praise instead of inventing a problem.
Be specific and reference the numbers naturally. No markdown, no headings, no bullet points in your reply — just plain prose.
Do not mention logging streaks, habits, or consistency — focus only on the spending, bill, and trend data below.
Keep it to ${NARRATIVE_WORD_LIMIT} words or fewer.

TODAY'S NUMBERS:
${numberLines}

TRENDS:
${trendLines}
${watchLines ? `\nWATCH FOR:\n${watchLines}` : ''}
${opportunityLine ? `\nOPPORTUNITY:\n${opportunityLine}` : ''}

Reminder: keep your reply to ${NARRATIVE_WORD_LIMIT} words or fewer.`;
```

Replace with:

```javascript
        const prompt = `You are texting a friend a quick, warm update about their spending today -- not writing a financial report.
Based on the sections below, write 2-3 short sentences about their day.
Weave together at most one TRENDS item and one WATCH FOR item into a single connected observation -- do not enumerate every input.
If WATCH FOR is empty, find something in TRENDS to praise instead of inventing a problem.

Plain-language rules -- follow these strictly:
- At most ONE number per sentence. If a sentence would need two numbers, cut it to the one that matters most.
- Never use "%", "vs.", "trailing average", or "N-month average" -- say "more than usual" or "your usual rent" instead of the exact percentage.
- Never use analyst phrasing: no "echoing", no "same N-day stretch", no semicolons, no clause-stacking.
- Round rupee amounts to whole numbers in prose (₹938, not ₹938.00).
- Write like you're telling a friend, not summarizing a dashboard.

No markdown, no headings, no bullet points in your reply — just plain prose.
Do not mention logging streaks, habits, or consistency — focus only on the spending, bill, and trend data below.
Keep it to ${NARRATIVE_WORD_LIMIT} words or fewer.

TODAY'S NUMBERS:
${numberLines}

TRENDS:
${trendLines}
${watchLines ? `\nWATCH FOR:\n${watchLines}` : ''}
${opportunityLine ? `\nOPPORTUNITY:\n${opportunityLine}` : ''}

Reminder: keep your reply to ${NARRATIVE_WORD_LIMIT} words or fewer, at most one number per sentence, no percentages.`;
```

- [ ] **Step 2: Run the existing daily-brief route tests to confirm nothing broke mechanically**

Run: `cd backend && npx jest tests/ai.dailyBriefing.routes.test.js`
Expected: PASS. These tests mock `aiComplete` entirely (it never sees the real prompt), so this only confirms the file still parses and the surrounding code path is intact — not the prompt's actual output quality.

- [ ] **Step 3: Commit**

```bash
git add backend/src/routes/ai.js
git commit -m "feat(ai): ban report-style phrasing from the daily-brief narrative

Previous prompt asked for 'warm, encouraging' tone but didn't forbid
percentage-stacking or analyst phrasing ('trailing average', 'echoing',
'same five-day stretch'), so the model defaulted to dashboard-speak
anyway. Now explicit: one number per sentence, no %, no jargon."
```

- [ ] **Step 4 (manual, after deploying/running locally): spot-check real output**

Not a scripted step — after this branch is deployed or run locally with a real `GROQ_API_KEY`, trigger a few daily-brief regenerations (`POST /api/ai/briefing/daily/generate`) for accounts with different spending shapes (quiet day, bill due, risk flag active) and read the narratives. Confirm: no "%", no "vs.", no "trailing average", one number per sentence, reads like a text from a friend. If any generation violates this, tighten the prompt further — this is a judgment call, not a pass/fail script.

---

### Task 5: Frontend — two fixed chips, no toggle

**Files:**
- Modify: `frontend/app/dashboard/page.tsx:204` (remove the `dailyBriefPointsExpanded` state)
- Modify: `frontend/app/dashboard/page.tsx:551-599` (replace the primary/secondary/toggle chip block)

No component test harness exists for this page (confirmed: no `*.test.tsx` files reference `dashboard/page.tsx`). Verification is `tsc --noEmit` plus a manual browser check, matching how the prior chip-collapsing change in this file was verified.

- [ ] **Step 1: Remove the now-unused expand/collapse state**

Delete this line (currently line 204):

```typescript
    const [dailyBriefPointsExpanded, setDailyBriefPointsExpanded] = useState(false);
```

- [ ] **Step 2: Replace the chip-rendering block**

Current block (lines 551-599):

```tsx
                    {Array.isArray(dailyBrief.points) && dailyBrief.points.length > 0 && (() => {
                        // Only Pace Check, Bills Due Soon, and Watch For are actionable
                        // at a glance -- the rest (yesterday/today totals, week-over-week
                        // comparisons, streak, opportunity) restate what the narrative and
                        // action-of-the-day already say, so they're tucked behind "Show more"
                        // to cut chip-wall overload on open.
                        const primaryKeys = ['pace', 'bills', 'risk'];
                        const primaryPoints = dailyBrief.points.filter((pt: any) => primaryKeys.includes(pt.key));
                        const secondaryPoints = dailyBrief.points.filter((pt: any) => !primaryKeys.includes(pt.key));

                        const renderPoint = (pt: any) => {
                            // Spend comparisons: less spend than the baseline is the good
                            // outcome (--color-inc, trending down), more spend is the bad
                            // outcome (--color-exp, trending up) -- inverted from a naive
                            // "up = green" reading, per DESIGN.md's income/expense rule.
                            const hasTrend = pt.trend && pt.trend.pct !== null && pt.trend.pct !== undefined;
                            const trendColor = hasTrend
                                ? (pt.trend.direction === 'down' ? 'var(--color-inc)' : 'var(--color-exp)')
                                : undefined;
                            const TrendIcon = pt.trend?.direction === 'down' ? TrendingDown : TrendingUp;
                            return (
                                <div key={pt.key} style={{ padding: '6px 12px', borderRadius: '20px', background: 'var(--bg-surface-2)', border: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>{pt.label}: </span>
                                    <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{pt.value}</span>
                                    {hasTrend && (
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', color: trendColor, marginLeft: '2px' }}>
                                            <TrendIcon size={10} />
                                            <span style={{ fontSize: '10px', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>{Math.abs(pt.trend.pct)}%</span>
                                        </span>
                                    )}
                                </div>
                            );
                        };

                        return (
                            <div style={{ marginBottom: '14px' }}>
                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                    {primaryPoints.map(renderPoint)}
                                    {dailyBriefPointsExpanded && secondaryPoints.map(renderPoint)}
                                </div>
                                {secondaryPoints.length > 0 && (
                                    <button type="button" onClick={() => setDailyBriefPointsExpanded(v => !v)}
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', color: 'var(--accent)', fontWeight: 600, padding: 0, marginTop: '10px', fontFamily: 'var(--font-body)' }}>
                                        {dailyBriefPointsExpanded ? 'Show less' : `Show ${secondaryPoints.length} more`}
                                    </button>
                                )}
                            </div>
                        );
                    })()}
```

Replace with:

```tsx
                    {Array.isArray(dailyBrief.points) && (() => {
                        // Daily Brief now shows exactly two chips -- Today (budget
                        // status) and Heads up (bills/risk merged) -- computed
                        // server-side in buildDailyBriefPoints(). The other eight
                        // points still exist in dailyBrief.points (they feed the
                        // narrative prompt) but are no longer rendered here at all.
                        const chips = ['today_status', 'heads_up']
                            .map(key => dailyBrief.points.find((pt: any) => pt.key === key))
                            .filter(Boolean);

                        if (chips.length === 0) return null;

                        return (
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '14px' }}>
                                {chips.map((pt: any) => (
                                    <div key={pt.key} style={{ padding: '6px 12px', borderRadius: '20px', background: 'var(--bg-surface-2)', border: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>{pt.label}: </span>
                                        <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{pt.value}</span>
                                    </div>
                                ))}
                            </div>
                        );
                    })()}
```

- [ ] **Step 3: Type-check**

Run: `cd frontend && npx tsc --noEmit -p .`
Expected: no output (clean pass) — matches the check already run for the prior chip-collapsing change on this file.

- [ ] **Step 4: Commit**

```bash
git add frontend/app/dashboard/page.tsx
git commit -m "feat(dashboard): collapse Daily Brief to two plain-language chips

Replaces the 3-primary/7-secondary/'Show more' chip structure (added in
3cd4f45) with exactly two server-computed chips -- Today and Heads up.
That structure solved the old 10-chip overload; it's no longer needed
once the other eight points are simply not rendered instead of hidden."
```

---

### Task 6: Manual end-to-end verification

Not a coded task — closes the loop on the two things the automated tests above can't cover: LLM output quality (Task 4) and actual rendered appearance (Task 5).

- [ ] **Step 1: Start the backend and frontend dev servers, or use a deployed environment with real data**

- [ ] **Step 2: Trigger a Daily Brief regeneration for a real account** (`POST /api/ai/briefing/daily/generate`, or the in-app refresh button) and confirm:
  - Narrative reads as plain language: no "%", no "trailing average", no "vs.", at most one number per sentence
  - Exactly two chips render: "Today: ..." and "Heads up: ..."
  - No "Show more" toggle is present anywhere on the card

- [ ] **Step 3: Confirm the action box behavior**
  - For an account with a bill due soon or an active risk flag: amber "Today:" box renders with that specific message
  - For a quiet account (no bills, no risk flags): amber box does not render at all — no generic filler

- [ ] **Step 4: Confirm nothing crashed on the nullable column**
  - Check server logs for the quiet-account case in Step 3 — no Postgres `null value in column "action_of_the_day" violates not-null constraint` error
