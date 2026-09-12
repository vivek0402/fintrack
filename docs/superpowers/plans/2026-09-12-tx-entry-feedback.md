# In-the-Moment Entry Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** While a transaction is being typed, show one quiet contextual line (max two: one warning + one info) under the Amount field — duplicate/anomaly warnings, credit-card headroom, budget pace, account balance projection, goal impact, pace vs last month, late-night pattern, and a split hint.

**Architecture:** `backend/src/utils/txEntrySignals.js` holds one small async detector per signal plus `collectEntrySignals()` that runs them in parallel and sorts by a fixed priority. `GET /api/transactions/context` validates query params and returns `{ signals: [{ kind, level, text, action? }] }`. The modal debounces the call (400 ms) on every relevant field change and renders the result through a new `EntryFeedback` component. Everything is deterministic SQL — no LLM.

**Tech Stack:** Node/Express 5, pg, Jest + supertest (backend); Next.js 16, React 19, Vitest + Testing Library (frontend). No new dependencies.

**Coding rules that apply (from CLAUDE.md / DESIGN.md / memory):** inline styles only in JSX, CSS-variable colors (`--color-warn` for warnings, `--text-muted` for captions, 12px `sm` scale), parameterized SQL, currency via `Math.round(n).toLocaleString('en-IN')`, no emojis in new code.

---

## File structure

| File | Responsibility |
|---|---|
| `backend/src/utils/txEntrySignals.js` | Detectors + `collectEntrySignals` + text formatting helpers |
| `backend/src/routes/transactions.js` | `GET /context` — parse/validate query, call collector |
| `backend/tests/txEntrySignals.test.js` | Unit tests per detector with a mocked pool |
| `backend/tests/transactions.routes.test.js` | Route test for `/context` |
| `frontend/lib/api.ts` | `transactionsAPI.entryContext` |
| `frontend/components/transactions/EntryFeedback.tsx` | Renders up to one warn + one info line |
| `frontend/components/transactions/EntryFeedback.test.tsx` | Component tests |
| `frontend/components/transactions/TransactionModal.tsx` | Debounced fetch + render under Amount |
| `frontend/components/transactions/TransactionModal.test.tsx` | Mock `entryContext`; one integration test |

Signal contract (used by every task):

```ts
{ kind: string; level: 'warn' | 'info'; text: string; action?: 'split' }
```

Priority order (first wins within its level): `duplicate`, `anomaly`, `card_over_limit`, `account_negative`, `budget_over`, `card_headroom`, `budget_pace`, `account_projection`, `goal_impact`, `month_pace`, `split_hint`, `late_night`.

---

### Task 1: Helpers + duplicate and anomaly detectors

**Files:**
- Create: `backend/src/utils/txEntrySignals.js`
- Test: `backend/tests/txEntrySignals.test.js`

- [ ] **Step 1: Write the failing tests**

```js
const { inr, ordinal, istTimeLabel, detectDuplicate, detectAnomaly } = require('../src/utils/txEntrySignals');

const pool = () => ({ query: jest.fn() });

describe('helpers', () => {
    test('inr formats rounded Indian-grouped currency with sign', () => {
        expect(inr(1234567.6)).toBe('₹12,34,568');
        expect(inr(-450)).toBe('-₹450');
    });
    test('ordinal', () => {
        expect(ordinal(1)).toBe('1st'); expect(ordinal(2)).toBe('2nd'); expect(ordinal(3)).toBe('3rd');
        expect(ordinal(4)).toBe('4th'); expect(ordinal(11)).toBe('11th'); expect(ordinal(22)).toBe('22nd');
    });
    test('istTimeLabel converts UTC to a 12-hour IST label', () => {
        expect(istTimeLabel('2026-09-12T07:44:00Z')).toBe('1:14 pm');
        expect(istTimeLabel('2026-09-12T18:30:00Z')).toBe('12:00 am');
    });
});

describe('detectDuplicate', () => {
    test('warns when the same amount+description exists on that date', async () => {
        const p = pool();
        p.query.mockResolvedValueOnce({ rows: [{ created_at: '2026-09-12T07:44:00Z' }] });
        const s = await detectDuplicate(p, 'u1', { amount: 450, description: 'Swiggy', date: '2026-09-12', exclude_id: null });
        expect(s).toEqual({ kind: 'duplicate', level: 'warn', text: 'Looks like you already added ₹450 for "Swiggy" on this date (1:14 pm).' });
        expect(p.query.mock.calls[0][1]).toEqual(['u1', 450, 'Swiggy', '2026-09-12', null]);
    });
    test('returns null without a match or without a description', async () => {
        const p = pool();
        p.query.mockResolvedValueOnce({ rows: [] });
        expect(await detectDuplicate(p, 'u1', { amount: 450, description: 'Swiggy', date: '2026-09-12' })).toBeNull();
        expect(await detectDuplicate(p, 'u1', { amount: 450, description: '  ', date: '2026-09-12' })).toBeNull();
        expect(p.query).toHaveBeenCalledTimes(1);
    });
});

describe('detectAnomaly', () => {
    test('warns when amount is 3x the description median (n>=3)', async () => {
        const p = pool();
        p.query.mockResolvedValueOnce({ rows: [{ n: 4, median: '450' }] });
        const s = await detectAnomaly(p, 'u1', { type: 'expense', amount: 4500, description: 'Swiggy', category_id: 'c1' });
        expect(s.kind).toBe('anomaly');
        expect(s.text).toBe('Higher than your usual ₹450 for "Swiggy" — double-check the amount?');
    });
    test('stays quiet when the description has history but amount is normal', async () => {
        const p = pool();
        p.query.mockResolvedValueOnce({ rows: [{ n: 4, median: '450' }] });
        expect(await detectAnomaly(p, 'u1', { type: 'expense', amount: 500, description: 'Swiggy', category_id: 'c1' })).toBeNull();
        expect(p.query).toHaveBeenCalledTimes(1);
    });
    test('falls back to the category median (n>=5) when the description is new', async () => {
        const p = pool();
        p.query
            .mockResolvedValueOnce({ rows: [{ n: 1, median: '300' }] })
            .mockResolvedValueOnce({ rows: [{ name: 'Food & Dining', n: 12, median: '400' }] });
        const s = await detectAnomaly(p, 'u1', { type: 'expense', amount: 2000, description: 'New place', category_id: 'c1' });
        expect(s.text).toBe('About 5× your typical Food & Dining entry (₹400).');
    });
    test('ignores income', async () => {
        const p = pool();
        expect(await detectAnomaly(p, 'u1', { type: 'income', amount: 99999, description: 'Bonus' })).toBeNull();
        expect(p.query).not.toHaveBeenCalled();
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx jest tests/txEntrySignals.test.js`
Expected: FAIL — `Cannot find module '../src/utils/txEntrySignals'`

- [ ] **Step 3: Implement**

```js
// Deterministic "as you type" signals for the Add Transaction modal. Each
// detector takes (pool, userId, input) and resolves to a signal or null;
// collectEntrySignals runs them all and orders by PRIORITY.
const { nonSpendingExclusionSQL } = require('./savingsRate');
const { fetchCreditCardWithBalance } = require('./creditCardBalance');

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 86400000;

const PRIORITY = [
    'duplicate', 'anomaly', 'card_over_limit', 'account_negative', 'budget_over',
    'card_headroom', 'budget_pace', 'account_projection', 'goal_impact', 'month_pace',
    'split_hint', 'late_night',
];

function inr(n) {
    const rounded = Math.round(Math.abs(n));
    return `${n < 0 ? '-' : ''}₹${rounded.toLocaleString('en-IN')}`;
}

function ordinal(d) {
    const v = d % 100;
    if (v >= 11 && v <= 13) return `${d}th`;
    return `${d}${['th', 'st', 'nd', 'rd'][d % 10] || 'th'}`;
}

function istTimeLabel(ts) {
    const d = new Date(new Date(ts).getTime() + IST_OFFSET_MS);
    let h = d.getUTCHours();
    const m = d.getUTCMinutes();
    const ampm = h >= 12 ? 'pm' : 'am';
    h = h % 12 || 12;
    return `${h}:${String(m).padStart(2, '0')} ${ampm}`;
}

async function detectDuplicate(pool, userId, { amount, description, date, exclude_id }) {
    const desc = (description || '').trim();
    if (!desc) return null;
    const { rows } = await pool.query(
        `SELECT created_at FROM transactions
         WHERE user_id = $1 AND amount = $2 AND LOWER(description) = LOWER($3) AND date = $4
           AND ($5::uuid IS NULL OR id <> $5)
         ORDER BY created_at DESC LIMIT 1`,
        [userId, amount, desc, date, exclude_id || null]
    );
    if (!rows.length) return null;
    return {
        kind: 'duplicate', level: 'warn',
        text: `Looks like you already added ${inr(amount)} for "${desc}" on this date (${istTimeLabel(rows[0].created_at)}).`,
    };
}

async function detectAnomaly(pool, userId, { type, amount, description, category_id, exclude_id }) {
    if (type !== 'expense') return null;
    const desc = (description || '').trim();
    if (desc) {
        const { rows } = await pool.query(
            `SELECT COUNT(*)::int AS n, percentile_cont(0.5) WITHIN GROUP (ORDER BY amount) AS median
             FROM transactions
             WHERE user_id = $1 AND type = 'expense' AND LOWER(description) = LOWER($2)
               AND ($3::uuid IS NULL OR id <> $3)`,
            [userId, desc, exclude_id || null]
        );
        const n = rows[0]?.n || 0;
        const median = parseFloat(rows[0]?.median);
        if (n >= 3) {
            if (amount >= 3 * median) {
                return { kind: 'anomaly', level: 'warn', text: `Higher than your usual ${inr(median)} for "${desc}" — double-check the amount?` };
            }
            return null;
        }
    }
    if (!category_id) return null;
    const { rows } = await pool.query(
        `SELECT c.name, COUNT(t.id)::int AS n, percentile_cont(0.5) WITHIN GROUP (ORDER BY t.amount) AS median
         FROM categories c
         LEFT JOIN transactions t ON t.category_id = c.id AND t.user_id = $1 AND t.type = 'expense'
           AND ($3::uuid IS NULL OR t.id <> $3)
         WHERE c.id = $2
         GROUP BY c.name`,
        [userId, category_id, exclude_id || null]
    );
    if (!rows.length || rows[0].n < 5) return null;
    const median = parseFloat(rows[0].median);
    if (amount < 3 * median) return null;
    return { kind: 'anomaly', level: 'warn', text: `About ${Math.round(amount / median)}× your typical ${rows[0].name} entry (${inr(median)}).` };
}

module.exports = { PRIORITY, inr, ordinal, istTimeLabel, detectDuplicate, detectAnomaly };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npx jest tests/txEntrySignals.test.js`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/utils/txEntrySignals.js backend/tests/txEntrySignals.test.js
git commit -m "feat(entry-signals): duplicate and anomaly detectors"
```

---

### Task 2: Card headroom, budget/month pace, account projection

**Files:**
- Modify: `backend/src/utils/txEntrySignals.js`
- Test: `backend/tests/txEntrySignals.test.js`

- [ ] **Step 1: Append failing tests**

```js
const { detectCard, detectCategoryPace, detectAccountProjection } = require('../src/utils/txEntrySignals');

describe('detectCard', () => {
    const card = { bank_name: 'HDFC', card_name: 'Regalia', credit_limit: '100000', current_outstanding_balance: '80000', billing_date: 18 };
    test('shows headroom and days to statement close', async () => {
        const p = pool();
        p.query.mockResolvedValueOnce({ rows: [card] });
        const s = await detectCard(p, 'u1', { type: 'expense', amount: 1600, payment_method: 'Credit Card', credit_card_id: 3, date: '2026-09-12' });
        expect(s).toEqual({ kind: 'card_headroom', level: 'info', text: '₹18,400 left on HDFC Regalia after this · statement closes in 6 days.' });
    });
    test('warns when the charge exceeds the limit', async () => {
        const p = pool();
        p.query.mockResolvedValueOnce({ rows: [card] });
        const s = await detectCard(p, 'u1', { type: 'expense', amount: 25000, payment_method: 'Credit Card', credit_card_id: 3, date: '2026-09-12' });
        expect(s).toEqual({ kind: 'card_over_limit', level: 'warn', text: 'This takes HDFC Regalia ₹5,000 over its ₹1,00,000 limit.' });
    });
    test('rolls the close date into next month when billing_date already passed', async () => {
        const p = pool();
        p.query.mockResolvedValueOnce({ rows: [{ ...card, billing_date: 5 }] });
        const s = await detectCard(p, 'u1', { type: 'expense', amount: 100, payment_method: 'Credit Card', credit_card_id: 3, date: '2026-09-12' });
        expect(s.text).toMatch(/statement closes in 23 days/);
    });
    test('skips when not a card payment or no card chosen', async () => {
        const p = pool();
        expect(await detectCard(p, 'u1', { type: 'expense', amount: 100, payment_method: 'UPI', credit_card_id: 3, date: '2026-09-12' })).toBeNull();
        expect(await detectCard(p, 'u1', { type: 'expense', amount: 100, payment_method: 'Credit Card', credit_card_id: null, date: '2026-09-12' })).toBeNull();
        expect(p.query).not.toHaveBeenCalled();
    });
});

describe('detectCategoryPace', () => {
    test('reports budget pace when under budget', async () => {
        const p = pool();
        p.query.mockResolvedValueOnce({ rows: [{ name: 'Dining', budget: '8000', spent: '5800' }] });
        const s = await detectCategoryPace(p, 'u1', { type: 'expense', amount: 400, category_id: 'c1', date: '2026-09-12' });
        expect(s).toEqual({ kind: 'budget_pace', level: 'info', text: '₹6,200 of ₹8,000 Dining budget after this (78%).' });
        expect(p.query.mock.calls[0][1]).toEqual(['u1', 9, 2026, '2026-09', null, 'c1']);
    });
    test('warns when this entry pushes the category over budget', async () => {
        const p = pool();
        p.query.mockResolvedValueOnce({ rows: [{ name: 'Dining', budget: '8000', spent: '7800' }] });
        const s = await detectCategoryPace(p, 'u1', { type: 'expense', amount: 400, category_id: 'c1', date: '2026-09-12' });
        expect(s).toEqual({ kind: 'budget_over', level: 'warn', text: 'Puts Dining ₹200 over its ₹8,000 budget this month.' });
    });
    test('compares with the same day last month when there is no budget', async () => {
        const p = pool();
        p.query
            .mockResolvedValueOnce({ rows: [{ name: 'Dining', budget: null, spent: '5800' }] })
            .mockResolvedValueOnce({ rows: [{ total: '4100' }] });
        const s = await detectCategoryPace(p, 'u1', { type: 'expense', amount: 400, category_id: 'c1', date: '2026-09-12' });
        expect(s).toEqual({ kind: 'month_pace', level: 'info', text: 'Dining: ₹6,200 by the 12th vs ₹4,100 at this point last month.' });
        expect(p.query.mock.calls[1][1]).toEqual(['u1', 'c1', '2026-08-01', '2026-08-12']);
    });
    test('clamps the comparison day to the shorter previous month', async () => {
        const p = pool();
        p.query
            .mockResolvedValueOnce({ rows: [{ name: 'Dining', budget: null, spent: '100' }] })
            .mockResolvedValueOnce({ rows: [{ total: '900' }] });
        await detectCategoryPace(p, 'u1', { type: 'expense', amount: 1, category_id: 'c1', date: '2026-03-31' });
        expect(p.query.mock.calls[1][1]).toEqual(['u1', 'c1', '2026-02-01', '2026-02-28']);
    });
    test('stays quiet when last month is too small to compare', async () => {
        const p = pool();
        p.query
            .mockResolvedValueOnce({ rows: [{ name: 'Dining', budget: null, spent: '100' }] })
            .mockResolvedValueOnce({ rows: [{ total: '120' }] });
        expect(await detectCategoryPace(p, 'u1', { type: 'expense', amount: 1, category_id: 'c1', date: '2026-09-12' })).toBeNull();
    });
});

describe('detectAccountProjection', () => {
    test('projects the balance and upcoming bills', async () => {
        const p = pool();
        p.query
            .mockResolvedValueOnce({ rows: [{ name: 'HDFC', current_balance: '42500' }] })
            .mockResolvedValueOnce({ rows: [{ n: 3, total: '12300' }] });
        const s = await detectAccountProjection(p, 'u1', { type: 'expense', amount: 400, payment_method: 'UPI', account_id: 1, date: '2026-09-12' });
        expect(s).toEqual({ kind: 'account_projection', level: 'info', text: 'HDFC after this: ₹42,100 · 3 bills (₹12,300) due in the next 30 days.' });
    });
    test('warns when the account would go negative', async () => {
        const p = pool();
        p.query
            .mockResolvedValueOnce({ rows: [{ name: 'HDFC', current_balance: '300' }] })
            .mockResolvedValueOnce({ rows: [{ n: 0, total: '0' }] });
        const s = await detectAccountProjection(p, 'u1', { type: 'expense', amount: 400, payment_method: 'UPI', account_id: 1, date: '2026-09-12' });
        expect(s).toEqual({ kind: 'account_negative', level: 'warn', text: 'HDFC would go to -₹100 after this.' });
    });
    test('skips card payments and income', async () => {
        const p = pool();
        expect(await detectAccountProjection(p, 'u1', { type: 'expense', amount: 1, payment_method: 'Credit Card', account_id: 1, date: '2026-09-12' })).toBeNull();
        expect(await detectAccountProjection(p, 'u1', { type: 'income', amount: 1, payment_method: 'UPI', account_id: 1, date: '2026-09-12' })).toBeNull();
        expect(p.query).not.toHaveBeenCalled();
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx jest tests/txEntrySignals.test.js`
Expected: FAIL — `detectCard is not a function`

- [ ] **Step 3: Implement the three detectors**

Add before `module.exports` in `txEntrySignals.js`, then update the export:

```js
function localDate(dateStr) {
    return new Date(`${String(dateStr).slice(0, 10)}T00:00:00`);
}

function ymd(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function detectCard(pool, userId, { type, amount, payment_method, credit_card_id, date }) {
    if (type !== 'expense' || payment_method !== 'Credit Card' || !credit_card_id) return null;
    const card = await fetchCreditCardWithBalance(pool, userId, credit_card_id);
    if (!card) return null;
    const limit = parseFloat(card.credit_limit || 0);
    if (limit <= 0) return null;
    const outstanding = parseFloat(card.current_outstanding_balance || 0);
    const headroom = limit - outstanding - amount;
    const label = `${card.bank_name} ${card.card_name}`;
    if (headroom < 0) {
        return { kind: 'card_over_limit', level: 'warn', text: `This takes ${label} ${inr(-headroom)} over its ${inr(limit)} limit.` };
    }
    let cycle = '';
    if (card.billing_date) {
        const today = localDate(date);
        let close = new Date(today.getFullYear(), today.getMonth(), card.billing_date);
        if (close < today) close = new Date(today.getFullYear(), today.getMonth() + 1, card.billing_date);
        const days = Math.round((close - today) / DAY_MS);
        cycle = ` · statement closes ${days === 0 ? 'today' : `in ${days} day${days === 1 ? '' : 's'}`}`;
    }
    return { kind: 'card_headroom', level: 'info', text: `${inr(headroom)} left on ${label} after this${cycle}.` };
}

async function detectCategoryPace(pool, userId, { type, amount, category_id, date, exclude_id }) {
    if (type !== 'expense' || !category_id) return null;
    const month = String(date).slice(0, 7);
    const [year, monthNum] = month.split('-').map(Number);
    const { rows } = await pool.query(
        `SELECT c.name, b.amount AS budget,
                (SELECT COALESCE(SUM(t.amount), 0) FROM transactions t
                  WHERE t.user_id = $1 AND t.category_id = c.id AND t.type = 'expense'
                    AND to_char(t.date, 'YYYY-MM') = $4
                    AND ($5::uuid IS NULL OR t.id <> $5)
                    AND ${nonSpendingExclusionSQL('t')}) AS spent
         FROM categories c
         LEFT JOIN budgets b ON b.category_id = c.id AND b.user_id = $1 AND b.month = $2 AND b.year = $3
         WHERE c.id = $6`,
        [userId, monthNum, year, month, exclude_id || null, category_id]
    );
    if (!rows.length) return null;
    const cat = rows[0];
    const after = parseFloat(cat.spent || 0) + amount;
    if (cat.budget) {
        const budget = parseFloat(cat.budget);
        if (after > budget) {
            return { kind: 'budget_over', level: 'warn', text: `Puts ${cat.name} ${inr(after - budget)} over its ${inr(budget)} budget this month.` };
        }
        return { kind: 'budget_pace', level: 'info', text: `${inr(after)} of ${inr(budget)} ${cat.name} budget after this (${Math.round((after / budget) * 100)}%).` };
    }
    const d = localDate(date);
    const day = d.getDate();
    const lastMonthStart = new Date(d.getFullYear(), d.getMonth() - 1, 1);
    const lastMonthLen = new Date(d.getFullYear(), d.getMonth(), 0).getDate();
    const lastMonthSameDay = new Date(d.getFullYear(), d.getMonth() - 1, Math.min(day, lastMonthLen));
    const { rows: lastRows } = await pool.query(
        `SELECT COALESCE(SUM(amount), 0) AS total FROM transactions
         WHERE user_id = $1 AND category_id = $2 AND type = 'expense' AND date BETWEEN $3 AND $4
           AND ${nonSpendingExclusionSQL('transactions')}`,
        [userId, category_id, ymd(lastMonthStart), ymd(lastMonthSameDay)]
    );
    const lastTotal = parseFloat(lastRows[0]?.total || 0);
    if (lastTotal < 500) return null;
    return { kind: 'month_pace', level: 'info', text: `${cat.name}: ${inr(after)} by the ${ordinal(day)} vs ${inr(lastTotal)} at this point last month.` };
}

async function detectAccountProjection(pool, userId, { type, amount, payment_method, account_id, date, exclude_id }) {
    if (type !== 'expense' || !account_id || payment_method === 'Credit Card') return null;
    const { rows } = await pool.query(
        `SELECT a.name,
                COALESCE(a.starting_balance, 0)
                  + COALESCE(SUM(CASE WHEN t.type = 'income'  THEN t.amount ELSE 0 END), 0)
                  - COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount ELSE 0 END), 0) AS current_balance
         FROM bank_accounts a
         LEFT JOIN transactions t ON t.account_id = a.id AND t.user_id = a.user_id
           AND t.date >= COALESCE(a.balance_as_of, '1970-01-01')
           AND ($3::uuid IS NULL OR t.id <> $3)
         WHERE a.user_id = $1 AND a.id = $2
         GROUP BY a.id`,
        [userId, account_id, exclude_id || null]
    );
    if (!rows.length) return null;
    const after = parseFloat(rows[0].current_balance || 0) - amount;
    const { rows: dueRows } = await pool.query(
        `SELECT COUNT(*)::int AS n, COALESCE(SUM(amount), 0) AS total FROM recurring_transactions
         WHERE user_id = $1 AND is_active = TRUE AND type = 'expense'
           AND next_due_date BETWEEN $2::date AND $2::date + 30`,
        [userId, date]
    );
    const n = dueRows[0]?.n || 0;
    const bills = n > 0 ? ` · ${n} bill${n === 1 ? '' : 's'} (${inr(parseFloat(dueRows[0].total))}) due in the next 30 days` : '';
    if (after < 0) return { kind: 'account_negative', level: 'warn', text: `${rows[0].name} would go to ${inr(after)} after this${bills}.` };
    return { kind: 'account_projection', level: 'info', text: `${rows[0].name} after this: ${inr(after)}${bills}.` };
}

module.exports = {
    PRIORITY, inr, ordinal, istTimeLabel,
    detectDuplicate, detectAnomaly, detectCard, detectCategoryPace, detectAccountProjection,
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npx jest tests/txEntrySignals.test.js`
Expected: PASS (21 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/utils/txEntrySignals.js backend/tests/txEntrySignals.test.js
git commit -m "feat(entry-signals): card headroom, budget/month pace, account projection"
```

---

### Task 3: Goal impact, late-night, split hint, collector

**Files:**
- Modify: `backend/src/utils/txEntrySignals.js`
- Test: `backend/tests/txEntrySignals.test.js`

- [ ] **Step 1: Append failing tests**

```js
const { detectGoalImpact, detectLateNight, detectSplitHint, collectEntrySignals } = require('../src/utils/txEntrySignals');

describe('detectGoalImpact', () => {
    test('reports progress, remaining and monthly pace to the deadline', async () => {
        jest.useFakeTimers().setSystemTime(new Date('2026-09-12T00:00:00Z'));
        const p = pool();
        p.query.mockResolvedValueOnce({ rows: [{ name: 'Emergency Fund', target_amount: '100000', saved_amount: '55000', deadline: '2026-12-31' }] });
        const s = await detectGoalImpact(p, 'u1', { amount: 6000, goal_id: 'g1' });
        expect(s).toEqual({ kind: 'goal_impact', level: 'info', text: 'Emergency Fund → 61% (₹39,000 to go) · ₹9,750/month to hit Dec 2026.' });
        jest.useRealTimers();
    });
    test('announces completion', async () => {
        const p = pool();
        p.query.mockResolvedValueOnce({ rows: [{ name: 'Trip', target_amount: '10000', saved_amount: '9500', deadline: null }] });
        const s = await detectGoalImpact(p, 'u1', { amount: 600, goal_id: 'g1' });
        expect(s.text).toBe('Trip reaches 100% with this.');
    });
    test('subtracts the transaction being edited from saved_amount', async () => {
        const p = pool();
        p.query
            .mockResolvedValueOnce({ rows: [{ name: 'Trip', target_amount: '10000', saved_amount: '5000', deadline: null }] })
            .mockResolvedValueOnce({ rows: [{ amount: '1000' }] });
        const s = await detectGoalImpact(p, 'u1', { amount: 1500, goal_id: 'g1', exclude_id: 't1' });
        expect(s.text).toBe('Trip → 55% (₹4,500 to go).');
    });
    test('null without a goal', async () => {
        expect(await detectGoalImpact(pool(), 'u1', { amount: 1, goal_id: null })).toBeNull();
    });
});

describe('detectLateNight', () => {
    test('counts this week\'s late-night entries in the category', async () => {
        const p = pool();
        p.query.mockResolvedValueOnce({ rows: [{ name: 'Food', n: 3 }] });
        const s = await detectLateNight(p, 'u1', { type: 'expense', category_id: 'c1', hour: 23, date: '2026-09-12' });
        expect(s).toEqual({ kind: 'late_night', level: 'info', text: '4th late-night Food entry this week.' });
    });
    test('quiet during the day or below two prior entries', async () => {
        const p = pool();
        expect(await detectLateNight(p, 'u1', { type: 'expense', category_id: 'c1', hour: 14, date: '2026-09-12' })).toBeNull();
        p.query.mockResolvedValueOnce({ rows: [{ name: 'Food', n: 1 }] });
        expect(await detectLateNight(p, 'u1', { type: 'expense', category_id: 'c1', hour: 1, date: '2026-09-12' })).toBeNull();
    });
});

describe('detectSplitHint', () => {
    test('suggests splitting a large "with"-style expense', () => {
        expect(detectSplitHint({ type: 'expense', amount: 3200, description: 'Dinner with Raj and Priya' }))
            .toEqual({ kind: 'split_hint', level: 'info', text: 'Shared expense? Split it with a group.', action: 'split' });
    });
    test('null for small amounts, income, or no sharing words', () => {
        expect(detectSplitHint({ type: 'expense', amount: 300, description: 'Dinner with Raj' })).toBeNull();
        expect(detectSplitHint({ type: 'income', amount: 3000, description: 'Split refund' })).toBeNull();
        expect(detectSplitHint({ type: 'expense', amount: 3000, description: 'Rent' })).toBeNull();
    });
});

describe('collectEntrySignals', () => {
    test('runs every detector, drops nulls and failures, sorts by priority', async () => {
        const p = pool();
        // Every query resolves empty except the goal lookup, which errors, and
        // the split hint (sync) — so we expect only split_hint to survive.
        p.query.mockImplementation(sql => {
            if (/savings_goals/.test(sql)) return Promise.reject(new Error('boom'));
            return Promise.resolve({ rows: [] });
        });
        const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        const out = await collectEntrySignals(p, 'u1', {
            type: 'expense', amount: 5000, description: 'Trip with friends', date: '2026-09-12',
            category_id: null, payment_method: 'UPI', credit_card_id: null, account_id: null, goal_id: 'g1', exclude_id: null, hour: 12,
        });
        expect(out.map(s => s.kind)).toEqual(['split_hint']);
        expect(errSpy).toHaveBeenCalled();
        errSpy.mockRestore();
    });

    test('orders warnings before info by PRIORITY', async () => {
        const p = pool();
        p.query.mockImplementation(sql => {
            if (/SELECT created_at FROM transactions/.test(sql)) return Promise.resolve({ rows: [{ created_at: '2026-09-12T07:44:00Z' }] });
            if (/percentile_cont/.test(sql)) return Promise.resolve({ rows: [{ n: 0, median: null }] });
            return Promise.resolve({ rows: [] });
        });
        const out = await collectEntrySignals(p, 'u1', {
            type: 'expense', amount: 5000, description: 'Trip with friends', date: '2026-09-12',
            category_id: null, payment_method: 'UPI', credit_card_id: null, account_id: null, goal_id: null, exclude_id: null, hour: 12,
        });
        expect(out.map(s => s.kind)).toEqual(['duplicate', 'split_hint']);
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx jest tests/txEntrySignals.test.js`
Expected: FAIL — `detectGoalImpact is not a function`

- [ ] **Step 3: Implement**

Add before `module.exports`, then replace the export:

```js
async function detectGoalImpact(pool, userId, { amount, goal_id, exclude_id }) {
    if (!goal_id) return null;
    const { rows } = await pool.query(
        'SELECT name, target_amount, saved_amount, deadline FROM savings_goals WHERE id = $1 AND user_id = $2',
        [goal_id, userId]
    );
    if (!rows.length) return null;
    const goal = rows[0];
    let saved = parseFloat(goal.saved_amount || 0);
    if (exclude_id) {
        const { rows: prev } = await pool.query(
            'SELECT amount FROM transactions WHERE id = $1 AND user_id = $2 AND goal_id = $3',
            [exclude_id, userId, goal_id]
        );
        if (prev.length) saved -= parseFloat(prev[0].amount);
    }
    const target = parseFloat(goal.target_amount);
    const after = saved + amount;
    if (after >= target) return { kind: 'goal_impact', level: 'info', text: `${goal.name} reaches 100% with this.` };
    const pct = Math.round((after / target) * 100);
    let pace = '';
    if (goal.deadline) {
        const deadline = new Date(goal.deadline);
        const monthsLeft = Math.max(1, Math.ceil((deadline.getTime() - Date.now()) / (30.44 * DAY_MS)));
        const label = deadline.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
        pace = ` · ${inr((target - after) / monthsLeft)}/month to hit ${label}`;
    }
    return { kind: 'goal_impact', level: 'info', text: `${goal.name} → ${pct}% (${inr(target - after)} to go)${pace}.` };
}

async function detectLateNight(pool, userId, { type, category_id, hour, date }) {
    if (type !== 'expense' || !category_id || !Number.isInteger(hour)) return null;
    if (!(hour >= 22 || hour < 4)) return null;
    const { rows } = await pool.query(
        `SELECT c.name, COUNT(t.id)::int AS n
         FROM categories c
         LEFT JOIN transactions t ON t.category_id = c.id AND t.user_id = $1 AND t.type = 'expense'
           AND t.date BETWEEN $3::date - 6 AND $3::date
           AND (EXTRACT(HOUR FROM t.created_at + INTERVAL '5 hours 30 minutes') >= 22
                OR EXTRACT(HOUR FROM t.created_at + INTERVAL '5 hours 30 minutes') < 4)
         WHERE c.id = $2
         GROUP BY c.name`,
        [userId, category_id, date]
    );
    if (!rows.length || rows[0].n < 2) return null;
    return { kind: 'late_night', level: 'info', text: `${ordinal(rows[0].n + 1)} late-night ${rows[0].name} entry this week.` };
}

function detectSplitHint({ type, amount, description }) {
    if (type !== 'expense' || amount < 1000) return null;
    if (!/\b(with|split|shared|group|trip)\b/i.test(description || '')) return null;
    return { kind: 'split_hint', level: 'info', text: 'Shared expense? Split it with a group.', action: 'split' };
}

const DETECTORS = [
    detectDuplicate, detectAnomaly, detectCard, detectCategoryPace,
    detectAccountProjection, detectGoalImpact, detectLateNight,
    async (_pool, _userId, input) => detectSplitHint(input),
];

async function collectEntrySignals(pool, userId, input) {
    const results = await Promise.all(DETECTORS.map(d =>
        d(pool, userId, input).catch(err => {
            console.error('[EntrySignals]', err.message);
            return null;
        })
    ));
    return results
        .filter(Boolean)
        .sort((a, b) => PRIORITY.indexOf(a.kind) - PRIORITY.indexOf(b.kind));
}

module.exports = {
    PRIORITY, inr, ordinal, istTimeLabel,
    detectDuplicate, detectAnomaly, detectCard, detectCategoryPace, detectAccountProjection,
    detectGoalImpact, detectLateNight, detectSplitHint, collectEntrySignals,
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npx jest tests/txEntrySignals.test.js`
Expected: PASS (31 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/utils/txEntrySignals.js backend/tests/txEntrySignals.test.js
git commit -m "feat(entry-signals): goal impact, late-night, split hint and prioritised collector"
```

---

### Task 4: `GET /api/transactions/context`

**Files:**
- Modify: `backend/src/routes/transactions.js`
- Test: `backend/tests/transactions.routes.test.js`

- [ ] **Step 1: Mock the signals module in the route test file**

Add after the existing `jest.mock('../src/utils/fcm', ...)` block:

```js
jest.mock('../src/utils/txEntrySignals', () => ({
    collectEntrySignals: jest.fn(),
}));
```

And near the other requires:

```js
const entrySignals = require('../src/utils/txEntrySignals');
```

- [ ] **Step 2: Append failing route tests**

```js
describe('GET /api/transactions/context', () => {
    afterEach(() => { entrySignals.collectEntrySignals.mockReset(); });

    test('returns no signals for a missing/zero amount without running detectors', async () => {
        const res = await request(buildApp()).get('/api/transactions/context?amount=0&description=x');
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ signals: [] });
        expect(entrySignals.collectEntrySignals).not.toHaveBeenCalled();
    });

    test('parses and sanitises inputs before collecting', async () => {
        entrySignals.collectEntrySignals.mockResolvedValueOnce([{ kind: 'duplicate', level: 'warn', text: 'dup' }]);
        const res = await request(buildApp()).get('/api/transactions/context?' + new URLSearchParams({
            type: 'expense', amount: '450', description: 'Swiggy', date: '2026-09-12',
            category_id: '11111111-1111-1111-1111-111111111111', payment_method: 'Credit Card',
            credit_card_id: '3', account_id: '1', goal_id: 'not-a-uuid', exclude_id: '', hour: '23',
        }));
        expect(res.status).toBe(200);
        expect(res.body.signals).toEqual([{ kind: 'duplicate', level: 'warn', text: 'dup' }]);
        expect(entrySignals.collectEntrySignals).toHaveBeenCalledWith(expect.anything(), 'user-123', {
            type: 'expense', amount: 450, description: 'Swiggy', date: '2026-09-12',
            category_id: '11111111-1111-1111-1111-111111111111', payment_method: 'Credit Card',
            credit_card_id: 3, account_id: 1, goal_id: null, exclude_id: null, hour: 23,
        });
    });

    test('defaults type/date and drops an invalid hour', async () => {
        entrySignals.collectEntrySignals.mockResolvedValueOnce([]);
        await request(buildApp()).get('/api/transactions/context?amount=10&hour=99&type=weird&date=bad');
        const input = entrySignals.collectEntrySignals.mock.calls[0][2];
        expect(input.type).toBe('expense');
        expect(input.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(input.hour).toBeNull();
    });

    test('returns 500 when the collector throws', async () => {
        entrySignals.collectEntrySignals.mockRejectedValueOnce(new Error('db down'));
        const res = await request(buildApp()).get('/api/transactions/context?amount=10');
        expect(res.status).toBe(500);
    });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd backend && npx jest tests/transactions.routes.test.js`
Expected: FAIL — `/context` returns 404.

- [ ] **Step 4: Add the route**

Add the require near the top of `backend/src/routes/transactions.js` (after the `savingsRate` require):

```js
const { collectEntrySignals } = require('../utils/txEntrySignals');
```

Add the route directly after the `/search` handler (before `router.get('/'`):

```js
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const asUuid = v => (typeof v === 'string' && UUID_RE.test(v) ? v : null);
const asInt = v => { const n = parseInt(v, 10); return Number.isInteger(n) && n > 0 ? n : null; };

router.get('/context', async (req, res) => {
    try {
        const q = req.query;
        const amount = parseFloat(q.amount);
        if (!Number.isFinite(amount) || amount <= 0) return res.json({ signals: [] });
        const parsedHour = parseInt(q.hour, 10);
        const input = {
            type: q.type === 'income' ? 'income' : 'expense',
            amount,
            description: typeof q.description === 'string' ? q.description.slice(0, 255) : '',
            date: isValidDateString(q.date) ? q.date.slice(0, 10) : new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }),
            category_id: asUuid(q.category_id),
            payment_method: typeof q.payment_method === 'string' && q.payment_method ? q.payment_method : null,
            credit_card_id: asInt(q.credit_card_id),
            account_id: asInt(q.account_id),
            goal_id: asUuid(q.goal_id),
            exclude_id: asUuid(q.exclude_id),
            hour: Number.isInteger(parsedHour) && parsedHour >= 0 && parsedHour <= 23 ? parsedHour : null,
        };
        const signals = await collectEntrySignals(pool, req.user.id, input);
        res.json({ signals });
    } catch (err) {
        console.error('[Transactions] context failed:', err.message);
        res.status(500).json({ error: 'Server error.' });
    }
});
```

- [ ] **Step 5: Run the backend suite**

Run: `cd backend && npx jest`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/transactions.js backend/tests/transactions.routes.test.js
git commit -m "feat(transactions): /context endpoint for as-you-type entry signals"
```

---

### Task 5: Frontend API client + `EntryFeedback` component

**Files:**
- Modify: `frontend/lib/api.ts:91-100`
- Create: `frontend/components/transactions/EntryFeedback.tsx`
- Test: `frontend/components/transactions/EntryFeedback.test.tsx`

- [ ] **Step 1: Add `entryContext` to `transactionsAPI`**

```ts
    entryContext: (params: Record<string, string | number | null | undefined>) =>
        api.get('/api/transactions/context', { params }),
```

(insert after `search:` inside `transactionsAPI`).

- [ ] **Step 2: Write the failing component tests**

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EntryFeedback } from './EntryFeedback';

describe('EntryFeedback', () => {
    it('renders nothing for no signals', () => {
        const { container } = render(<EntryFeedback signals={[]} />);
        expect(container).toBeEmptyDOMElement();
    });

    it('shows the first warning and the first info only', () => {
        render(<EntryFeedback signals={[
            { kind: 'duplicate', level: 'warn', text: 'Dup!' },
            { kind: 'anomaly', level: 'warn', text: 'Big!' },
            { kind: 'budget_pace', level: 'info', text: 'Pace' },
            { kind: 'goal_impact', level: 'info', text: 'Goal' },
        ]} />);
        expect(screen.getByText('Dup!')).toBeInTheDocument();
        expect(screen.getByText('Pace')).toBeInTheDocument();
        expect(screen.queryByText('Big!')).toBeNull();
        expect(screen.queryByText('Goal')).toBeNull();
    });

    it('colours warnings with the warn token', () => {
        render(<EntryFeedback signals={[{ kind: 'duplicate', level: 'warn', text: 'Dup!' }]} />);
        expect(screen.getByText('Dup!').parentElement).toHaveStyle({ color: 'var(--color-warn)' });
    });

    it('links to groups for the split hint', () => {
        render(<EntryFeedback signals={[{ kind: 'split_hint', level: 'info', text: 'Shared?', action: 'split' }]} />);
        expect(screen.getByRole('link', { name: /open groups/i })).toHaveAttribute('href', '/groups');
    });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd frontend && npx vitest run components/transactions/EntryFeedback.test.tsx`
Expected: FAIL — cannot resolve `./EntryFeedback`

- [ ] **Step 4: Implement the component**

```tsx
'use client';

import Link from 'next/link';

export interface EntrySignal {
    kind: string;
    level: 'warn' | 'info';
    text: string;
    action?: 'split';
}

// One warning and one info line at most: the modal is tuned to four fields,
// and a stack of alerts taller than the form would just get skipped.
export function EntryFeedback({ signals }: { signals: EntrySignal[] }) {
    const warn = signals.find(s => s.level === 'warn');
    const info = signals.find(s => s.level === 'info');
    const shown = [warn, info].filter((s): s is EntrySignal => !!s);
    if (!shown.length) return null;
    return (
        <div aria-live="polite" style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '-6px' }}>
            {shown.map(s => {
                const color = s.level === 'warn' ? 'var(--color-warn)' : 'var(--text-muted)';
                return (
                    <div key={s.kind} style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', fontSize: '12px', lineHeight: 1.5, fontFamily: 'var(--font-body)', color }}>
                        <span aria-hidden style={{ width: 5, height: 5, borderRadius: '50%', marginTop: '6px', flexShrink: 0, background: color }} />
                        <span>
                            {s.text}
                            {s.action === 'split' && (
                                <>
                                    {' '}
                                    <Link href="/groups" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>Open groups →</Link>
                                </>
                            )}
                        </span>
                    </div>
                );
            })}
        </div>
    );
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd frontend && npx vitest run components/transactions/EntryFeedback.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add frontend/lib/api.ts frontend/components/transactions/EntryFeedback.tsx frontend/components/transactions/EntryFeedback.test.tsx
git commit -m "feat(transactions): EntryFeedback line component and entryContext client"
```

---

### Task 6: Modal — debounced context fetch under Amount

**Files:**
- Modify: `frontend/components/transactions/TransactionModal.tsx`
- Test: `frontend/components/transactions/TransactionModal.test.tsx`

- [ ] **Step 1: Extend the API mock in the modal test**

In `TransactionModal.test.tsx`, add to the `transactionsAPI` mock object:

```ts
        entryContext: vi.fn().mockResolvedValue({ data: { signals: [] } }),
```

- [ ] **Step 2: Append a failing integration test**

```ts
describe('entry feedback', () => {
    it('asks for context once amount is set and shows the top signal under the amount', async () => {
        (transactionsAPI.entryContext as any).mockResolvedValue({ data: { signals: [
            { kind: 'budget_pace', level: 'info', text: '₹6,200 of ₹8,000 Dining budget after this (78%).' },
        ] } });
        open();
        await fillBasics('400', 'Dinner');

        await waitFor(() => expect(screen.getByText('₹6,200 of ₹8,000 Dining budget after this (78%).')).toBeInTheDocument());
        expect(transactionsAPI.entryContext).toHaveBeenCalledWith(expect.objectContaining({
            type: 'expense', amount: 400, description: 'Dinner', payment_method: 'UPI',
        }));
    });

    it('does not ask for context without an amount', async () => {
        open();
        const desc = document.querySelector<HTMLInputElement>('input[type="text"]')!;
        fireEvent.change(desc, { target: { value: 'Dinner' } });
        await new Promise(r => setTimeout(r, 500));
        expect(transactionsAPI.entryContext).not.toHaveBeenCalled();
    });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd frontend && npx vitest run components/transactions/TransactionModal.test.tsx`
Expected: FAIL — signal text not found.

- [ ] **Step 4: Wire the modal**

(a) Add the import after the `CategoryPickerDialog` import (line 9):

```ts
import { EntryFeedback, EntrySignal } from '@/components/transactions/EntryFeedback';
```

(b) Add state after `const [showMore, setShowMore] = useState(false);`:

```ts
    const [entrySignals, setEntrySignals] = useState<EntrySignal[]>([]);
```

(c) In the populate `useEffect` (the one keyed on `[transaction, isOpen, defaultDate, prefill]`), add before `setShowMore(!!transaction);`:

```ts
        setEntrySignals([]);
```

(d) Add the debounced fetch effect after the credit-card-selection effect (the one keyed on `[form.payment_method, cards, isOpen]`):

```ts
    useEffect(() => {
        if (!isOpen || form.type === 'transfer') { setEntrySignals([]); return; }
        const amount = parseFloat(form.amount);
        if (!Number.isFinite(amount) || amount <= 0) { setEntrySignals([]); return; }
        const timer = setTimeout(() => {
            transactionsAPI.entryContext({
                type: form.type,
                amount,
                description: form.description.trim(),
                date: form.date,
                category_id: form.category_id || undefined,
                payment_method: form.type === 'expense' ? form.payment_method : undefined,
                credit_card_id: form.credit_card_id ?? undefined,
                account_id: form.account_id ?? undefined,
                goal_id: form.goal_id ?? undefined,
                exclude_id: transaction?.id,
                hour: new Date().getHours(),
            })
                .then(res => setEntrySignals(res.data.signals || []))
                .catch(() => setEntrySignals([]));
        }, 400);
        return () => clearTimeout(timer);
    }, [isOpen, form.type, form.amount, form.description, form.date, form.category_id, form.payment_method,
        form.credit_card_id, form.account_id, form.goal_id, transaction?.id]);
```

(e) Render the line immediately after the Amount block's closing `</div>` (the block that wraps `<label style={labelStyle}>Amount</label>`), before the transfer-accounts block:

```tsx
                {!isTransfer && <EntryFeedback signals={entrySignals} />}
```

- [ ] **Step 5: Run the modal tests**

Run: `cd frontend && npx vitest run components/transactions/TransactionModal.test.tsx`
Expected: PASS — existing tests plus the two new ones.

- [ ] **Step 6: Lint + type-check**

Run: `cd frontend && npx tsc --noEmit && npx eslint components/transactions`
Expected: clean

- [ ] **Step 7: Commit**

```bash
git add frontend/components/transactions/TransactionModal.tsx frontend/components/transactions/TransactionModal.test.tsx
git commit -m "feat(transactions): live entry feedback line under the amount field"
```

---

### Task 7: Manual verification + docs

**Files:**
- Modify: `docs/AI_FEATURES.md`

- [ ] **Step 1: Run both apps locally and check the golden path**

Run: `cd backend && npm run dev` and `cd frontend && npm run dev` (frontend `.env.local` points at production API per memory — for local backend, temporarily set `NEXT_PUBLIC_API_URL=http://localhost:PORT` or verify against the deployed backend after pushing, per the "push and let user verify" memory).

Check in the browser:
1. Type an amount + a description you've used before with the same amount today → warning line in `--color-warn`.
2. Pick a category with a budget → "₹X of ₹Y … budget after this (N%)".
3. Payment method Credit Card + a card → headroom line replaces the budget line's slot only if it is the higher-priority info (budget pace outranks card headroom only when it's a `budget_over` warn; otherwise `card_headroom` shows as the info line and budget pace is hidden — confirm exactly one warn + one info).
4. Type "Dinner with friends" and ₹3000 → "Shared expense?" with a working link to `/groups`.
5. Switch to Transfer → the line disappears. Clear the amount → the line disappears.
6. Edit an existing transaction → no false duplicate warning about itself.

- [ ] **Step 2: Document the endpoint**

Add to `docs/AI_FEATURES.md` under the "Non-AI / utility endpoints" section:

```markdown
- `GET /api/transactions/context` — **Not LLM-backed.** As-you-type entry signals for the
  Add Transaction modal (`backend/src/utils/txEntrySignals.js`): duplicate, amount anomaly,
  credit-card headroom / over-limit, budget pace / over-budget, account balance projection with
  upcoming recurring bills, goal impact, pace vs same day last month, late-night pattern, split
  hint. Returns `{ signals: [{ kind, level: 'warn'|'info', text, action? }] }` sorted by priority;
  the modal shows at most one `warn` and one `info`.
```

- [ ] **Step 3: Commit**

```bash
git add docs/AI_FEATURES.md
git commit -m "docs: document entry-context signals endpoint"
```

---

## Self-review

- **Spec coverage:** budget % (Task 2 `budget_pace`/`budget_over`), card headroom (Task 2), account projection (Task 2), pace vs last month (Task 2), goal impact (Task 3), anomaly (Task 1), duplicate (Task 1), late-night (Task 3), split hint (Task 3); "one quiet line, pick the single most relevant" (Task 5 component: one warn + one info). ✔
- **Placeholders:** none.
- **Type consistency:** signal shape `{kind, level, text, action?}` identical across `txEntrySignals.js`, route tests, `EntrySignal` TS type. Route builds exactly the `input` object the detectors destructure (`type, amount, description, date, category_id, payment_method, credit_card_id, account_id, goal_id, exclude_id, hour`). ✔
- **Test expectations worth re-checking during execution:** `detectCard` "6 days" assumes date `2026-09-12` and billing day 18; `detectGoalImpact` pace uses fake system time `2026-09-12` → Dec 31 is ~3.6 months → `ceil` = 4 → ₹39,000 / 4 = ₹9,750. `inr(1234567.6)` → `₹12,34,568` relies on Node's ICU `en-IN` grouping (full-icu ships with Node ≥ 13).
