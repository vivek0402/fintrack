# Personal Loans (Lend/Borrow Tracking) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user track money lent to or borrowed from an individual (friend/family) — principal, optional due date and interest, partial repayments, write-offs — separate from bank loans (`loans` table) and shared-bill splitting (`splits`/`groups`), and have it correctly affect account balances, spending/income totals, and net worth.

**Architecture:** A new `personal_loans` + `personal_loan_repayments` table pair, following the same shape as `savings_goals` (a domain table + a `transactions.personal_loan_id` link column, mirroring `transactions.goal_id`). Creating a loan or recording a repayment optionally inserts a real transaction (so account balances stay correct) that is excluded from spending/income totals via the existing `nonSpendingExclusionSQL`/`isNonSavingsExpense`/`isRealIncome` machinery — the same mechanism that already excludes goal contributions and investments. A loan's status (`outstanding` / `partially_repaid` / `repaid` / `written_off`) is always *derived* from `principal_amount`, the sum of its repayments, and `written_off_at` — never stored — so it can't drift out of sync the way a maintained status column could.

**Tech Stack:** Node/Express 5 + pg (backend), Jest + supertest (backend tests), Next.js 16 + React 19 + TypeScript (frontend), Vitest + Testing Library (frontend tests). No new dependencies.

**Coding rules that apply (from CLAUDE.md / memory):** JSX inline styles only (no Tailwind), colors via CSS variables, parameterized SQL, migrations replay on every backend start so must be idempotent, currency via `Math.round(n).toLocaleString('en-IN')`, no emojis in new code, comments only where the WHY is non-obvious.

---

## Critical cross-stack contract you must not break

`backend/src/utils/savingsRate.js`'s `isNonSavingsExpense`/`isRealIncome` are **hand-mirrored** in `frontend/lib/utils.ts` (same function names, same logic) — the file header says so, and `backend/tests/savingsRate.test.js` / `frontend/lib/utils.test.ts` share the same test-case table by design, specifically to catch drift. Task 3 below changes both predicates and their SQL twin (`nonSpendingExclusionSQL`) — **you must edit and test all three together**, in one task, or you will reintroduce exactly the class of silent bug this pairing exists to prevent.

---

## File structure

| File | Responsibility |
|---|---|
| `backend/src/db/migrations/070_personal_loans.sql` | `personal_loans` + `personal_loan_repayments` tables |
| `backend/src/db/migrations/071_transactions_personal_loan_id.sql` | `transactions.personal_loan_id` link column |
| `backend/src/utils/validation.js` | `PERSONAL_LOAN_DIRECTIONS`/`PERSONAL_LOAN_INTEREST_TYPES` + validators (modify) |
| `backend/src/utils/personalLoans.js` | Balance/status derivation, per-loan and aggregate fetch (new) |
| `backend/src/utils/savingsRate.js` | Exclude personal-loan transactions from spending/income (modify) |
| `frontend/lib/utils.ts` | Mirror of the above exclusion (modify) |
| `backend/src/routes/personalLoans.js` | CRUD + repayments + write-off (new) |
| `backend/src/routes/analytics.js` | `/networth` gains receivable/payable (modify) |
| `backend/src/index.js` | Mount route + due-date reminder cron (modify) |
| `frontend/lib/api.ts` | `personalLoansAPI` (modify) |
| `frontend/components/personal-loans/PersonalLoanModal.tsx` | Add loan form (new) |
| `frontend/components/personal-loans/RepaymentModal.tsx` | Record-repayment form (new) |
| `frontend/app/personal-loans/page.tsx` | List page: Owed to you / You owe / Settled (new) |

---

### Task 1: Database schema

**Files:**
- Create: `backend/src/db/migrations/070_personal_loans.sql`
- Create: `backend/src/db/migrations/071_transactions_personal_loan_id.sql`
- Modify: `backend/src/utils/validation.js`
- Test: `backend/tests/validation.test.js`

- [ ] **Step 1: Write the two migrations**

`backend/src/db/migrations/070_personal_loans.sql`:
```sql
CREATE TABLE IF NOT EXISTS personal_loans (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    direction         VARCHAR(10) NOT NULL CHECK (direction IN ('lent', 'borrowed')),
    counterparty_name TEXT NOT NULL,
    principal_amount  NUMERIC(12,2) NOT NULL CHECK (principal_amount > 0),
    account_id        INTEGER REFERENCES bank_accounts(id) ON DELETE SET NULL,
    date_given        DATE NOT NULL,
    due_date          DATE,
    interest_type     VARCHAR(20) NOT NULL DEFAULT 'none' CHECK (interest_type IN ('none', 'flat', 'percent_per_month')),
    interest_rate     NUMERIC(6,3),
    notes             TEXT,
    written_off_at    TIMESTAMPTZ,
    transaction_id    UUID REFERENCES transactions(id) ON DELETE SET NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_personal_loans_user ON personal_loans(user_id);

CREATE TABLE IF NOT EXISTS personal_loan_repayments (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    loan_id        UUID NOT NULL REFERENCES personal_loans(id) ON DELETE CASCADE,
    amount         NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    date           DATE NOT NULL,
    notes          TEXT,
    transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_personal_loan_repayments_loan ON personal_loan_repayments(loan_id);
```

`backend/src/db/migrations/071_transactions_personal_loan_id.sql`:
```sql
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS personal_loan_id UUID REFERENCES personal_loans(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_personal_loan_id ON transactions(personal_loan_id) WHERE personal_loan_id IS NOT NULL;
```

(071 must run after 070 creates `personal_loans` — the migration runner sorts by filename, and `071 > 070`, so this is already guaranteed.)

- [ ] **Step 2: Add validation helpers**

Open `backend/src/utils/validation.js`. Add near the other `*_TYPES` arrays (e.g. next to `LOAN_TYPES`):
```js
const PERSONAL_LOAN_DIRECTIONS = ['lent', 'borrowed'];
const PERSONAL_LOAN_INTEREST_TYPES = ['none', 'flat', 'percent_per_month'];
```
Add near the other `isValid*` functions:
```js
const isValidPersonalLoanDirection = (value) => PERSONAL_LOAN_DIRECTIONS.includes(value);

const isValidPersonalLoanInterestType = (value) => PERSONAL_LOAN_INTEREST_TYPES.includes(value);
```
Add to `module.exports`:
```js
    PERSONAL_LOAN_DIRECTIONS,
    PERSONAL_LOAN_INTEREST_TYPES,
    isValidPersonalLoanDirection,
    isValidPersonalLoanInterestType,
```

- [ ] **Step 3: Write the failing tests**

Append to `backend/tests/validation.test.js` (check the file's existing `require` line at the top and add these two names to it rather than adding a second `require`):
```js
describe('isValidPersonalLoanDirection', () => {
    test('accepts lent and borrowed', () => {
        expect(isValidPersonalLoanDirection('lent')).toBe(true);
        expect(isValidPersonalLoanDirection('borrowed')).toBe(true);
    });
    test('rejects anything else', () => {
        expect(isValidPersonalLoanDirection('gifted')).toBe(false);
        expect(isValidPersonalLoanDirection('')).toBe(false);
        expect(isValidPersonalLoanDirection(undefined)).toBe(false);
    });
});

describe('isValidPersonalLoanInterestType', () => {
    test('accepts none, flat and percent_per_month', () => {
        expect(isValidPersonalLoanInterestType('none')).toBe(true);
        expect(isValidPersonalLoanInterestType('flat')).toBe(true);
        expect(isValidPersonalLoanInterestType('percent_per_month')).toBe(true);
    });
    test('rejects anything else', () => {
        expect(isValidPersonalLoanInterestType('compound')).toBe(false);
        expect(isValidPersonalLoanInterestType(undefined)).toBe(false);
    });
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npx jest tests/validation.test.js`
Expected: PASS (all tests, including the 4 new ones)

- [ ] **Step 5: Commit**

```bash
git add backend/src/db/migrations/070_personal_loans.sql backend/src/db/migrations/071_transactions_personal_loan_id.sql backend/src/utils/validation.js backend/tests/validation.test.js
git commit -m "feat(personal-loans): schema and validation helpers"
```

---

### Task 2: Balance/status derivation util

**Files:**
- Create: `backend/src/utils/personalLoans.js`
- Test: `backend/tests/personalLoans.test.js`

- [ ] **Step 1: Write the failing tests**

```js
const { fetchPersonalLoansWithBalance, fetchPersonalLoanWithBalance, fetchPersonalLoanTotals, deriveStatus } = require('../src/utils/personalLoans');

function mockPool(rows) {
    return { query: jest.fn().mockResolvedValue({ rows }) };
}

describe('deriveStatus', () => {
    test('written_off wins regardless of balance', () => {
        expect(deriveStatus({ written_off_at: '2026-01-01', outstanding_amount: '500', repaid_amount: '0' })).toBe('written_off');
    });
    test('repaid when outstanding is zero or negative', () => {
        expect(deriveStatus({ written_off_at: null, outstanding_amount: '0', repaid_amount: '5000' })).toBe('repaid');
        expect(deriveStatus({ written_off_at: null, outstanding_amount: '-10', repaid_amount: '5010' })).toBe('repaid');
    });
    test('partially_repaid when some but not all repaid', () => {
        expect(deriveStatus({ written_off_at: null, outstanding_amount: '2000', repaid_amount: '3000' })).toBe('partially_repaid');
    });
    test('outstanding when nothing repaid yet', () => {
        expect(deriveStatus({ written_off_at: null, outstanding_amount: '5000', repaid_amount: '0' })).toBe('outstanding');
    });
});

describe('fetchPersonalLoansWithBalance', () => {
    test('attaches a derived status to every row and scopes by user_id', async () => {
        const pool = mockPool([
            { id: 'l1', direction: 'lent', principal_amount: '5000', repaid_amount: '0', outstanding_amount: '5000', written_off_at: null },
            { id: 'l2', direction: 'borrowed', principal_amount: '2000', repaid_amount: '2000', outstanding_amount: '0', written_off_at: null },
        ]);
        const rows = await fetchPersonalLoansWithBalance(pool, 'u1');
        expect(rows[0].status).toBe('outstanding');
        expect(rows[1].status).toBe('repaid');
        expect(pool.query.mock.calls[0][1]).toEqual(['u1']);
    });
});

describe('fetchPersonalLoanWithBalance', () => {
    test('returns null when not found', async () => {
        const pool = mockPool([]);
        expect(await fetchPersonalLoanWithBalance(pool, 'u1', 'missing')).toBeNull();
    });
    test('scopes by user_id and loan id', async () => {
        const pool = mockPool([{ id: 'l1', direction: 'lent', principal_amount: '1000', repaid_amount: '0', outstanding_amount: '1000', written_off_at: null }]);
        const loan = await fetchPersonalLoanWithBalance(pool, 'u1', 'l1');
        expect(loan.status).toBe('outstanding');
        expect(pool.query.mock.calls[0][1]).toEqual(['u1', 'l1']);
    });
});

describe('fetchPersonalLoanTotals', () => {
    test('sums outstanding lent as receivable and borrowed as payable, skipping repaid/written-off', async () => {
        const pool = mockPool([
            { id: 'l1', direction: 'lent', outstanding_amount: '3000', repaid_amount: '0', written_off_at: null },
            { id: 'l2', direction: 'lent', outstanding_amount: '0', repaid_amount: '2000', written_off_at: null },
            { id: 'l3', direction: 'borrowed', outstanding_amount: '1500', repaid_amount: '500', written_off_at: null },
            { id: 'l4', direction: 'lent', outstanding_amount: '9000', repaid_amount: '0', written_off_at: '2026-01-01' },
        ]);
        const totals = await fetchPersonalLoanTotals(pool, 'u1');
        expect(totals).toEqual({ receivable: 3000, payable: 1500 });
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx jest tests/personalLoans.test.js`
Expected: FAIL — `Cannot find module '../src/utils/personalLoans'`

- [ ] **Step 3: Implement**

```js
// Centralizes "how much is left on this personal loan" so every consumer
// (the personal-loans list, net worth) computes it the same way. Status is
// never stored -- it's derived fresh from principal, repayments and
// written_off_at every time, so a forgotten update after a repayment can
// never leave it stale (the same class of bug this codebase has hit before
// with maintained-but-not-reconciled state).
const LOAN_WITH_BALANCE_QUERY = `
    SELECT pl.*,
        COALESCE(r.repaid_amount, 0) AS repaid_amount,
        pl.principal_amount - COALESCE(r.repaid_amount, 0) AS outstanding_amount
    FROM personal_loans pl
    LEFT JOIN (
        SELECT loan_id, SUM(amount) AS repaid_amount
        FROM personal_loan_repayments
        GROUP BY loan_id
    ) r ON r.loan_id = pl.id
    WHERE pl.user_id = $1
    ORDER BY pl.created_at DESC
`;

const LOAN_WITH_BALANCE_SINGLE_QUERY = `
    SELECT pl.*,
        COALESCE(r.repaid_amount, 0) AS repaid_amount,
        pl.principal_amount - COALESCE(r.repaid_amount, 0) AS outstanding_amount
    FROM personal_loans pl
    LEFT JOIN (
        SELECT loan_id, SUM(amount) AS repaid_amount
        FROM personal_loan_repayments
        WHERE loan_id = $2
        GROUP BY loan_id
    ) r ON r.loan_id = pl.id
    WHERE pl.user_id = $1 AND pl.id = $2
`;

function deriveStatus(loan) {
    if (loan.written_off_at) return 'written_off';
    const outstanding = parseFloat(loan.outstanding_amount);
    if (outstanding <= 0) return 'repaid';
    if (parseFloat(loan.repaid_amount) > 0) return 'partially_repaid';
    return 'outstanding';
}

function withStatus(loan) {
    return { ...loan, status: deriveStatus(loan) };
}

async function fetchPersonalLoansWithBalance(pool, userId) {
    const { rows } = await pool.query(LOAN_WITH_BALANCE_QUERY, [userId]);
    return rows.map(withStatus);
}

async function fetchPersonalLoanWithBalance(pool, userId, loanId) {
    const { rows } = await pool.query(LOAN_WITH_BALANCE_SINGLE_QUERY, [userId, loanId]);
    return rows[0] ? withStatus(rows[0]) : null;
}

// Aggregate for net worth: money owed TO the user is an asset (receivable),
// money the user owes is a liability (payable). Repaid and written-off loans
// contribute zero on both sides -- the money is either back or gone.
async function fetchPersonalLoanTotals(pool, userId) {
    const loans = await fetchPersonalLoansWithBalance(pool, userId);
    let receivable = 0, payable = 0;
    for (const loan of loans) {
        if (loan.status === 'written_off' || loan.status === 'repaid') continue;
        if (loan.direction === 'lent') receivable += parseFloat(loan.outstanding_amount);
        else payable += parseFloat(loan.outstanding_amount);
    }
    return { receivable, payable };
}

module.exports = { fetchPersonalLoansWithBalance, fetchPersonalLoanWithBalance, fetchPersonalLoanTotals, deriveStatus };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npx jest tests/personalLoans.test.js`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/utils/personalLoans.js backend/tests/personalLoans.test.js
git commit -m "feat(personal-loans): balance and status derivation"
```

---

### Task 3: Exclude personal-loan transactions from spending/income (both stacks, together)

**Files:**
- Modify: `backend/src/utils/savingsRate.js`
- Modify: `frontend/lib/utils.ts`
- Test: `backend/tests/savingsRate.test.js`
- Test: `frontend/lib/utils.test.ts`

This is one task, not two, because the two files are a hand-mirrored contract enforced by matching test-case tables — read the "Critical cross-stack contract" section at the top of this plan before starting.

- [ ] **Step 1: Read both current files in full**

Read `backend/src/utils/savingsRate.js` and `frontend/lib/utils.ts` end to end so the edit below lands in exactly the right place relative to existing logic — do not guess line numbers from this plan.

- [ ] **Step 2: Append failing backend tests**

Add to the existing `describe('isNonSavingsExpense', ...)` block in `backend/tests/savingsRate.test.js` (inside it, as a new `it`):
```js
    it('excludes personal-loan-linked transactions', () => {
        expect(isNonSavingsExpense(expense({ personal_loan_id: 'pl-1' }))).toBe(false);
    });
```
Add to the existing `describe('isRealIncome', ...)` block:
```js
    it('excludes personal-loan-linked transactions (e.g. money borrowed, or a repayment received)', () => {
        expect(isRealIncome(income({ personal_loan_id: 'pl-1' }))).toBe(false);
    });
```
Add to the existing `describe('nonSpendingExclusionSQL', ...)` block:
```js
    it('excludes personal-loan-linked rows regardless of type', () => {
        expect(nonSpendingExclusionSQL()).toMatch(/personal_loan_id IS NULL/);
    });
```

- [ ] **Step 3: Append failing frontend tests**

Add to the existing `describe('isNonSavingsExpense', ...)` block in `frontend/lib/utils.test.ts`:
```ts
    it('excludes personal-loan-linked transactions', () => {
        expect(isNonSavingsExpense(expense({ personal_loan_id: 'pl-1' }))).toBe(false);
    });
```
Add to the existing `describe('isRealIncome', ...)` block:
```ts
    it('excludes personal-loan-linked transactions (e.g. money borrowed, or a repayment received)', () => {
        expect(isRealIncome(income({ personal_loan_id: 'pl-1' }))).toBe(false);
    });
```
Add to the existing `describe('isCategorizableExpense', ...)` block:
```ts
    it('excludes personal-loan-linked transactions the same way it excludes goal contributions', () => {
        expect(isCategorizableExpense(expense({ personal_loan_id: 'pl-1' }))).toBe(false);
    });
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `cd backend && npx jest tests/savingsRate.test.js` — expect the 2 new backend tests to FAIL.
Run: `cd frontend && npx vitest run lib/utils.test.ts` — expect the 3 new frontend tests to FAIL.

- [ ] **Step 5: Implement the backend side**

In `backend/src/utils/savingsRate.js`, update `nonSpendingExclusionSQL` — add one line so the exclusion applies regardless of transaction type (personal loans occur on both the expense side — money lent, or a borrowed-money repayment — and the income side — money borrowed, or a repayment received):
```js
function nonSpendingExclusionSQL(alias = 'transactions') {
    return `NOT (${alias}.type = 'expense' AND (
        EXISTS (SELECT 1 FROM categories cat WHERE cat.id = ${alias}.category_id AND cat.is_investment_category = true)
        OR ${alias}.goal_id IS NOT NULL
    ))
    AND ${alias}.personal_loan_id IS NULL
    AND NOT (COALESCE(${alias}.tags, '{}') && ARRAY['transfer','credit_card_payment']::text[])`;
}
```
Update `isNonSavingsExpense`:
```js
function isNonSavingsExpense(tx) {
    if (tx.type !== 'expense') return false;
    if (tx.is_investment_category) return false;
    if (tx.goal_id) return false;
    if (tx.personal_loan_id) return false;
    const tags = tx.tags || [];
    if (tags.includes('transfer') || tags.includes('credit_card_payment')) return false;
    return true;
}
```
Update `isRealIncome`:
```js
function isRealIncome(tx) {
    if (tx.type !== 'income') return false;
    if (tx.personal_loan_id) return false;
    const tags = tx.tags || [];
    if (tags.includes('transfer') || tags.includes('credit_card_payment')) return false;
    return true;
}
```

- [ ] **Step 6: Implement the frontend side**

In `frontend/lib/utils.ts`, update the three predicates to match:
```ts
export function isNonSavingsExpense(tx: { type: string; is_investment_category?: boolean; goal_id?: string | null; personal_loan_id?: string | null; tags?: string[] | null }): boolean {
    if (tx.type !== 'expense') return false;
    if (tx.is_investment_category) return false;
    if (tx.goal_id) return false;
    if (tx.personal_loan_id) return false;
    const tags = tx.tags || [];
    if (tags.includes('transfer') || tags.includes('credit_card_payment')) return false;
    return true;
}

export function isRealIncome(tx: { type: string; personal_loan_id?: string | null; tags?: string[] | null }): boolean {
    if (tx.type !== 'income') return false;
    if (tx.personal_loan_id) return false;
    const tags = tx.tags || [];
    if (tags.includes('transfer') || tags.includes('credit_card_payment')) return false;
    return true;
}

export function isCategorizableExpense(tx: { type: string; goal_id?: string | null; personal_loan_id?: string | null; tags?: string[] | null }): boolean {
    if (tx.type !== 'expense') return false;
    if (tx.goal_id) return false;
    if (tx.personal_loan_id) return false;
    const tags = tx.tags || [];
    if (tags.includes('transfer') || tags.includes('credit_card_payment')) return false;
    return true;
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd backend && npx jest tests/savingsRate.test.js` — expect ALL tests (existing + new) to PASS.
Run: `cd frontend && npx vitest run lib/utils.test.ts` — expect ALL tests (existing + new) to PASS.

- [ ] **Step 8: Commit**

```bash
git add backend/src/utils/savingsRate.js backend/tests/savingsRate.test.js frontend/lib/utils.ts frontend/lib/utils.test.ts
git commit -m "feat(personal-loans): exclude personal-loan transactions from spending and income on both stacks"
```

---

### Task 4: Routes — list, get, create

**Files:**
- Create: `backend/src/routes/personalLoans.js`
- Test: `backend/tests/personalLoans.routes.test.js`

- [ ] **Step 1: Write the failing tests**

```js
process.env.JWT_SECRET = 'test-secret';

jest.mock('../src/db/pool', () => ({
    query: jest.fn(),
    connect: jest.fn(),
}));
jest.mock('../src/middleware/auth', () => (req, res, next) => {
    req.user = { id: 'user-123' };
    next();
});

const express = require('express');
const request = require('supertest');
const pool = require('../src/db/pool');
const router = require('../src/routes/personalLoans');

function buildApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/personal-loans', router);
    return app;
}

afterEach(() => {
    pool.query.mockReset();
    pool.connect.mockReset();
});

describe('GET /api/personal-loans', () => {
    test('returns loans with derived status', async () => {
        pool.query.mockResolvedValueOnce({ rows: [
            { id: 'l1', direction: 'lent', principal_amount: '5000', repaid_amount: '0', outstanding_amount: '5000', written_off_at: null },
        ] });
        const res = await request(buildApp()).get('/api/personal-loans');
        expect(res.status).toBe(200);
        expect(res.body.loans[0].status).toBe('outstanding');
    });
});

describe('GET /api/personal-loans/:id', () => {
    test('404s when not found', async () => {
        pool.query.mockResolvedValueOnce({ rows: [] });
        const res = await request(buildApp()).get('/api/personal-loans/missing');
        expect(res.status).toBe(404);
    });

    test('returns the loan with its repayments', async () => {
        pool.query
            .mockResolvedValueOnce({ rows: [{ id: 'l1', direction: 'lent', principal_amount: '5000', repaid_amount: '1000', outstanding_amount: '4000', written_off_at: null }] })
            .mockResolvedValueOnce({ rows: [{ id: 'r1', amount: '1000', date: '2026-09-01' }] });
        const res = await request(buildApp()).get('/api/personal-loans/l1');
        expect(res.status).toBe(200);
        expect(res.body.loan.status).toBe('partially_repaid');
        expect(res.body.repayments).toHaveLength(1);
    });
});

describe('POST /api/personal-loans', () => {
    test('rejects when required fields are missing', async () => {
        const res = await request(buildApp()).post('/api/personal-loans').send({ direction: 'lent' });
        expect(res.status).toBe(400);
        expect(pool.query).not.toHaveBeenCalled();
    });

    test('rejects an invalid direction', async () => {
        const res = await request(buildApp()).post('/api/personal-loans').send({
            direction: 'gifted', counterparty_name: 'Priya', principal_amount: 5000, date_given: '2026-09-13',
        });
        expect(res.status).toBe(400);
    });

    test('creates a loan without an account (no linked transaction)', async () => {
        const client = { query: jest.fn(), release: jest.fn() };
        client.query
            .mockResolvedValueOnce({ rows: [] }) // BEGIN
            .mockResolvedValueOnce({ rows: [{ id: 'l1', direction: 'lent', counterparty_name: 'Priya', principal_amount: '5000', account_id: null }] }) // INSERT loan
            .mockResolvedValueOnce({ rows: [] }); // COMMIT
        pool.connect.mockResolvedValueOnce(client);

        const res = await request(buildApp()).post('/api/personal-loans').send({
            direction: 'lent', counterparty_name: 'Priya', principal_amount: 5000, date_given: '2026-09-13',
        });

        expect(res.status).toBe(201);
        expect(res.body.loan.status).toBe('outstanding');
        expect(res.body.loan.outstanding_amount).toBe(5000);
        // No account_id -> no linked transaction is created, so exactly 3 client
        // queries run (BEGIN, INSERT loan, COMMIT) with no transactions INSERT.
        expect(client.query).toHaveBeenCalledTimes(3);
    });

    test('creates a loan with an account, inserting a linked expense transaction for "lent"', async () => {
        pool.query.mockResolvedValueOnce({ rows: [{ id: 1 }] }); // account ownership check
        const client = { query: jest.fn(), release: jest.fn() };
        client.query
            .mockResolvedValueOnce({ rows: [] }) // BEGIN
            .mockResolvedValueOnce({ rows: [{ id: 'l1', direction: 'lent', counterparty_name: 'Priya', principal_amount: '5000', account_id: 1 }] }) // INSERT loan
            .mockResolvedValueOnce({ rows: [{ id: 'tx1' }] }) // INSERT transaction
            .mockResolvedValueOnce({ rows: [{ id: 'l1', direction: 'lent', counterparty_name: 'Priya', principal_amount: '5000', account_id: 1, transaction_id: 'tx1' }] }) // UPDATE loan.transaction_id
            .mockResolvedValueOnce({ rows: [] }); // COMMIT
        pool.connect.mockResolvedValueOnce(client);

        const res = await request(buildApp()).post('/api/personal-loans').send({
            direction: 'lent', counterparty_name: 'Priya', principal_amount: 5000, date_given: '2026-09-13', account_id: 1,
        });

        expect(res.status).toBe(201);
        const txInsertCall = client.query.mock.calls.find(c => /INSERT INTO transactions/.test(c[0]));
        expect(txInsertCall[1]).toEqual(expect.arrayContaining(['expense', 5000, 'Lent to Priya', '2026-09-13', 1, 'l1']));
    });

    test('rejects an account_id that does not belong to the user', async () => {
        pool.query.mockResolvedValueOnce({ rows: [] }); // ownership check finds nothing
        const res = await request(buildApp()).post('/api/personal-loans').send({
            direction: 'lent', counterparty_name: 'Priya', principal_amount: 5000, date_given: '2026-09-13', account_id: 999,
        });
        expect(res.status).toBe(400);
        expect(pool.connect).not.toHaveBeenCalled();
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx jest tests/personalLoans.routes.test.js`
Expected: FAIL — `Cannot find module '../src/routes/personalLoans'`

- [ ] **Step 3: Implement**

```js
const express = require('express');
const pool = require('../db/pool');
const auth = require('../middleware/auth');
const { isPositiveNumber, isValidDateString, isValidPersonalLoanDirection, isValidPersonalLoanInterestType } = require('../utils/validation');
const { fetchPersonalLoansWithBalance, fetchPersonalLoanWithBalance } = require('../utils/personalLoans');
const router = express.Router();

router.use(auth);

router.get('/', async (req, res) => {
    try {
        const loans = await fetchPersonalLoansWithBalance(pool, req.user.id);
        res.json({ loans });
    } catch (err) {
        console.error('[PersonalLoans]', err.message);
        res.status(500).json({ error: 'Server error.' });
    }
});

router.get('/:id', async (req, res) => {
    try {
        const loan = await fetchPersonalLoanWithBalance(pool, req.user.id, req.params.id);
        if (!loan) return res.status(404).json({ error: 'Loan not found.' });
        const { rows: repayments } = await pool.query(
            'SELECT * FROM personal_loan_repayments WHERE loan_id = $1 ORDER BY date DESC, created_at DESC',
            [req.params.id]
        );
        res.json({ loan, repayments });
    } catch (err) {
        console.error('[PersonalLoans]', err.message);
        res.status(500).json({ error: 'Server error.' });
    }
});

router.post('/', async (req, res) => {
    try {
        const { direction, counterparty_name, principal_amount, account_id, date_given, due_date, interest_type, interest_rate, notes } = req.body;
        if (!direction || !counterparty_name || !principal_amount || !date_given)
            return res.status(400).json({ error: 'Direction, counterparty name, amount and date are required.' });
        if (!isValidPersonalLoanDirection(direction))
            return res.status(400).json({ error: "Direction must be 'lent' or 'borrowed'." });
        if (!isPositiveNumber(principal_amount))
            return res.status(400).json({ error: 'Amount must be a positive number.' });
        if (!isValidDateString(date_given))
            return res.status(400).json({ error: 'Date given must be a valid date (YYYY-MM-DD).' });
        if (due_date && !isValidDateString(due_date))
            return res.status(400).json({ error: 'Due date must be a valid date (YYYY-MM-DD).' });
        if (interest_type && !isValidPersonalLoanInterestType(interest_type))
            return res.status(400).json({ error: "Interest type must be 'none', 'flat' or 'percent_per_month'." });
        if (account_id) {
            const { rows: acctCheck } = await pool.query(
                'SELECT id FROM bank_accounts WHERE id = $1 AND user_id = $2',
                [account_id, req.user.id]
            );
            if (!acctCheck.length) return res.status(400).json({ error: 'Invalid account_id.' });
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const loanResult = await client.query(
                `INSERT INTO personal_loans
                    (user_id, direction, counterparty_name, principal_amount, account_id, date_given, due_date, interest_type, interest_rate, notes)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
                [req.user.id, direction, counterparty_name.trim(), principal_amount, account_id || null, date_given, due_date || null,
                 interest_type || 'none', interest_rate || null, notes || null]
            );
            let loan = loanResult.rows[0];

            if (account_id) {
                const txType = direction === 'lent' ? 'expense' : 'income';
                const description = direction === 'lent' ? `Lent to ${counterparty_name.trim()}` : `Borrowed from ${counterparty_name.trim()}`;
                const txResult = await client.query(
                    `INSERT INTO transactions (user_id, type, amount, description, date, account_id, personal_loan_id)
                     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
                    [req.user.id, txType, principal_amount, description, date_given, account_id, loan.id]
                );
                const updateResult = await client.query(
                    'UPDATE personal_loans SET transaction_id = $1 WHERE id = $2 RETURNING *',
                    [txResult.rows[0].id, loan.id]
                );
                loan = updateResult.rows[0];
            }

            await client.query('COMMIT');
            res.status(201).json({
                loan: { ...loan, repaid_amount: 0, outstanding_amount: parseFloat(loan.principal_amount), status: 'outstanding' },
            });
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    } catch (err) {
        console.error('[PersonalLoans]', err.message);
        res.status(500).json({ error: 'Server error.' });
    }
});

module.exports = router;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npx jest tests/personalLoans.routes.test.js`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/personalLoans.js backend/tests/personalLoans.routes.test.js
git commit -m "feat(personal-loans): list, get and create routes"
```

---

### Task 5: Routes — edit, repayments, write-off, delete

**Files:**
- Modify: `backend/src/routes/personalLoans.js`
- Test: `backend/tests/personalLoans.routes.test.js`

- [ ] **Step 1: Append failing tests**

```js
describe('PATCH /api/personal-loans/:id', () => {
    test('updates non-financial fields only', async () => {
        pool.query.mockResolvedValueOnce({ rows: [{ id: 'l1' }] }); // UPDATE
        pool.query.mockResolvedValueOnce({ rows: [{ id: 'l1', direction: 'lent', principal_amount: '5000', repaid_amount: '0', outstanding_amount: '5000', written_off_at: null, notes: 'Paid half back in cash' }] }); // fetchPersonalLoanWithBalance
        const res = await request(buildApp()).patch('/api/personal-loans/l1').send({ notes: 'Paid half back in cash' });
        expect(res.status).toBe(200);
        expect(res.body.loan.notes).toBe('Paid half back in cash');
    });

    test('404s when the loan does not belong to the user', async () => {
        pool.query.mockResolvedValueOnce({ rows: [] });
        const res = await request(buildApp()).patch('/api/personal-loans/l1').send({ notes: 'x' });
        expect(res.status).toBe(404);
    });

    test('rejects an invalid interest_type', async () => {
        const res = await request(buildApp()).patch('/api/personal-loans/l1').send({ interest_type: 'compound' });
        expect(res.status).toBe(400);
        expect(pool.query).not.toHaveBeenCalled();
    });
});

describe('POST /api/personal-loans/:id/repayments', () => {
    test('rejects a repayment larger than the outstanding balance', async () => {
        pool.query.mockResolvedValueOnce({ rows: [{ id: 'l1', direction: 'lent', principal_amount: '5000', repaid_amount: '0', outstanding_amount: '5000', written_off_at: null, counterparty_name: 'Priya' }] });
        const res = await request(buildApp()).post('/api/personal-loans/l1/repayments').send({ amount: 6000, date: '2026-09-14' });
        expect(res.status).toBe(400);
    });

    test('rejects a repayment on a written-off loan', async () => {
        pool.query.mockResolvedValueOnce({ rows: [{ id: 'l1', direction: 'lent', principal_amount: '5000', repaid_amount: '0', outstanding_amount: '5000', written_off_at: '2026-01-01', counterparty_name: 'Priya' }] });
        const res = await request(buildApp()).post('/api/personal-loans/l1/repayments').send({ amount: 100, date: '2026-09-14' });
        expect(res.status).toBe(400);
    });

    test('records a repayment without an account (no linked transaction)', async () => {
        pool.query.mockResolvedValueOnce({ rows: [{ id: 'l1', direction: 'lent', principal_amount: '5000', repaid_amount: '0', outstanding_amount: '5000', written_off_at: null, counterparty_name: 'Priya' }] });
        const client = { query: jest.fn(), release: jest.fn() };
        client.query
            .mockResolvedValueOnce({ rows: [] }) // BEGIN
            .mockResolvedValueOnce({ rows: [{ id: 'r1', loan_id: 'l1', amount: '1000', date: '2026-09-14' }] }) // INSERT repayment
            .mockResolvedValueOnce({ rows: [] }); // COMMIT
        pool.connect.mockResolvedValueOnce(client);
        pool.query.mockResolvedValueOnce({ rows: [{ id: 'l1', direction: 'lent', principal_amount: '5000', repaid_amount: '1000', outstanding_amount: '4000', written_off_at: null }] }); // fetchPersonalLoanWithBalance after commit

        const res = await request(buildApp()).post('/api/personal-loans/l1/repayments').send({ amount: 1000, date: '2026-09-14' });

        expect(res.status).toBe(201);
        expect(res.body.loan.status).toBe('partially_repaid');
        expect(client.query).toHaveBeenCalledTimes(3);
    });

    test('records a repayment with an account, inserting a linked income transaction for a lent loan', async () => {
        pool.query
            .mockResolvedValueOnce({ rows: [{ id: 'l1', direction: 'lent', principal_amount: '5000', repaid_amount: '0', outstanding_amount: '5000', written_off_at: null, counterparty_name: 'Priya' }] }) // fetchPersonalLoanWithBalance
            .mockResolvedValueOnce({ rows: [{ id: 1 }] }); // account ownership check
        const client = { query: jest.fn(), release: jest.fn() };
        client.query
            .mockResolvedValueOnce({ rows: [] }) // BEGIN
            .mockResolvedValueOnce({ rows: [{ id: 'tx1' }] }) // INSERT transaction
            .mockResolvedValueOnce({ rows: [{ id: 'r1' }] }) // INSERT repayment
            .mockResolvedValueOnce({ rows: [] }); // COMMIT
        pool.connect.mockResolvedValueOnce(client);
        pool.query.mockResolvedValueOnce({ rows: [{ id: 'l1', direction: 'lent', principal_amount: '5000', repaid_amount: '1000', outstanding_amount: '4000', written_off_at: null }] });

        const res = await request(buildApp()).post('/api/personal-loans/l1/repayments').send({ amount: 1000, date: '2026-09-14', account_id: 1 });

        expect(res.status).toBe(201);
        const txInsertCall = client.query.mock.calls.find(c => /INSERT INTO transactions/.test(c[0]));
        expect(txInsertCall[1]).toEqual(expect.arrayContaining(['income', 1000, 'Repayment from Priya', '2026-09-14', 1, 'l1']));
    });
});

describe('PATCH /api/personal-loans/:id/write-off', () => {
    test('marks the loan written off', async () => {
        pool.query.mockResolvedValueOnce({ rows: [{ id: 'l1' }] }); // UPDATE
        pool.query.mockResolvedValueOnce({ rows: [{ id: 'l1', direction: 'lent', principal_amount: '5000', repaid_amount: '0', outstanding_amount: '5000', written_off_at: '2026-09-14T00:00:00Z' }] });
        const res = await request(buildApp()).patch('/api/personal-loans/l1/write-off');
        expect(res.status).toBe(200);
        expect(res.body.loan.status).toBe('written_off');
    });

    test('404s when already written off or not found', async () => {
        pool.query.mockResolvedValueOnce({ rows: [] });
        const res = await request(buildApp()).patch('/api/personal-loans/l1/write-off');
        expect(res.status).toBe(404);
    });
});

describe('DELETE /api/personal-loans/:id', () => {
    test('deletes the loan and its linked transactions', async () => {
        const client = { query: jest.fn(), release: jest.fn() };
        client.query
            .mockResolvedValueOnce({ rows: [] }) // BEGIN
            .mockResolvedValueOnce({ rows: [{ transaction_id: 'tx-repay-1' }] }) // repayments' transaction_ids
            .mockResolvedValueOnce({ rows: [{ transaction_id: 'tx-loan-1' }] }) // loan row (ownership + its own transaction_id)
            .mockResolvedValueOnce({ rows: [] }) // DELETE transactions
            .mockResolvedValueOnce({ rows: [] }) // DELETE personal_loans
            .mockResolvedValueOnce({ rows: [] }); // COMMIT
        pool.connect.mockResolvedValueOnce(client);

        const res = await request(buildApp()).delete('/api/personal-loans/l1');

        expect(res.status).toBe(200);
        const txDeleteCall = client.query.mock.calls.find(c => /DELETE FROM transactions/.test(c[0]));
        expect(txDeleteCall[1][0]).toEqual(expect.arrayContaining(['tx-loan-1', 'tx-repay-1']));
    });

    test('404s when the loan does not belong to the user', async () => {
        const client = { query: jest.fn(), release: jest.fn() };
        client.query
            .mockResolvedValueOnce({ rows: [] }) // BEGIN
            .mockResolvedValueOnce({ rows: [] }) // repayments (none)
            .mockResolvedValueOnce({ rows: [] }) // loan row -- not found
            .mockResolvedValueOnce({ rows: [] }); // ROLLBACK
        pool.connect.mockResolvedValueOnce(client);

        const res = await request(buildApp()).delete('/api/personal-loans/l1');
        expect(res.status).toBe(404);
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx jest tests/personalLoans.routes.test.js`
Expected: FAIL — the new routes don't exist yet (404s where 200/201/400 expected).

- [ ] **Step 3: Implement — append to `backend/src/routes/personalLoans.js` before `module.exports = router;`**

```js
// principal_amount, direction and account_id are immutable after creation --
// changing them would require reconciling the linked transaction, the same
// class of complexity transactions.js's own PUT handler deliberately avoids
// for investment- and goal-linked rows.
router.patch('/:id', async (req, res) => {
    try {
        const { counterparty_name, due_date, interest_type, interest_rate, notes } = req.body;
        if (due_date !== undefined && due_date !== null && !isValidDateString(due_date))
            return res.status(400).json({ error: 'Due date must be a valid date (YYYY-MM-DD).' });
        if (interest_type !== undefined && !isValidPersonalLoanInterestType(interest_type))
            return res.status(400).json({ error: "Interest type must be 'none', 'flat' or 'percent_per_month'." });

        const result = await pool.query(
            `UPDATE personal_loans SET
                counterparty_name = COALESCE($1, counterparty_name),
                due_date = CASE WHEN $6::boolean THEN NULL ELSE COALESCE($2, due_date) END,
                interest_type = COALESCE($3, interest_type),
                interest_rate = COALESCE($4, interest_rate),
                notes = COALESCE($5, notes),
                updated_at = NOW()
             WHERE id = $7 AND user_id = $8 RETURNING id`,
            [counterparty_name?.trim() || null, due_date || null, interest_type || null, interest_rate ?? null, notes || null,
             'due_date' in req.body && req.body.due_date === null, req.params.id, req.user.id]
        );
        if (!result.rows.length) return res.status(404).json({ error: 'Loan not found.' });

        const loan = await fetchPersonalLoanWithBalance(pool, req.user.id, req.params.id);
        res.json({ loan });
    } catch (err) {
        console.error('[PersonalLoans]', err.message);
        res.status(500).json({ error: 'Server error.' });
    }
});

router.post('/:id/repayments', async (req, res) => {
    try {
        const { amount, date, notes, account_id } = req.body;
        if (!amount || !date) return res.status(400).json({ error: 'Amount and date are required.' });
        if (!isPositiveNumber(amount)) return res.status(400).json({ error: 'Amount must be a positive number.' });
        if (!isValidDateString(date)) return res.status(400).json({ error: 'Date must be a valid date (YYYY-MM-DD).' });

        const loan = await fetchPersonalLoanWithBalance(pool, req.user.id, req.params.id);
        if (!loan) return res.status(404).json({ error: 'Loan not found.' });
        if (loan.status === 'written_off') return res.status(400).json({ error: 'Cannot record a repayment on a written-off loan.' });
        if (parseFloat(amount) > parseFloat(loan.outstanding_amount) + 0.01)
            return res.status(400).json({ error: `Amount exceeds the outstanding balance of ${loan.outstanding_amount}.` });

        if (account_id) {
            const { rows: acctCheck } = await pool.query(
                'SELECT id FROM bank_accounts WHERE id = $1 AND user_id = $2',
                [account_id, req.user.id]
            );
            if (!acctCheck.length) return res.status(400).json({ error: 'Invalid account_id.' });
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            let transactionId = null;
            if (account_id) {
                const txType = loan.direction === 'lent' ? 'income' : 'expense';
                const description = loan.direction === 'lent'
                    ? `Repayment from ${loan.counterparty_name}`
                    : `Repayment to ${loan.counterparty_name}`;
                const txResult = await client.query(
                    `INSERT INTO transactions (user_id, type, amount, description, date, account_id, personal_loan_id)
                     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
                    [req.user.id, txType, amount, description, date, account_id, loan.id]
                );
                transactionId = txResult.rows[0].id;
            }

            const repaymentResult = await client.query(
                `INSERT INTO personal_loan_repayments (loan_id, amount, date, notes, transaction_id)
                 VALUES ($1,$2,$3,$4,$5) RETURNING *`,
                [loan.id, amount, date, notes || null, transactionId]
            );

            await client.query('COMMIT');

            const updatedLoan = await fetchPersonalLoanWithBalance(pool, req.user.id, req.params.id);
            res.status(201).json({ repayment: repaymentResult.rows[0], loan: updatedLoan });
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    } catch (err) {
        console.error('[PersonalLoans]', err.message);
        res.status(500).json({ error: 'Server error.' });
    }
});

router.patch('/:id/write-off', async (req, res) => {
    try {
        const result = await pool.query(
            `UPDATE personal_loans SET written_off_at = NOW(), updated_at = NOW()
             WHERE id = $1 AND user_id = $2 AND written_off_at IS NULL RETURNING id`,
            [req.params.id, req.user.id]
        );
        if (!result.rows.length) return res.status(404).json({ error: 'Loan not found or already written off.' });

        const loan = await fetchPersonalLoanWithBalance(pool, req.user.id, req.params.id);
        res.json({ loan });
    } catch (err) {
        console.error('[PersonalLoans]', err.message);
        res.status(500).json({ error: 'Server error.' });
    }
});

// Deleting a loan explicitly deletes its linked transaction(s) too, rather
// than leaving them orphaned with personal_loan_id set NULL by the FK -- an
// orphaned "Lent to Priya" expense would otherwise start counting as a real
// ₹5,000 expense the moment it's no longer loan-linked.
//
// Note: the reverse direction (deleting the linked transaction itself via
// the generic /api/transactions/:id route) is NOT specially handled -- the
// loan's own balance math never depends on the transaction row (it's always
// principal minus repayments), so nothing breaks except the account balance
// and transaction history quietly losing that entry. Same tradeoff this
// codebase already accepts for investment- and goal-linked transactions.
// Deliberate.
router.delete('/:id', async (req, res) => {
    try {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const { rows: repayments } = await client.query(
                'SELECT transaction_id FROM personal_loan_repayments WHERE loan_id = $1',
                [req.params.id]
            );
            const { rows: loanRows } = await client.query(
                'SELECT transaction_id FROM personal_loans WHERE id = $1 AND user_id = $2',
                [req.params.id, req.user.id]
            );
            if (!loanRows.length) {
                await client.query('ROLLBACK');
                return res.status(404).json({ error: 'Loan not found.' });
            }

            const txIds = [loanRows[0].transaction_id, ...repayments.map(r => r.transaction_id)].filter(Boolean);
            if (txIds.length) {
                await client.query('DELETE FROM transactions WHERE id = ANY($1::uuid[]) AND user_id = $2', [txIds, req.user.id]);
            }

            await client.query('DELETE FROM personal_loans WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);

            await client.query('COMMIT');
            res.json({ message: 'Deleted.' });
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    } catch (err) {
        console.error('[PersonalLoans]', err.message);
        res.status(500).json({ error: 'Server error.' });
    }
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npx jest tests/personalLoans.routes.test.js`
Expected: PASS (17 tests total)

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/personalLoans.js backend/tests/personalLoans.routes.test.js
git commit -m "feat(personal-loans): edit, repayment, write-off and delete routes"
```

---

### Task 6: Mount the route, net worth integration, due-date reminders

**Files:**
- Modify: `backend/src/index.js`
- Modify: `backend/src/routes/analytics.js`
- Test: `backend/tests/analytics.routes.test.js`

- [ ] **Step 1: Read `backend/src/routes/analytics.js`'s `/networth` handler and `backend/tests/analytics.routes.test.js` in full**

Confirm the exact current shape of the `Promise.all([...])` array and the `res.json({...})` body before editing — the plan text below shows what changes, not the whole function.

- [ ] **Step 2: Append a failing test to `backend/tests/analytics.routes.test.js`**

Find the existing test(s) for `GET /api/analytics/networth` (search the file for `/networth`) and match their exact mocking style for `pool.query` call ordering. Add:
```js
    test('includes personal loan receivable/payable in assets and liabilities', async () => {
        pool.query
            .mockResolvedValueOnce({ rows: [{ total: '100000' }] })  // bank balance
            .mockResolvedValueOnce({ rows: [{ total: '50000' }] })   // investments
            .mockResolvedValueOnce({ rows: [{ total: '20000' }] })   // credit outstanding (via fetchTotalCreditCardOutstanding's own pool.query)
            .mockResolvedValueOnce({ rows: [{ total: '30000' }] })   // loans outstanding
            .mockResolvedValueOnce({ rows: [                         // fetchPersonalLoanTotals -> fetchPersonalLoansWithBalance
                { id: 'l1', direction: 'lent', outstanding_amount: '4000', repaid_amount: '0', written_off_at: null },
                { id: 'l2', direction: 'borrowed', outstanding_amount: '1000', repaid_amount: '0', written_off_at: null },
            ] })
            .mockResolvedValueOnce({ rows: [] }) // net_worth_snapshots upsert
            .mockResolvedValueOnce({ rows: [] }); // history select

        const res = await request(buildApp()).get('/api/analytics/networth');

        expect(res.status).toBe(200);
        expect(res.body.current.total_personal_loans_receivable).toBe(4000);
        expect(res.body.current.total_personal_loans_payable).toBe(1000);
        expect(res.body.current.total_assets).toBe(100000 + 50000 + 4000);
        expect(res.body.current.total_liabilities).toBe(20000 + 30000 + 1000);
    });
```
Note: `fetchTotalCreditCardOutstanding` internally calls `fetchCreditCardsWithBalance`, which issues its own `pool.query` — check the existing networth test(s) already in this file to see exactly how many `mockResolvedValueOnce` calls precede the snapshot upsert today, and adjust the count above to match reality rather than the illustrative count shown here.

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd backend && npx jest tests/analytics.routes.test.js -t networth`
Expected: FAIL — `total_personal_loans_receivable` is `undefined`.

- [ ] **Step 4: Implement the analytics.js change**

Add the import near the other utility requires at the top of `backend/src/routes/analytics.js`:
```js
const { fetchPersonalLoanTotals } = require('../utils/personalLoans');
```
In the `/networth` handler, add `fetchPersonalLoanTotals(pool, req.user.id)` as a fifth entry in the existing `Promise.all([...])` array, then use it:
```js
        const [bankRes, investRes, total_credit_outstanding, loanRes, personalLoanTotals] = await Promise.all([
            /* ...the existing four entries, unchanged... */
            fetchPersonalLoanTotals(pool, req.user.id),
        ]);

        const total_bank_balance = parseFloat(bankRes.rows[0].total);
        const total_investments = parseFloat(investRes.rows[0].total);
        const total_loans_outstanding = parseFloat(loanRes.rows[0].total);
        const total_personal_loans_receivable = personalLoanTotals.receivable;
        const total_personal_loans_payable = personalLoanTotals.payable;

        const total_assets = total_bank_balance + total_investments + total_personal_loans_receivable;
        const total_liabilities = total_credit_outstanding + total_loans_outstanding + total_personal_loans_payable;
        const net_worth = total_assets - total_liabilities;
```
Add the two new fields to the `res.json({ current: {...} })` object, alongside the existing ones:
```js
            current: {
                total_bank_balance,
                total_investments,
                total_personal_loans_receivable,
                total_assets,
                total_credit_outstanding,
                total_loans_outstanding,
                total_personal_loans_payable,
                total_liabilities,
                net_worth,
            },
```
Leave the `net_worth_snapshots` INSERT untouched — it already stores `total_assets`/`total_liabilities`/`net_worth`, which now correctly include the personal-loan amounts; no new snapshot columns are needed.

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd backend && npx jest tests/analytics.routes.test.js`
Expected: PASS — the new test, and every pre-existing networth test (check you haven't broken their call-count assumptions).

- [ ] **Step 6: Mount the route in `backend/src/index.js`**

Find the line `app.use('/api/goals',        require('./routes/goals'));` and add directly after it:
```js
app.use('/api/personal-loans', require('./routes/personalLoans'));
```

- [ ] **Step 7: Add the due-date reminder cron**

Find the existing `// ─── Cron: goal deadline approaching — daily 9am ─────────────────────────────` block in `backend/src/index.js` and add a new cron job directly after it, following its exact structure:
```js
// ─── Cron: personal loan due date approaching — daily 9am ───────────────────
cron.schedule('0 9 * * *', async () => {
    try {
        const { rows: loans } = await pool.query(
            `SELECT pl.*, COALESCE(r.repaid_amount, 0) AS repaid_amount,
                    pl.principal_amount - COALESCE(r.repaid_amount, 0) AS outstanding_amount
             FROM personal_loans pl
             JOIN user_fcm_tokens ft ON ft.user_id = pl.user_id
             LEFT JOIN (
                 SELECT loan_id, SUM(amount) AS repaid_amount
                 FROM personal_loan_repayments GROUP BY loan_id
             ) r ON r.loan_id = pl.id
             WHERE pl.due_date IS NOT NULL
               AND pl.written_off_at IS NULL
               AND pl.due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '3 days'`
        );

        for (const loan of loans) {
            try {
                const outstanding = parseFloat(loan.outstanding_amount);
                if (outstanding <= 0) continue;
                const daysLeft = Math.ceil((new Date(loan.due_date) - new Date()) / 86400000);
                const alertKey = `personal_loan_due:${loan.id}:${loan.due_date}`;
                const verb = loan.direction === 'lent' ? 'owes you' : 'you owe';
                await notifyOnce(loan.user_id, alertKey, {
                    title: 'Personal Loan Due Soon',
                    body: `${loan.counterparty_name} ${verb} ₹${outstanding.toLocaleString('en-IN')}, due in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}.`,
                    data: { type: 'personal_loan_due', loan_id: String(loan.id) },
                });
            } catch (err) {
                console.error(`[Cron:PersonalLoanDue] loan ${loan.id}:`, err.message);
            }
        }
    } catch (err) {
        console.error('[Cron:PersonalLoanDue] fatal:', err.message);
    }
}, { timezone: 'Asia/Kolkata' });
```

- [ ] **Step 8: Run the full backend suite**

Run: `cd backend && npx jest`
Expected: PASS — every suite, including the new personal-loans ones and the modified analytics/savingsRate ones.

- [ ] **Step 9: Commit**

```bash
git add backend/src/index.js backend/src/routes/analytics.js backend/tests/analytics.routes.test.js
git commit -m "feat(personal-loans): mount route, net worth integration, due-date reminders"
```

---

### Task 7: Frontend API client

**Files:**
- Modify: `frontend/lib/api.ts`

- [ ] **Step 1: Add `personalLoansAPI`**

Add near `goalsAPI` (after it, for proximity — both are "domain tracker" APIs):
```ts
export const personalLoansAPI = {
    getAll: () => api.get('/api/personal-loans'),
    get: (id: string) => api.get(`/api/personal-loans/${id}`),
    create: (data: {
        direction: 'lent' | 'borrowed'; counterparty_name: string; principal_amount: number;
        account_id?: number; date_given: string; due_date?: string;
        interest_type?: 'none' | 'flat' | 'percent_per_month'; interest_rate?: number; notes?: string;
    }) => api.post('/api/personal-loans', data),
    update: (id: string, data: { counterparty_name?: string; due_date?: string | null; interest_type?: string; interest_rate?: number; notes?: string }) =>
        api.patch(`/api/personal-loans/${id}`, data),
    addRepayment: (id: string, data: { amount: number; date: string; notes?: string; account_id?: number }) =>
        api.post(`/api/personal-loans/${id}/repayments`, data),
    writeOff: (id: string) => api.patch(`/api/personal-loans/${id}/write-off`),
    delete: (id: string) => api.delete(`/api/personal-loans/${id}`),
};
```

- [ ] **Step 2: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add frontend/lib/api.ts
git commit -m "feat(api): personalLoansAPI"
```

---

### Task 8: Frontend — PersonalLoanModal (add form)

**Files:**
- Create: `frontend/components/personal-loans/PersonalLoanModal.tsx`
- Test: `frontend/components/personal-loans/PersonalLoanModal.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PersonalLoanModal } from './PersonalLoanModal';
import { personalLoansAPI, accountsAPI } from '@/lib/api';

vi.mock('@/lib/api', () => ({
    personalLoansAPI: { create: vi.fn().mockResolvedValue({ data: { loan: { id: 'l1' } } }) },
    accountsAPI: { getAll: vi.fn().mockResolvedValue({ data: { accounts: [{ id: 1, name: 'HDFC', is_default: true }] } }) },
}));

beforeEach(() => vi.clearAllMocks());

function fill(name: string, amount: string, date: string) {
    fireEvent.change(screen.getByLabelText(/who/i), { target: { value: name } });
    fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: amount } });
    fireEvent.change(screen.getByLabelText(/date given/i), { target: { value: date } });
}

describe('PersonalLoanModal', () => {
    it('defaults to "Lent" and submits with that direction', async () => {
        const onSuccess = vi.fn();
        render(<PersonalLoanModal isOpen onClose={vi.fn()} onSuccess={onSuccess} />);
        fill('Priya', '5000', '2026-09-13');
        fireEvent.click(screen.getByRole('button', { name: /add loan/i }));

        await waitFor(() => expect(personalLoansAPI.create).toHaveBeenCalledWith(
            expect.objectContaining({ direction: 'lent', counterparty_name: 'Priya', principal_amount: 5000, date_given: '2026-09-13' })
        ));
        await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    });

    it('switches to "Borrowed" and submits that direction instead', async () => {
        render(<PersonalLoanModal isOpen onClose={vi.fn()} onSuccess={vi.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: /^borrowed$/i }));
        fill('Raj', '2000', '2026-09-13');
        fireEvent.click(screen.getByRole('button', { name: /add loan/i }));

        await waitFor(() => expect(personalLoansAPI.create).toHaveBeenCalledWith(
            expect.objectContaining({ direction: 'borrowed' })
        ));
    });

    it('requires who, amount and date before submitting', () => {
        render(<PersonalLoanModal isOpen onClose={vi.fn()} onSuccess={vi.fn()} />);
        fireEvent.click(screen.getByRole('button', { name: /add loan/i }));
        expect(personalLoansAPI.create).not.toHaveBeenCalled();
    });

    it('sends interest fields only when an interest type other than none is picked', async () => {
        render(<PersonalLoanModal isOpen onClose={vi.fn()} onSuccess={vi.fn()} />);
        fill('Priya', '5000', '2026-09-13');
        fireEvent.change(screen.getByLabelText(/interest/i), { target: { value: 'flat' } });
        fireEvent.change(screen.getByLabelText(/interest rate/i), { target: { value: '2' } });
        fireEvent.click(screen.getByRole('button', { name: /add loan/i }));

        await waitFor(() => expect(personalLoansAPI.create).toHaveBeenCalledWith(
            expect.objectContaining({ interest_type: 'flat', interest_rate: 2 })
        ));
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run components/personal-loans/PersonalLoanModal.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
'use client';

import { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { DatePicker } from '@/components/ui/DatePicker';
import { personalLoansAPI, accountsAPI } from '@/lib/api';
import { toast } from '@/store/toastStore';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

const labelStyle: React.CSSProperties = { fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: '8px', fontFamily: 'var(--font-body)' };
const inputBase: React.CSSProperties = { width: '100%', background: 'var(--glass-fill-1)', color: 'var(--text-primary)', border: '1px solid var(--glass-border)', borderRadius: '10px', fontSize: '0.875rem', fontFamily: 'var(--font-body)', outline: 'none', padding: '10px 12px', boxSizing: 'border-box' };

export function PersonalLoanModal({ isOpen, onClose, onSuccess }: Props) {
    const [direction, setDirection] = useState<'lent' | 'borrowed'>('lent');
    const [counterpartyName, setCounterpartyName] = useState('');
    const [amount, setAmount] = useState('');
    const [dateGiven, setDateGiven] = useState(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }));
    const [dueDate, setDueDate] = useState('');
    const [interestType, setInterestType] = useState<'none' | 'flat' | 'percent_per_month'>('none');
    const [interestRate, setInterestRate] = useState('');
    const [notes, setNotes] = useState('');
    const [accountId, setAccountId] = useState<number | null>(null);
    const [accounts, setAccounts] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!isOpen) return;
        accountsAPI.getAll().then(res => {
            const list = res.data.accounts || [];
            setAccounts(list);
            const def = list.find((a: any) => a.is_default) ?? list[0];
            if (def) setAccountId(def.id);
        }).catch(() => setAccounts([]));
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) {
            setDirection('lent'); setCounterpartyName(''); setAmount('');
            setDateGiven(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }));
            setDueDate(''); setInterestType('none'); setInterestRate(''); setNotes('');
            setError('');
        }
    }, [isOpen]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!counterpartyName.trim() || !amount || !dateGiven) return;
        setLoading(true); setError('');
        try {
            await personalLoansAPI.create({
                direction,
                counterparty_name: counterpartyName.trim(),
                principal_amount: parseFloat(amount),
                date_given: dateGiven,
                due_date: dueDate || undefined,
                interest_type: interestType !== 'none' ? interestType : undefined,
                interest_rate: interestType !== 'none' && interestRate ? parseFloat(interestRate) : undefined,
                notes: notes || undefined,
                account_id: accountId ?? undefined,
            });
            toast.success(direction === 'lent' ? 'Loan recorded' : 'Borrowed amount recorded');
            onSuccess(); onClose();
        } catch (err: any) {
            setError(err.response?.data?.error || 'Something went wrong.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Add Personal Loan"
            footer={
                <button type="submit" form="personal-loan-form" disabled={loading}
                    style={{ width: '100%', height: '48px', border: 'none', borderRadius: 'var(--radius-md)', background: 'var(--accent)', color: 'white', fontSize: '14.5px', fontWeight: 600, cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.7 : 1, fontFamily: 'var(--font-body)' }}>
                    {loading ? 'Saving…' : 'Add loan'}
                </button>
            }>
            <form id="personal-loan-form" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                    <label style={labelStyle}>Type</label>
                    <div style={{ display: 'flex', gap: '4px', padding: '3px', background: 'var(--glass-fill-1)', borderRadius: 'var(--radius-md)', border: '1px solid var(--glass-border)' }}>
                        {(['lent', 'borrowed'] as const).map(d => (
                            <button key={d} type="button" onClick={() => setDirection(d)}
                                style={{ flex: 1, padding: '9px 0', borderRadius: '9px', fontSize: '0.8rem', fontWeight: direction === d ? 600 : 400, cursor: 'pointer', fontFamily: 'var(--font-body)', border: `1px solid ${direction === d ? 'var(--accent-border)' : 'transparent'}`, background: direction === d ? 'var(--accent-subtle)' : 'transparent', color: direction === d ? 'var(--accent)' : 'var(--text-muted)' }}>
                                {d === 'lent' ? 'Lent' : 'Borrowed'}
                            </button>
                        ))}
                    </div>
                </div>

                <Input label="Who" placeholder="e.g. Priya" value={counterpartyName} onChange={e => setCounterpartyName(e.target.value)} required />

                <div>
                    <label style={labelStyle}>Amount</label>
                    <input type="number" min="0.01" step="any" style={inputBase} value={amount} onChange={e => setAmount(e.target.value)} required />
                </div>

                <DatePicker label="Date given" value={dateGiven} onChange={setDateGiven} required />
                <DatePicker label="Due date (optional)" value={dueDate} onChange={setDueDate} minDate={dateGiven} />

                {accounts.length > 0 && (
                    <div>
                        <label style={labelStyle}>Account (optional — affects its balance)</label>
                        <select value={accountId ?? ''} onChange={e => setAccountId(e.target.value ? Number(e.target.value) : null)} style={{ ...inputBase, cursor: 'pointer' }}>
                            <option value="">Don't track against an account</option>
                            {accounts.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>
                    </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div>
                        <label htmlFor="pl-interest-type" style={labelStyle}>Interest</label>
                        <select id="pl-interest-type" value={interestType} onChange={e => setInterestType(e.target.value as any)} style={{ ...inputBase, cursor: 'pointer' }}>
                            <option value="none">None</option>
                            <option value="flat">Flat amount</option>
                            <option value="percent_per_month">% per month</option>
                        </select>
                    </div>
                    {interestType !== 'none' && (
                        <div>
                            <label htmlFor="pl-interest-rate" style={labelStyle}>Interest rate</label>
                            <input id="pl-interest-rate" type="number" min="0" step="any" style={inputBase} value={interestRate} onChange={e => setInterestRate(e.target.value)} />
                        </div>
                    )}
                </div>

                <div>
                    <label style={labelStyle}>Notes (optional)</label>
                    <textarea rows={2} style={{ ...inputBase, resize: 'vertical' }} value={notes} onChange={e => setNotes(e.target.value)} />
                </div>

                {error && <div style={{ fontSize: '0.8rem', color: 'var(--color-exp)' }}>{error}</div>}
            </form>
        </Modal>
    );
}
```

Note: `Input`'s label renders an accessible `<label>` associated with its `<input>` via the component's own internals — this already satisfies `getByLabelText(/who/i)` and `getByLabelText(/amount/i)` in the tests above as long as `Input`'s label text is exactly `"Who"` (matches `/who/i`) and the raw `<input>` for Amount has a `<label style={labelStyle}>Amount</label>` immediately preceding it with no `htmlFor`/`id` pairing — if `getByLabelText(/amount/i)` fails when you run the test, add `htmlFor="pl-amount"` to that label and `id="pl-amount"` to the amount `<input>` (same pattern already used for `pl-interest-type`/`pl-interest-rate` above), and similarly for `DatePicker`'s "Date given" label if it doesn't already associate its label with its trigger element. Fix whichever specific association is missing rather than changing the test's query.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run components/personal-loans/PersonalLoanModal.test.tsx`
Expected: PASS (4 tests) — fix any label association issues per the note above rather than loosening the test queries.

- [ ] **Step 5: Type-check and lint**

Run: `cd frontend && npx tsc --noEmit && npx eslint components/personal-loans/PersonalLoanModal.tsx`
Expected: clean

- [ ] **Step 6: Commit**

```bash
git add frontend/components/personal-loans/PersonalLoanModal.tsx frontend/components/personal-loans/PersonalLoanModal.test.tsx
git commit -m "feat(personal-loans): add-loan modal"
```

---

### Task 9: Frontend — RepaymentModal

**Files:**
- Create: `frontend/components/personal-loans/RepaymentModal.tsx`
- Test: `frontend/components/personal-loans/RepaymentModal.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RepaymentModal } from './RepaymentModal';
import { personalLoansAPI } from '@/lib/api';

vi.mock('@/lib/api', () => ({
    personalLoansAPI: { addRepayment: vi.fn().mockResolvedValue({ data: { loan: {}, repayment: {} } }) },
}));

const loan = { id: 'l1', counterparty_name: 'Priya', direction: 'lent', outstanding_amount: 4000 };

beforeEach(() => vi.clearAllMocks());

describe('RepaymentModal', () => {
    it('pre-fills the amount with the full outstanding balance', () => {
        render(<RepaymentModal isOpen onClose={vi.fn()} onSuccess={vi.fn()} loan={loan} />);
        expect(screen.getByLabelText(/amount/i)).toHaveValue(4000);
    });

    it('submits a partial repayment for the entered amount and date', async () => {
        const onSuccess = vi.fn();
        render(<RepaymentModal isOpen onClose={vi.fn()} onSuccess={onSuccess} loan={loan} />);
        fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '1000' } });
        fireEvent.change(screen.getByLabelText(/date/i), { target: { value: '2026-09-14' } });
        fireEvent.click(screen.getByRole('button', { name: /record repayment/i }));

        await waitFor(() => expect(personalLoansAPI.addRepayment).toHaveBeenCalledWith('l1',
            expect.objectContaining({ amount: 1000, date: '2026-09-14' })
        ));
        await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    });

    it('does not let the amount exceed the outstanding balance', async () => {
        render(<RepaymentModal isOpen onClose={vi.fn()} onSuccess={vi.fn()} loan={loan} />);
        fireEvent.change(screen.getByLabelText(/amount/i), { target: { value: '9000' } });
        fireEvent.click(screen.getByRole('button', { name: /record repayment/i }));
        expect(personalLoansAPI.addRepayment).not.toHaveBeenCalled();
        expect(screen.getByText(/exceed/i)).toBeInTheDocument();
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run components/personal-loans/RepaymentModal.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
'use client';

import { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/Modal';
import { DatePicker } from '@/components/ui/DatePicker';
import { personalLoansAPI } from '@/lib/api';
import { toast } from '@/store/toastStore';

interface LoanLike {
    id: string;
    counterparty_name: string;
    direction: 'lent' | 'borrowed';
    outstanding_amount: number;
}

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    loan: LoanLike | null;
}

const labelStyle: React.CSSProperties = { fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-secondary)', display: 'block', marginBottom: '8px', fontFamily: 'var(--font-body)' };
const inputBase: React.CSSProperties = { width: '100%', background: 'var(--glass-fill-1)', color: 'var(--text-primary)', border: '1px solid var(--glass-border)', borderRadius: '10px', fontSize: '0.875rem', fontFamily: 'var(--font-body)', outline: 'none', padding: '10px 12px', boxSizing: 'border-box' };

export function RepaymentModal({ isOpen, onClose, onSuccess, loan }: Props) {
    const [amount, setAmount] = useState('');
    const [date, setDate] = useState(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }));
    const [notes, setNotes] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (isOpen && loan) {
            setAmount(String(loan.outstanding_amount));
            setDate(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }));
            setNotes(''); setError('');
        }
    }, [isOpen, loan]);

    if (!loan) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        const value = parseFloat(amount);
        if (!value || value <= 0) return;
        if (value > loan.outstanding_amount + 0.01) {
            setError(`Amount can't exceed the ₹${loan.outstanding_amount.toLocaleString('en-IN')} outstanding.`);
            return;
        }
        setLoading(true);
        try {
            await personalLoansAPI.addRepayment(loan.id, { amount: value, date, notes: notes || undefined });
            toast.success('Repayment recorded');
            onSuccess(); onClose();
        } catch (err: any) {
            setError(err.response?.data?.error || 'Something went wrong.');
        } finally {
            setLoading(false);
        }
    };

    const verb = loan.direction === 'lent' ? 'from' : 'to';

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Record repayment ${verb} ${loan.counterparty_name}`}
            footer={
                <button type="submit" form="repayment-form" disabled={loading}
                    style={{ width: '100%', height: '48px', border: 'none', borderRadius: 'var(--radius-md)', background: 'var(--accent)', color: 'white', fontSize: '14.5px', fontWeight: 600, cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.7 : 1, fontFamily: 'var(--font-body)' }}>
                    {loading ? 'Saving…' : 'Record repayment'}
                </button>
            }>
            <form id="repayment-form" onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                    <label htmlFor="repay-amount" style={labelStyle}>Amount</label>
                    <input id="repay-amount" type="number" min="0.01" step="any" style={inputBase} value={amount} onChange={e => setAmount(e.target.value)} required />
                </div>
                <DatePicker label="Date" value={date} onChange={setDate} required />
                <div>
                    <label style={labelStyle}>Notes (optional)</label>
                    <textarea rows={2} style={{ ...inputBase, resize: 'vertical' }} value={notes} onChange={e => setNotes(e.target.value)} />
                </div>
                {error && <div style={{ fontSize: '0.8rem', color: 'var(--color-exp)' }}>{error}</div>}
            </form>
        </Modal>
    );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run components/personal-loans/RepaymentModal.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Type-check and lint**

Run: `cd frontend && npx tsc --noEmit && npx eslint components/personal-loans/RepaymentModal.tsx`
Expected: clean

- [ ] **Step 6: Commit**

```bash
git add frontend/components/personal-loans/RepaymentModal.tsx frontend/components/personal-loans/RepaymentModal.test.tsx
git commit -m "feat(personal-loans): repayment modal"
```

---

### Task 10: Frontend — list page

**Files:**
- Create: `frontend/app/personal-loans/page.tsx`

No dedicated test file for this task: this repo does not unit-test `page.tsx` files directly (only `frontend/app/routing.test.ts`, a repo-wide redirect/tab contract test, touches the `app/` tree) — the meaningful logic already has coverage via `PersonalLoanModal.test.tsx` and `RepaymentModal.test.tsx`. Manual verification happens in Task 11.

- [ ] **Step 1: Implement**

```tsx
'use client';

import { useEffect, useState, useCallback } from 'react';
import { HandCoins, Plus, Trash2, Ban } from 'lucide-react';
import { personalLoansAPI } from '@/lib/api';
import { GCard } from '@/components/ui/GCard';
import { Badge } from '@/components/ui/Badge';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Skeleton, SkeletonText } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { PersonalLoanModal } from '@/components/personal-loans/PersonalLoanModal';
import { RepaymentModal } from '@/components/personal-loans/RepaymentModal';
import { toast } from '@/store/toastStore';

type Loan = {
    id: string; direction: 'lent' | 'borrowed'; counterparty_name: string;
    principal_amount: number; repaid_amount: number; outstanding_amount: number;
    due_date: string | null; status: 'outstanding' | 'partially_repaid' | 'repaid' | 'written_off';
};

const STATUS_LABEL: Record<Loan['status'], string> = {
    outstanding: 'Outstanding', partially_repaid: 'Partially repaid', repaid: 'Repaid', written_off: 'Written off',
};

function isOverdue(loan: Loan) {
    if (!loan.due_date || loan.status === 'repaid' || loan.status === 'written_off') return false;
    return new Date(loan.due_date) < new Date(new Date().toDateString());
}

function LoanRow({ loan, onRepay, onWriteOff, onDelete }: { loan: Loan; onRepay: (l: Loan) => void; onWriteOff: (l: Loan) => void; onDelete: (l: Loan) => void }) {
    const pct = loan.principal_amount > 0 ? (loan.repaid_amount / loan.principal_amount) * 100 : 0;
    const settled = loan.status === 'repaid' || loan.status === 'written_off';
    return (
        <GCard style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '15px', color: 'var(--text-primary)' }}>{loan.counterparty_name}</div>
                    <div style={{ display: 'flex', gap: '6px', marginTop: '4px', alignItems: 'center' }}>
                        <Badge>{STATUS_LABEL[loan.status]}</Badge>
                        {isOverdue(loan) && <Badge color="var(--color-exp)" bg="var(--color-exp-subtle)">Overdue</Badge>}
                    </div>
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '18px', fontWeight: 700, color: loan.direction === 'lent' ? 'var(--color-inc)' : 'var(--color-exp)', fontVariantNumeric: 'tabular-nums' }}>
                    ₹{Math.round(loan.outstanding_amount).toLocaleString('en-IN')}
                </div>
            </div>
            {!settled && <ProgressBar pct={pct} />}
            {!settled && (
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => onRepay(loan)} style={{ flex: 1, padding: '8px 0', borderRadius: 'var(--radius-md)', border: '1px solid var(--accent-border)', background: 'var(--accent-subtle)', color: 'var(--accent)', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                        Record repayment
                    </button>
                    <button onClick={() => onWriteOff(loan)} aria-label="Write off" style={{ width: 36, borderRadius: 'var(--radius-md)', border: '1px solid var(--glass-border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer' }}>
                        <Ban size={15} />
                    </button>
                </div>
            )}
            {settled && (
                <button onClick={() => onDelete(loan)} aria-label="Delete" style={{ alignSelf: 'flex-end', border: 'none', background: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                    <Trash2 size={14} />
                </button>
            )}
        </GCard>
    );
}

export default function PersonalLoansPage() {
    const [loans, setLoans] = useState<Loan[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAdd, setShowAdd] = useState(false);
    const [repayLoan, setRepayLoan] = useState<Loan | null>(null);

    const refresh = useCallback(() => {
        setLoading(true);
        personalLoansAPI.getAll()
            .then(res => setLoans(res.data.loans || []))
            .catch(() => toast.error('Could not load personal loans'))
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => { refresh(); }, [refresh]);

    const handleWriteOff = async (loan: Loan) => {
        try {
            await personalLoansAPI.writeOff(loan.id);
            toast.success('Marked as written off');
            refresh();
        } catch { toast.error('Could not write off this loan'); }
    };

    const handleDelete = async (loan: Loan) => {
        try {
            await personalLoansAPI.delete(loan.id);
            toast.success('Deleted');
            refresh();
        } catch { toast.error('Could not delete'); }
    };

    const active = loans.filter(l => l.status === 'outstanding' || l.status === 'partially_repaid');
    const settled = loans.filter(l => l.status === 'repaid' || l.status === 'written_off');
    const owedToYou = active.filter(l => l.direction === 'lent');
    const youOwe = active.filter(l => l.direction === 'borrowed');

    return (
        <div style={{ maxWidth: '640px', margin: '0 auto', padding: 'var(--space-6) var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: 800, color: 'var(--text-primary)' }}>Personal Loans</h1>
                <button onClick={() => setShowAdd(true)} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--accent)', color: 'white', fontWeight: 600, fontSize: '13px', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                    <Plus size={15} /> Add
                </button>
            </div>

            {loading ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <Skeleton height={80} /><Skeleton height={80} />
                </div>
            ) : loans.length === 0 ? (
                <EmptyState icon={HandCoins} title="No personal loans yet" subtitle="Track money you've lent to or borrowed from friends and family." />
            ) : (
                <>
                    {owedToYou.length > 0 && (
                        <section>
                            <h2 style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '10px' }}>Owed to you</h2>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {owedToYou.map(l => <LoanRow key={l.id} loan={l} onRepay={setRepayLoan} onWriteOff={handleWriteOff} onDelete={handleDelete} />)}
                            </div>
                        </section>
                    )}
                    {youOwe.length > 0 && (
                        <section>
                            <h2 style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '10px' }}>You owe</h2>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {youOwe.map(l => <LoanRow key={l.id} loan={l} onRepay={setRepayLoan} onWriteOff={handleWriteOff} onDelete={handleDelete} />)}
                            </div>
                        </section>
                    )}
                    {settled.length > 0 && (
                        <section>
                            <h2 style={{ fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '10px' }}>Settled</h2>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {settled.map(l => <LoanRow key={l.id} loan={l} onRepay={setRepayLoan} onWriteOff={handleWriteOff} onDelete={handleDelete} />)}
                            </div>
                        </section>
                    )}
                </>
            )}

            <PersonalLoanModal isOpen={showAdd} onClose={() => setShowAdd(false)} onSuccess={refresh} />
            <RepaymentModal isOpen={!!repayLoan} onClose={() => setRepayLoan(null)} onSuccess={refresh} loan={repayLoan} />
        </div>
    );
}
```

- [ ] **Step 2: Type-check and lint**

Run: `cd frontend && npx tsc --noEmit && npx eslint app/personal-loans/page.tsx`
Expected: clean — if `HandCoins` isn't exported by the installed `lucide-react` version, substitute an icon that is (check `frontend/components/**/*.tsx` for an existing `from 'lucide-react'` import list to confirm available icon names before guessing).

- [ ] **Step 3: Commit**

```bash
git add frontend/app/personal-loans/page.tsx
git commit -m "feat(personal-loans): list page"
```

---

### Task 11: Manual verification + navigation entry

**Files:**
- Modify: whichever file defines the app's sidebar/bottom-nav link list (find it: `grep -rl "goals" frontend/components/layout/` — likely `AppLayout.tsx` or a dedicated nav-items file, per the component table in `DESIGN.md`).

- [ ] **Step 1: Add a nav entry**

Find where `/goals` (or another similar single-purpose page) is registered in the app's navigation component. Add a `/personal-loans` entry next to it, following the exact same object shape (icon, label, href) already used there. Use `HandCoins` (or whatever icon Task 10 settled on) for consistency.

- [ ] **Step 2: Run both apps and walk the golden path**

Run: `cd backend && npm run dev` and `cd frontend && npm run dev`.

In the browser:
1. Navigate to `/personal-loans` — empty state renders.
2. Add a loan: direction "Lent", "Priya", ₹5,000, today's date, an account selected → appears under "Owed to you", account balance (check `/accounts`) reflects the ₹5,000 decrease, and the transaction shows in `/transactions` but is excluded from the dashboard's spending total.
3. Record a partial repayment of ₹2,000 → status becomes "Partially repaid", progress bar updates, account balance increases by ₹2,000, and this transaction is also excluded from income totals.
4. Record the remaining ₹3,000 → status becomes "Repaid", moves to "Settled".
5. Add a second loan with direction "Borrowed" and no account → appears under "You owe" with no linked transaction; confirm nothing changed on `/accounts` or `/transactions` for it.
6. Write off a loan → moves to "Settled" as "Written off"; confirm `/api/analytics/networth` no longer counts it.
7. Check `/analytics` (or wherever net worth is displayed) reflects the outstanding lent amount as an asset and the outstanding borrowed amount as a liability.
8. Delete a settled loan → disappears from the list; confirm its linked transaction(s), if any, are gone from `/transactions` too (not orphaned).

- [ ] **Step 2: Run the full test suites one final time**

Run: `cd backend && npx jest`
Run: `cd frontend && npx vitest run`
Expected: both fully green.

- [ ] **Step 3: Commit** (only if Step 1's nav edit wasn't already committed as part of it)

```bash
git add <the nav file you edited>
git commit -m "feat(personal-loans): add navigation entry"
```

---

---

### Task 12 (added post-review): Loan detail / repayment-history view

Tasks 1–11 shipped a fully working feature, but the list page (Task 10) only ever showed inline actions — nothing calls the already-built `GET /api/personal-loans/:id` (returns `{loan, repayments}`) or `personalLoansAPI.get(id)`, so a user can never see a loan's full repayment history, only its current outstanding total. This task closes that gap.

**Files:**
- Create: `frontend/components/personal-loans/LoanDetailModal.tsx`
- Test: `frontend/components/personal-loans/LoanDetailModal.test.tsx`
- Modify: `frontend/app/personal-loans/page.tsx` (wire a click on each `LoanRow`'s header area to open the detail modal)

**Behavior:** A read-only modal, opened by tapping a loan's counterparty name/badge area (not its action buttons) in the list page. On open, fetches `personalLoansAPI.get(loanId)` and shows: status badge, outstanding amount (tinted by direction), a progress bar for active loans, a principal/repaid/date-given/due-date grid, interest info when not `'none'`, notes when present, and a repayment history list (date, amount, notes per entry; an empty-state line when there are none). Footer has a "Record repayment" button for non-settled loans that closes the detail modal and hands the loaded loan to the list page's existing `RepaymentModal` flow (via an `onRepay` callback) — settled loans get no footer button. All money fields are Postgres NUMERIC strings, same discipline as every other component in this feature: normalize via a local `num()` helper before any arithmetic/formatting.

- [ ] **Step 1: Write the failing tests** (`frontend/components/personal-loans/LoanDetailModal.test.tsx`)
```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { LoanDetailModal } from './LoanDetailModal';
import { personalLoansAPI } from '@/lib/api';

vi.mock('@/lib/api', () => ({
    personalLoansAPI: { get: vi.fn() },
}));

const loan = {
    id: 'l1', direction: 'lent' as const, counterparty_name: 'Priya',
    principal_amount: '5000.00', repaid_amount: '1000.00', outstanding_amount: '4000.00',
    date_given: '2026-09-01', due_date: '2026-10-01', interest_type: 'none' as const, interest_rate: null, notes: 'For rent',
    status: 'partially_repaid' as const,
};

beforeEach(() => vi.clearAllMocks());

describe('LoanDetailModal', () => {
    it('fetches and displays loan details and repayment history when opened', async () => {
        (personalLoansAPI.get as any).mockResolvedValue({ data: { loan, repayments: [{ id: 'r1', amount: '1000.00', date: '2026-09-15', notes: null }] } });
        render(<LoanDetailModal isOpen loanId="l1" onClose={vi.fn()} onRepay={vi.fn()} />);

        await waitFor(() => expect(screen.getByText('Priya')).toBeInTheDocument());
        expect(personalLoansAPI.get).toHaveBeenCalledWith('l1');
        expect(screen.getByText('₹4,000')).toBeInTheDocument();
        expect(screen.getByText('₹1,000')).toBeInTheDocument();
    });

    it('shows an empty state when there are no repayments yet', async () => {
        (personalLoansAPI.get as any).mockResolvedValue({ data: { loan: { ...loan, repaid_amount: '0', outstanding_amount: '5000.00', status: 'outstanding' }, repayments: [] } });
        render(<LoanDetailModal isOpen loanId="l1" onClose={vi.fn()} onRepay={vi.fn()} />);
        await waitFor(() => expect(screen.getByText(/no repayments yet/i)).toBeInTheDocument());
    });

    it('calls onRepay with the loaded loan and closes when "Record repayment" is clicked', async () => {
        (personalLoansAPI.get as any).mockResolvedValue({ data: { loan, repayments: [] } });
        const onRepay = vi.fn();
        const onClose = vi.fn();
        render(<LoanDetailModal isOpen loanId="l1" onClose={onClose} onRepay={onRepay} />);
        await waitFor(() => expect(screen.getByText('Priya')).toBeInTheDocument());
        fireEvent.click(screen.getByRole('button', { name: /record repayment/i }));
        expect(onRepay).toHaveBeenCalledWith(expect.objectContaining({ id: 'l1' }));
        expect(onClose).toHaveBeenCalled();
    });

    it('hides the "Record repayment" footer button for a settled loan', async () => {
        (personalLoansAPI.get as any).mockResolvedValue({ data: { loan: { ...loan, status: 'repaid' }, repayments: [] } });
        render(<LoanDetailModal isOpen loanId="l1" onClose={vi.fn()} onRepay={vi.fn()} />);
        await waitFor(() => expect(screen.getByText('Priya')).toBeInTheDocument());
        expect(screen.queryByRole('button', { name: /record repayment/i })).not.toBeInTheDocument();
    });

    it('does nothing when loanId is null', () => {
        render(<LoanDetailModal isOpen loanId={null} onClose={vi.fn()} onRepay={vi.fn()} />);
        expect(personalLoansAPI.get).not.toHaveBeenCalled();
    });
});
```

- [ ] **Step 2: Run tests to verify they fail** — `cd frontend && npx vitest run components/personal-loans/LoanDetailModal.test.tsx` — module not found.

- [ ] **Step 3: Implement `frontend/components/personal-loans/LoanDetailModal.tsx`**
```tsx
'use client';

import { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Skeleton } from '@/components/ui/Skeleton';
import { personalLoansAPI } from '@/lib/api';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    loanId: string | null;
    onRepay: (loan: Loan) => void;
}

type Loan = {
    id: string; direction: 'lent' | 'borrowed'; counterparty_name: string;
    principal_amount: number | string; repaid_amount: number | string; outstanding_amount: number | string;
    date_given: string; due_date: string | null; interest_type: 'none' | 'flat' | 'percent_per_month';
    interest_rate: number | string | null; notes: string | null;
    status: 'outstanding' | 'partially_repaid' | 'repaid' | 'written_off';
};

type Repayment = { id: string; amount: number | string; date: string; notes: string | null };

const STATUS_LABEL: Record<Loan['status'], string> = {
    outstanding: 'Outstanding', partially_repaid: 'Partially repaid', repaid: 'Repaid', written_off: 'Written off',
};

// Same discipline as every other component in this feature: principal/repaid/
// outstanding/interest_rate arrive as Postgres NUMERIC strings, not numbers.
function num(v: number | string | null | undefined): number {
    if (v === null || v === undefined) return 0;
    return typeof v === 'string' ? parseFloat(v) : v;
}

function formatDate(d: string) {
    const date = new Date(d.length === 10 ? d + 'T00:00:00' : d);
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

const rowLabel: React.CSSProperties = { fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-body)' };
const rowValue: React.CSSProperties = { fontSize: '13px', color: 'var(--text-primary)', fontFamily: 'var(--font-body)', fontWeight: 500 };

export function LoanDetailModal({ isOpen, onClose, loanId, onRepay }: Props) {
    const [loan, setLoan] = useState<Loan | null>(null);
    const [repayments, setRepayments] = useState<Repayment[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!isOpen || !loanId) { setLoan(null); setRepayments([]); return; }
        setLoading(true); setError('');
        personalLoansAPI.get(loanId)
            .then(res => { setLoan(res.data.loan); setRepayments(res.data.repayments || []); })
            .catch(() => setError('Could not load this loan.'))
            .finally(() => setLoading(false));
    }, [isOpen, loanId]);

    const settled = loan?.status === 'repaid' || loan?.status === 'written_off';
    const principal = num(loan?.principal_amount);
    const repaid = num(loan?.repaid_amount);
    const outstanding = num(loan?.outstanding_amount);
    const pct = principal > 0 ? (repaid / principal) * 100 : 0;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={loan ? loan.counterparty_name : 'Loan details'}
            footer={loan && !settled ? (
                <button type="button" onClick={() => { onRepay(loan); onClose(); }}
                    style={{ width: '100%', height: '48px', border: 'none', borderRadius: 'var(--radius-md)', background: 'var(--accent)', color: 'white', fontSize: '14.5px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                    Record repayment
                </button>
            ) : undefined}>
            {loading ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <Skeleton height={20} /><Skeleton height={60} /><Skeleton height={100} />
                </div>
            ) : error ? (
                <div style={{ fontSize: '0.85rem', color: 'var(--color-exp)' }}>{error}</div>
            ) : loan ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Badge>{STATUS_LABEL[loan.status]}</Badge>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '22px', fontWeight: 700, color: loan.direction === 'lent' ? 'var(--color-inc)' : 'var(--color-exp)', fontVariantNumeric: 'tabular-nums' }}>
                            ₹{Math.round(outstanding).toLocaleString('en-IN')}
                        </div>
                    </div>
                    {!settled && <ProgressBar pct={pct} />}

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <div><span style={rowLabel}>Principal</span><div style={rowValue}>₹{Math.round(principal).toLocaleString('en-IN')}</div></div>
                        <div><span style={rowLabel}>Repaid</span><div style={rowValue}>₹{Math.round(repaid).toLocaleString('en-IN')}</div></div>
                        <div><span style={rowLabel}>Date given</span><div style={rowValue}>{formatDate(loan.date_given)}</div></div>
                        <div><span style={rowLabel}>Due date</span><div style={rowValue}>{loan.due_date ? formatDate(loan.due_date) : '—'}</div></div>
                        {loan.interest_type !== 'none' && (
                            <div>
                                <span style={rowLabel}>Interest</span>
                                <div style={rowValue}>{num(loan.interest_rate)}{loan.interest_type === 'percent_per_month' ? '%/mo' : ' flat'}</div>
                            </div>
                        )}
                    </div>

                    {loan.notes && (
                        <div>
                            <span style={rowLabel}>Notes</span>
                            <div style={{ ...rowValue, fontWeight: 400, marginTop: '4px' }}>{loan.notes}</div>
                        </div>
                    )}

                    <div>
                        <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '8px' }}>Repayment history</div>
                        {repayments.length === 0 ? (
                            <div style={{ fontSize: '13px', color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>No repayments yet.</div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {repayments.map(r => (
                                    <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: 'var(--glass-fill-1)', borderRadius: 'var(--radius-sm)' }}>
                                        <div>
                                            <div style={rowValue}>{formatDate(r.date)}</div>
                                            {r.notes && <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{r.notes}</div>}
                                        </div>
                                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                                            ₹{Math.round(num(r.amount)).toLocaleString('en-IN')}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            ) : null}
        </Modal>
    );
}
```

- [ ] **Step 4: Run tests to verify they pass** — `cd frontend && npx vitest run components/personal-loans/LoanDetailModal.test.tsx` — expect 5/5.

- [ ] **Step 5: Type-check and lint** — `cd frontend && npx tsc --noEmit && npx eslint components/personal-loans/LoanDetailModal.tsx` — expect clean.

- [ ] **Step 6: Wire it into the list page.** In `frontend/app/personal-loans/page.tsx`:
  - Import `LoanDetailModal` and add `const [detailLoanId, setDetailLoanId] = useState<string | null>(null);`.
  - In `LoanRow`, add an `onOpenDetail: (id: string) => void` prop, and make the header info block (the `<div>` currently containing the counterparty name + badges) clickable: add `onClick={() => onOpenDetail(loan.id)}` and `style={{ cursor: 'pointer', ...(existing style) }}` to that div. Do NOT make the whole `GCard` clickable — the action buttons (Record repayment, Write off, Delete/Cancel) are siblings, not descendants of that div, so no `stopPropagation` is needed.
  - Pass `onOpenDetail={setDetailLoanId}` at all three `LoanRow` call sites (owedToYou/youOwe/settled maps).
  - Render `<LoanDetailModal isOpen={!!detailLoanId} onClose={() => setDetailLoanId(null)} loanId={detailLoanId} onRepay={setRepayLoan} />` alongside the existing `PersonalLoanModal`/`RepaymentModal` renders at the bottom of the page.

- [ ] **Step 7: Run full verification** — `cd frontend && npx tsc --noEmit && npx eslint app/personal-loans/page.tsx components/personal-loans/LoanDetailModal.tsx && npx vitest run` (full frontend suite) and `cd backend && npx jest` (full backend suite, unaffected but confirm nothing broke).

- [ ] **Step 8: Commit**
```bash
git add frontend/components/personal-loans/LoanDetailModal.tsx frontend/components/personal-loans/LoanDetailModal.test.tsx frontend/app/personal-loans/page.tsx
git commit -m "feat(personal-loans): loan detail view with repayment history"
```

---

## Self-review

- **Spec coverage:** direction (lent/borrowed), principal/date/due-date/interest/notes fields, partial repayments with history, write-off, account-balance correctness via linked transactions, exclusion from spending/income (both stacks), net worth as asset/liability, due-date reminder notification, and (Task 12) a way to actually see repayment history through the UI — every element from the discussed design has a task. ✔
- **Placeholders:** none — every step has runnable code.
- **Type consistency:** `status` is always one of `outstanding | partially_repaid | repaid | written_off` everywhere it's produced (`deriveStatus`) or consumed (routes, frontend `Loan` type, `STATUS_LABEL`). `direction` is always `lent | borrowed`. `personalLoansAPI`'s method signatures match exactly what the routes in Tasks 4–5 accept. `LoanDetailModal`'s `Loan`/`Repayment` types match the actual `GET /:id` response shape.
- **Known deliberate scope cuts (called out in-line, not oversights):** no reconciliation if the linked transaction is deleted via the generic transactions route (Task 5); no editing of `principal_amount`/`direction`/`account_id` after creation; no per-repayment edit/delete; no tagging of loan-linked transactions beyond the `personal_loan_id` column (no visual "Personal Loan" badge inside the regular transaction list); the detail view (Task 12) is read-only plus a repayment shortcut — no inline edit of counterparty/due-date/interest from the detail modal (still only reachable however a future edit affordance is added) — all consistent with how this codebase already treats investment- and goal-linked transactions.
