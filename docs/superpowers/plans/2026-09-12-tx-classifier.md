# Transaction Classifier (category + payment method suggestions) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Suggest the category and payment method for a transaction being typed into the Add Transaction modal, learned from that user's own history and updated online with every save/edit/delete.

**Architecture:** A per-user multinomial Naive Bayes model (two targets: `category` and `payment`) stored as JSONB in a new `tx_classifier_models` table. Pure math lives in `backend/src/utils/txClassifier.js`; load/save/lock/bootstrap in `backend/src/utils/txClassifierStore.js`. `GET /api/transactions/suggest` predicts; the create/update/delete routes fold labels in after responding. The modal debounces the endpoint and shows category chips (replacing today's name-overlap heuristic once the model has ≥20 samples) and silently pre-selects a confident payment method the user hasn't touched.

**Tech Stack:** Node/Express 5, pg (parameterized SQL), Jest + supertest (backend), Next.js 16 + React 19, Vitest + Testing Library (frontend). No new dependencies.

**Coding rules that apply (from CLAUDE.md / memory):** inline styles only in JSX, CSS variable colors, parameterized SQL, migrations must be idempotent (they replay on every backend start), no emojis in new code.

---

## File structure

| File | Responsibility |
|---|---|
| `backend/src/db/migrations/069_tx_classifier_models.sql` | One row per user: model JSONB + trained count |
| `backend/src/utils/txClassifier.js` | Pure functions: tokenize, featurize, train/untrain, predict, learn |
| `backend/src/utils/txClassifierStore.js` | Load/save/bootstrap, advisory-locked learn/unlearn/relearn, `suggest()` |
| `backend/src/routes/transactions.js` | New `GET /suggest`; hooks in POST/PUT/DELETE |
| `backend/tests/txClassifier.test.js` | Unit tests for the math |
| `backend/tests/txClassifierStore.test.js` | Store tests with mocked pool |
| `backend/tests/transactions.routes.test.js` | Route test for `/suggest`; mock the store so existing tests stay quiet |
| `frontend/lib/api.ts` | `transactionsAPI.suggest` |
| `frontend/components/transactions/TransactionModal.tsx` | Debounced call, chips from model, payment auto-apply |
| `frontend/components/transactions/TransactionModal.test.tsx` | Mock `suggest`; two new tests |

---

### Task 1: Migration

**Files:**
- Create: `backend/src/db/migrations/069_tx_classifier_models.sql`

- [ ] **Step 1: Write the migration**

```sql
CREATE TABLE IF NOT EXISTS tx_classifier_models (
    user_id       UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    model         JSONB NOT NULL DEFAULT '{}',
    trained_count INTEGER NOT NULL DEFAULT 0,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/db/migrations/069_tx_classifier_models.sql
git commit -m "feat(classifier): table for per-user transaction classifier models"
```

---

### Task 2: Classifier math — tokenize and featurize

**Files:**
- Create: `backend/src/utils/txClassifier.js`
- Test: `backend/tests/txClassifier.test.js`

- [ ] **Step 1: Write the failing tests**

```js
const { tokenize, featurize, istHour } = require('../src/utils/txClassifier');

describe('tokenize', () => {
    test('lowercases, splits on punctuation, drops 1-char and numeric tokens, adds bigrams', () => {
        expect(tokenize('Swiggy Order #9182 - late')).toEqual([
            'swiggy', 'order', 'late',
            'swiggy_order', 'order_late',
        ]);
    });

    test('strips trailing digits from merchant-style tokens', () => {
        expect(tokenize('order9182')).toEqual(['order']);
        expect(tokenize('a1 b22')).toEqual([]);
    });

    test('handles empty input', () => {
        expect(tokenize('')).toEqual([]);
        expect(tokenize(undefined)).toEqual([]);
    });
});

describe('istHour', () => {
    test('converts a UTC timestamp to the IST hour', () => {
        expect(istHour('2026-09-12T18:45:00Z')).toBe(0);   // 00:15 IST next day
        expect(istHour('2026-09-12T06:00:00Z')).toBe(11);
    });
    test('returns null for missing/invalid', () => {
        expect(istHour(null)).toBeNull();
        expect(istHour('nope')).toBeNull();
    });
});

describe('featurize', () => {
    test('emits word, amount-bucket, weekday, hour-bucket and type features', () => {
        const f = featurize({ description: 'Swiggy', amount: 450, date: '2026-09-12', type: 'expense', hour: 21 });
        expect(f).toEqual(['w:swiggy', 'amt:8', 'dow:6', 'hr:5', 'type:expense']);
    });

    test('accepts a Date object for date and skips absent fields', () => {
        const f = featurize({ description: 'Rent', amount: 'abc', date: new Date('2026-09-14T00:00:00Z'), type: 'expense' });
        expect(f).toEqual(['w:rent', 'dow:1', 'type:expense']);
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx jest tests/txClassifier.test.js`
Expected: FAIL — `Cannot find module '../src/utils/txClassifier'`

- [ ] **Step 3: Implement tokenize / istHour / featurize**

```js
// Per-user multinomial Naive Bayes over transaction features. Pure functions
// only -- persistence lives in txClassifierStore.js.
const ALPHA = 0.5;
const MIN_SAMPLES = 20;
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function tokenize(description) {
    const words = String(description || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .split(' ')
        .map(w => {
            const stripped = w.replace(/\d+$/, '');
            return stripped.length >= 3 ? stripped : w;
        })
        .filter(w => w.length >= 2 && !/^\d+$/.test(w));
    const bigrams = [];
    for (let i = 0; i < words.length - 1; i++) bigrams.push(`${words[i]}_${words[i + 1]}`);
    return [...words, ...bigrams];
}

function istHour(ts) {
    if (!ts) return null;
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return null;
    return new Date(d.getTime() + IST_OFFSET_MS).getUTCHours();
}

function dateString(date) {
    if (date instanceof Date) return date.toISOString().slice(0, 10);
    return String(date).slice(0, 10);
}

function featurize({ description, amount, date, type, hour }) {
    const features = tokenize(description).map(t => `w:${t}`);
    const amt = parseFloat(amount);
    if (Number.isFinite(amt) && amt > 0) features.push(`amt:${Math.floor(Math.log2(amt))}`);
    if (date) {
        const d = new Date(`${dateString(date)}T00:00:00`);
        if (!Number.isNaN(d.getTime())) features.push(`dow:${d.getDay()}`);
    }
    if (Number.isInteger(hour)) features.push(`hr:${Math.floor(hour / 4)}`);
    if (type) features.push(`type:${type}`);
    return features;
}

module.exports = { ALPHA, MIN_SAMPLES, tokenize, istHour, featurize };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npx jest tests/txClassifier.test.js`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/utils/txClassifier.js backend/tests/txClassifier.test.js
git commit -m "feat(classifier): tokenizer and feature extraction for transactions"
```

---

### Task 3: Classifier math — train, untrain, predict, learn

**Files:**
- Modify: `backend/src/utils/txClassifier.js`
- Test: `backend/tests/txClassifier.test.js`

- [ ] **Step 1: Append failing tests**

```js
const { createModel, createTarget, train, untrain, predict, labelsFor, learn } = require('../src/utils/txClassifier');

describe('train / predict', () => {
    test('predicts the class whose features it has seen', () => {
        const t = createTarget();
        train(t, ['w:swiggy', 'amt:8'], 'food');
        train(t, ['w:zomato', 'amt:8'], 'food');
        train(t, ['w:uber', 'amt:7'], 'travel');
        const out = predict(t, ['w:swiggy']);
        expect(out[0].label).toBe('food');
        expect(out[0].prob).toBeGreaterThan(0.6);
        expect(out.map(o => o.label).sort()).toEqual(['food', 'travel']);
        expect(out.reduce((s, o) => s + o.prob, 0)).toBeCloseTo(1, 6);
    });

    test('ignores features never seen and falls back to class priors', () => {
        const t = createTarget();
        train(t, ['w:a'], 'x');
        train(t, ['w:a'], 'x');
        train(t, ['w:b'], 'y');
        const out = predict(t, ['w:unknown']);
        expect(out[0].label).toBe('x');
    });

    test('returns [] on an empty target', () => {
        expect(predict(createTarget(), ['w:a'])).toEqual([]);
    });

    test('untrain reverses train exactly and prunes empty entries', () => {
        const t = createTarget();
        train(t, ['w:a', 'amt:3'], 'x');
        untrain(t, ['w:a', 'amt:3'], 'x');
        expect(t).toEqual(createTarget());
    });

    test('untrain never drives counts negative', () => {
        const t = createTarget();
        untrain(t, ['w:a'], 'x');
        expect(t).toEqual(createTarget());
    });
});

describe('labelsFor', () => {
    test('uses category_id and (expense-only) payment_method', () => {
        expect(labelsFor({ category_id: 'c1', type: 'expense', payment_method: 'UPI' })).toEqual({ category: 'c1', payment: 'UPI' });
        expect(labelsFor({ category_id: 'c1', type: 'income', payment_method: 'Cash' })).toEqual({ category: 'c1', payment: null });
        expect(labelsFor({ category_id: null, type: 'expense', payment_method: 'UPI' })).toEqual({ category: null, payment: 'UPI' });
    });
    test('skips transfers and card payments entirely', () => {
        expect(labelsFor({ category_id: 'c1', type: 'expense', payment_method: 'UPI', tags: ['transfer'] })).toEqual({ category: null, payment: null });
        expect(labelsFor({ category_id: 'c1', type: 'expense', payment_method: 'UPI', tags: ['credit_card_payment'] })).toEqual({ category: null, payment: null });
    });
});

describe('learn', () => {
    test('trains both targets from a transaction row and sign -1 undoes it', () => {
        const m = createModel();
        const tx = { description: 'Swiggy', amount: '450.00', date: '2026-09-12', type: 'expense', category_id: 'c1', payment_method: 'UPI', created_at: '2026-09-12T15:30:00Z' };
        learn(m, tx);
        expect(m.category.total).toBe(1);
        expect(m.payment.total).toBe(1);
        expect(predict(m.category, featurize({ description: 'swiggy' }))[0].label).toBe('c1');
        learn(m, tx, -1);
        expect(m).toEqual(createModel());
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx jest tests/txClassifier.test.js`
Expected: FAIL — `createModel is not a function`

- [ ] **Step 3: Implement**

Add to `backend/src/utils/txClassifier.js` above `module.exports`, then update the export:

```js
function createTarget() {
    return { classCounts: {}, featureCounts: {}, featureTotals: {}, total: 0 };
}

function createModel() {
    return { version: 1, category: createTarget(), payment: createTarget() };
}

function bump(obj, key, delta) {
    const next = (obj[key] || 0) + delta;
    if (next <= 0) delete obj[key];
    else obj[key] = next;
}

function train(target, features, label, sign = 1) {
    if (!label) return;
    bump(target.classCounts, label, sign);
    target.total = Math.max(0, target.total + sign);
    for (const f of features) {
        const row = target.featureCounts[f] || (target.featureCounts[f] = {});
        bump(row, label, sign);
        if (Object.keys(row).length === 0) delete target.featureCounts[f];
        bump(target.featureTotals, label, sign);
    }
}

function untrain(target, features, label) {
    train(target, features, label, -1);
}

function predict(target, features) {
    const labels = Object.keys(target.classCounts);
    if (labels.length === 0) return [];
    const vocab = Object.keys(target.featureCounts).length;
    const known = features.filter(f => target.featureCounts[f]);
    const logs = labels.map(label => {
        let lp = Math.log((target.classCounts[label] + ALPHA) / (target.total + ALPHA * labels.length));
        const denom = (target.featureTotals[label] || 0) + ALPHA * vocab;
        for (const f of known) lp += Math.log(((target.featureCounts[f][label] || 0) + ALPHA) / denom);
        return lp;
    });
    const max = Math.max(...logs);
    const exps = logs.map(l => Math.exp(l - max));
    const sum = exps.reduce((a, b) => a + b, 0);
    return labels
        .map((label, i) => ({ label, prob: exps[i] / sum }))
        .sort((a, b) => b.prob - a.prob);
}

function labelsFor(tx) {
    const tags = tx.tags || [];
    if (tags.includes('transfer') || tags.includes('credit_card_payment')) return { category: null, payment: null };
    return {
        category: tx.category_id ? String(tx.category_id) : null,
        payment: tx.type === 'expense' && tx.payment_method ? tx.payment_method : null,
    };
}

function learn(model, tx, sign = 1) {
    const features = featurize({
        description: tx.description, amount: tx.amount, date: tx.date, type: tx.type,
        hour: istHour(tx.created_at),
    });
    const { category, payment } = labelsFor(tx);
    train(model.category, features, category, sign);
    train(model.payment, features, payment, sign);
}

module.exports = {
    ALPHA, MIN_SAMPLES,
    tokenize, istHour, featurize,
    createModel, createTarget, train, untrain, predict, labelsFor, learn,
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npx jest tests/txClassifier.test.js`
Expected: PASS (15 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/utils/txClassifier.js backend/tests/txClassifier.test.js
git commit -m "feat(classifier): naive bayes train/untrain/predict with online updates"
```

---

### Task 4: Store — load, save, bootstrap, suggest

**Files:**
- Create: `backend/src/utils/txClassifierStore.js`
- Test: `backend/tests/txClassifierStore.test.js`

- [ ] **Step 1: Write the failing tests**

```js
const { loadModel, saveModel, bootstrapModel, suggest } = require('../src/utils/txClassifierStore');
const { createModel, learn } = require('../src/utils/txClassifier');

function mockPool() {
    return { query: jest.fn(), connect: jest.fn() };
}

const HISTORY = Array.from({ length: 25 }, (_, i) => ({
    description: i % 2 ? 'Swiggy' : 'Uber',
    amount: i % 2 ? '450' : '180',
    date: '2026-09-01', type: 'expense',
    category_id: i % 2 ? 'food' : 'travel',
    payment_method: i % 2 ? 'UPI' : 'Cash',
    tags: [], created_at: '2026-09-01T12:00:00Z',
}));

describe('loadModel', () => {
    test('returns null when there is no row', async () => {
        const pool = mockPool();
        pool.query.mockResolvedValueOnce({ rows: [] });
        expect(await loadModel(pool, 'u1')).toBeNull();
    });
    test('returns model and trainedCount', async () => {
        const pool = mockPool();
        pool.query.mockResolvedValueOnce({ rows: [{ model: { version: 1 }, trained_count: 7 }] });
        expect(await loadModel(pool, 'u1')).toEqual({ model: { version: 1 }, trainedCount: 7 });
    });
});

describe('saveModel', () => {
    test('upserts serialized JSON with the count', async () => {
        const pool = mockPool();
        pool.query.mockResolvedValueOnce({ rows: [] });
        await saveModel(pool, 'u1', { a: 1 }, 3);
        const [sql, params] = pool.query.mock.calls[0];
        expect(sql).toMatch(/ON CONFLICT \(user_id\)/);
        expect(params).toEqual(['u1', '{"a":1}', 3]);
    });
});

describe('bootstrapModel', () => {
    test('trains on history and saves', async () => {
        const pool = mockPool();
        pool.query
            .mockResolvedValueOnce({ rows: HISTORY })   // history select
            .mockResolvedValueOnce({ rows: [] });       // save
        const { model, trainedCount } = await bootstrapModel(pool, 'u1');
        expect(trainedCount).toBe(25);
        expect(model.category.total).toBe(25);
        expect(pool.query.mock.calls[1][0]).toMatch(/INSERT INTO tx_classifier_models/);
    });
});

describe('suggest', () => {
    test('is not ready below MIN_SAMPLES', async () => {
        const pool = mockPool();
        const model = createModel();
        learn(model, HISTORY[0]);
        pool.query.mockResolvedValueOnce({ rows: [{ model, trained_count: 1 }] });
        const out = await suggest(pool, 'u1', { description: 'swiggy', type: 'expense' });
        expect(out).toEqual({ ready: false, trained: 1, category: [], payment_method: [] });
    });

    test('predicts category and payment when ready', async () => {
        const pool = mockPool();
        const model = createModel();
        HISTORY.forEach(tx => learn(model, tx));
        pool.query.mockResolvedValueOnce({ rows: [{ model, trained_count: 25 }] });
        const out = await suggest(pool, 'u1', { description: 'swiggy order', amount: 450, type: 'expense' });
        expect(out.ready).toBe(true);
        expect(out.category[0]).toEqual({ id: 'food', prob: expect.any(Number) });
        expect(out.category[0].prob).toBeGreaterThan(0.7);
        expect(out.payment_method[0].method).toBe('UPI');
    });

    test('bootstraps when no model row exists', async () => {
        const pool = mockPool();
        pool.query
            .mockResolvedValueOnce({ rows: [] })          // loadModel
            .mockResolvedValueOnce({ rows: HISTORY })     // history
            .mockResolvedValueOnce({ rows: [] });         // save
        const out = await suggest(pool, 'u1', { description: 'uber', type: 'expense' });
        expect(out.ready).toBe(true);
        expect(out.category[0].id).toBe('travel');
    });

    test('omits payment suggestions for income', async () => {
        const pool = mockPool();
        const model = createModel();
        HISTORY.forEach(tx => learn(model, tx));
        pool.query.mockResolvedValueOnce({ rows: [{ model, trained_count: 25 }] });
        const out = await suggest(pool, 'u1', { description: 'salary', type: 'income' });
        expect(out.payment_method).toEqual([]);
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx jest tests/txClassifierStore.test.js`
Expected: FAIL — `Cannot find module '../src/utils/txClassifierStore'`

- [ ] **Step 3: Implement the store (read side)**

```js
const { createModel, learn, featurize, predict, MIN_SAMPLES } = require('./txClassifier');

const BOOTSTRAP_LIMIT = 5000;

async function loadModel(db, userId) {
    const { rows } = await db.query(
        'SELECT model, trained_count FROM tx_classifier_models WHERE user_id = $1',
        [userId]
    );
    if (!rows.length) return null;
    return { model: rows[0].model, trainedCount: rows[0].trained_count };
}

async function saveModel(db, userId, model, trainedCount) {
    await db.query(
        `INSERT INTO tx_classifier_models (user_id, model, trained_count, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (user_id) DO UPDATE
           SET model = EXCLUDED.model, trained_count = EXCLUDED.trained_count, updated_at = NOW()`,
        [userId, JSON.stringify(model), trainedCount]
    );
}

async function bootstrapModel(db, userId) {
    const { rows } = await db.query(
        `SELECT description, amount, date, type, category_id, payment_method, tags, created_at
         FROM transactions WHERE user_id = $1
         ORDER BY created_at DESC LIMIT $2`,
        [userId, BOOTSTRAP_LIMIT]
    );
    const model = createModel();
    for (const tx of rows) learn(model, tx);
    await saveModel(db, userId, model, rows.length);
    return { model, trainedCount: rows.length };
}

async function getOrBootstrapModel(db, userId) {
    return (await loadModel(db, userId)) || bootstrapModel(db, userId);
}

const round2 = n => Math.round(n * 100) / 100;

async function suggest(pool, userId, input) {
    const { model, trainedCount } = await getOrBootstrapModel(pool, userId);
    const ready = trainedCount >= MIN_SAMPLES;
    if (!ready) return { ready: false, trained: trainedCount, category: [], payment_method: [] };
    const features = featurize(input);
    return {
        ready: true,
        trained: trainedCount,
        category: predict(model.category, features).slice(0, 3)
            .map(p => ({ id: p.label, prob: round2(p.prob) })),
        payment_method: input.type === 'expense'
            ? predict(model.payment, features).slice(0, 2).map(p => ({ method: p.label, prob: round2(p.prob) }))
            : [],
    };
}

module.exports = { BOOTSTRAP_LIMIT, loadModel, saveModel, bootstrapModel, getOrBootstrapModel, suggest };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npx jest tests/txClassifierStore.test.js`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/utils/txClassifierStore.js backend/tests/txClassifierStore.test.js
git commit -m "feat(classifier): model store with history bootstrap and suggest()"
```

---

### Task 5: Store — locked learn / unlearn / relearn

**Files:**
- Modify: `backend/src/utils/txClassifierStore.js`
- Test: `backend/tests/txClassifierStore.test.js`

- [ ] **Step 1: Append failing tests**

```js
const { learnTransaction, unlearnTransaction, relearnTransaction } = require('../src/utils/txClassifierStore');

function mockClient(queue) {
    const client = { query: jest.fn(), release: jest.fn() };
    for (const r of queue) client.query.mockResolvedValueOnce(r);
    return client;
}

const TX = { description: 'Swiggy', amount: '450', date: '2026-09-12', type: 'expense', category_id: 'food', payment_method: 'UPI', tags: [], created_at: '2026-09-12T12:00:00Z' };

describe('learnTransaction', () => {
    test('takes the per-user advisory lock, folds the tx in, saves, commits', async () => {
        const model = createModel();
        const client = mockClient([
            { rows: [] },                                       // BEGIN
            { rows: [] },                                       // advisory lock
            { rows: [{ model, trained_count: 30 }] },           // loadModel
            { rows: [] },                                       // saveModel
            { rows: [] },                                       // COMMIT
        ]);
        const pool = { connect: jest.fn().mockResolvedValue(client) };

        await learnTransaction(pool, 'u1', TX);

        expect(client.query.mock.calls[1][0]).toMatch(/pg_advisory_xact_lock/);
        expect(client.query.mock.calls[1][1]).toEqual(['txclf:u1']);
        const saved = JSON.parse(client.query.mock.calls[3][1][1]);
        expect(saved.category.total).toBe(1);
        expect(client.query.mock.calls[3][1][2]).toBe(31);
        expect(client.query.mock.calls[4][0]).toBe('COMMIT');
        expect(client.release).toHaveBeenCalled();
    });

    test('does not double-count when it had to bootstrap (history already contains the row)', async () => {
        const client = mockClient([
            { rows: [] }, { rows: [] },
            { rows: [] },                    // loadModel -> none
            { rows: [TX] },                  // bootstrap history select
            { rows: [] },                    // bootstrap save
            { rows: [] },                    // COMMIT
        ]);
        const pool = { connect: jest.fn().mockResolvedValue(client) };

        await learnTransaction(pool, 'u1', TX);

        const saves = client.query.mock.calls.filter(c => /INSERT INTO tx_classifier_models/.test(c[0]));
        expect(saves).toHaveLength(1);
        expect(saves[0][1][2]).toBe(1);
    });

    test('rolls back and rethrows on error', async () => {
        const client = mockClient([{ rows: [] }, { rows: [] }]);
        client.query.mockRejectedValueOnce(new Error('boom'));
        client.query.mockResolvedValueOnce({ rows: [] }); // ROLLBACK
        const pool = { connect: jest.fn().mockResolvedValue(client) };

        await expect(learnTransaction(pool, 'u1', TX)).rejects.toThrow('boom');
        expect(client.query.mock.calls.at(-1)[0]).toBe('ROLLBACK');
        expect(client.release).toHaveBeenCalled();
    });
});

describe('unlearnTransaction', () => {
    test('subtracts the tx and decrements the count (floored at 0)', async () => {
        const model = createModel();
        learn(model, TX);
        const client = mockClient([{ rows: [] }, { rows: [] }, { rows: [{ model, trained_count: 1 }] }, { rows: [] }, { rows: [] }]);
        const pool = { connect: jest.fn().mockResolvedValue(client) };

        await unlearnTransaction(pool, 'u1', TX);

        const saved = JSON.parse(client.query.mock.calls[3][1][1]);
        expect(saved).toEqual(createModel());
        expect(client.query.mock.calls[3][1][2]).toBe(0);
    });
});

describe('relearnTransaction', () => {
    test('swaps the old row for the new one without changing the count', async () => {
        const model = createModel();
        learn(model, TX);
        const client = mockClient([{ rows: [] }, { rows: [] }, { rows: [{ model, trained_count: 1 }] }, { rows: [] }, { rows: [] }]);
        const pool = { connect: jest.fn().mockResolvedValue(client) };

        await relearnTransaction(pool, 'u1', TX, { ...TX, category_id: 'travel' });

        const saved = JSON.parse(client.query.mock.calls[3][1][1]);
        expect(Object.keys(saved.category.classCounts)).toEqual(['travel']);
        expect(client.query.mock.calls[3][1][2]).toBe(1);
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx jest tests/txClassifierStore.test.js`
Expected: FAIL — `learnTransaction is not a function`

- [ ] **Step 3: Implement the write side**

Add to `backend/src/utils/txClassifierStore.js` before `module.exports`, then extend the export:

```js
// Serialises read-modify-write per user so two saves landing together (e.g.
// a fast double-submit) can't drop each other's counts. If no model row exists
// yet, bootstrapping from history already reflects the row being learned or
// unlearned, so `fresh` tells fn to skip its own adjustment.
async function withModelLock(pool, userId, fn) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`txclf:${userId}`]);
        const stored = await loadModel(client, userId);
        const state = stored || await bootstrapModel(client, userId);
        if (stored) await fn(state, client);
        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

function learnTransaction(pool, userId, tx) {
    return withModelLock(pool, userId, async ({ model, trainedCount }, client) => {
        learn(model, tx, 1);
        await saveModel(client, userId, model, trainedCount + 1);
    });
}

function unlearnTransaction(pool, userId, tx) {
    return withModelLock(pool, userId, async ({ model, trainedCount }, client) => {
        learn(model, tx, -1);
        await saveModel(client, userId, model, Math.max(0, trainedCount - 1));
    });
}

function relearnTransaction(pool, userId, before, after) {
    return withModelLock(pool, userId, async ({ model, trainedCount }, client) => {
        learn(model, before, -1);
        learn(model, after, 1);
        await saveModel(client, userId, model, trainedCount);
    });
}

// Routes call these after responding; the model is a convenience, never a
// reason to fail or slow a write.
function learnInBackground(pool, userId, tx) {
    setImmediate(() => learnTransaction(pool, userId, tx).catch(err => console.error('[TxClassifier] learn failed:', err.message)));
}
function unlearnInBackground(pool, userId, tx) {
    setImmediate(() => unlearnTransaction(pool, userId, tx).catch(err => console.error('[TxClassifier] unlearn failed:', err.message)));
}
function relearnInBackground(pool, userId, before, after) {
    setImmediate(() => relearnTransaction(pool, userId, before, after).catch(err => console.error('[TxClassifier] relearn failed:', err.message)));
}

module.exports = {
    BOOTSTRAP_LIMIT, loadModel, saveModel, bootstrapModel, getOrBootstrapModel, suggest,
    learnTransaction, unlearnTransaction, relearnTransaction,
    learnInBackground, unlearnInBackground, relearnInBackground,
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npx jest tests/txClassifierStore.test.js`
Expected: PASS (13 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/utils/txClassifierStore.js backend/tests/txClassifierStore.test.js
git commit -m "feat(classifier): advisory-locked online learn/unlearn/relearn"
```

---

### Task 6: `GET /api/transactions/suggest` + learning hooks

**Files:**
- Modify: `backend/src/routes/transactions.js`
- Test: `backend/tests/transactions.routes.test.js`

- [ ] **Step 1: Mock the store at the top of the existing route test file**

Insert after the existing `jest.mock('../src/utils/fcm', ...)` block in `backend/tests/transactions.routes.test.js`:

```js
jest.mock('../src/utils/txClassifierStore', () => ({
    suggest: jest.fn(),
    learnInBackground: jest.fn(),
    unlearnInBackground: jest.fn(),
    relearnInBackground: jest.fn(),
}));
```

And add near the other requires:

```js
const classifierStore = require('../src/utils/txClassifierStore');
```

- [ ] **Step 2: Append failing route tests**

```js
describe('GET /api/transactions/suggest', () => {
    afterEach(() => { classifierStore.suggest.mockReset(); });

    test('returns an empty, not-ready payload for a too-short description without touching the model', async () => {
        const res = await request(buildApp()).get('/api/transactions/suggest?description=a');
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ ready: false, trained: 0, category: [], payment_method: [] });
        expect(classifierStore.suggest).not.toHaveBeenCalled();
    });

    test('passes parsed inputs to suggest() and returns its result', async () => {
        classifierStore.suggest.mockResolvedValueOnce({ ready: true, trained: 40, category: [{ id: 'c1', prob: 0.8 }], payment_method: [{ method: 'UPI', prob: 0.9 }] });
        const res = await request(buildApp())
            .get('/api/transactions/suggest?description=Swiggy&amount=450&date=2026-09-12&type=expense&hour=21');
        expect(res.status).toBe(200);
        expect(res.body.category[0].id).toBe('c1');
        expect(classifierStore.suggest).toHaveBeenCalledWith(expect.anything(), 'user-123',
            { description: 'Swiggy', amount: '450', date: '2026-09-12', type: 'expense', hour: 21 });
    });

    test('defaults type to expense and drops a non-integer hour', async () => {
        classifierStore.suggest.mockResolvedValueOnce({ ready: false, trained: 3, category: [], payment_method: [] });
        await request(buildApp()).get('/api/transactions/suggest?description=Swiggy&hour=abc');
        const input = classifierStore.suggest.mock.calls[0][2];
        expect(input.type).toBe('expense');
        expect(input.hour).toBeUndefined();
    });

    test('returns 500 when suggest throws', async () => {
        classifierStore.suggest.mockRejectedValueOnce(new Error('db down'));
        const res = await request(buildApp()).get('/api/transactions/suggest?description=Swiggy');
        expect(res.status).toBe(500);
    });
});

describe('classifier learning hooks', () => {
    afterEach(() => {
        pool.query.mockReset();
        classifierStore.learnInBackground.mockReset();
        classifierStore.relearnInBackground.mockReset();
        classifierStore.unlearnInBackground.mockReset();
    });

    test('POST learns the created row', async () => {
        const tx = { id: 't1', user_id: 'user-123', type: 'expense', amount: '50.00', description: 'Lunch', date: '2026-06-01', account_id: null };
        pool.query.mockResolvedValueOnce({ rows: [tx] }).mockResolvedValueOnce({ rows: [] });
        await request(buildApp()).post('/api/transactions').send({ type: 'expense', amount: 50, description: 'Lunch', date: '2026-06-01' });
        expect(classifierStore.learnInBackground).toHaveBeenCalledWith(expect.anything(), 'user-123', expect.objectContaining({ id: 't1' }));
    });

    test('DELETE unlearns the deleted row', async () => {
        const client = { query: jest.fn(), release: jest.fn() };
        client.query
            .mockResolvedValueOnce({ rows: [] })                                                        // BEGIN
            .mockResolvedValueOnce({ rows: [{ id: 't1', source: 'manual', transfer_group_id: null, goal_id: null, amount: '50', description: 'Lunch', type: 'expense', date: '2026-06-01' }] })
            .mockResolvedValueOnce({ rows: [] })                                                        // deletions insert
            .mockResolvedValueOnce({ rows: [] });                                                       // COMMIT
        pool.connect.mockResolvedValueOnce(client);
        await request(buildApp()).delete('/api/transactions/t1');
        expect(classifierStore.unlearnInBackground).toHaveBeenCalledWith(expect.anything(), 'user-123', expect.objectContaining({ id: 't1', description: 'Lunch' }));
    });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd backend && npx jest tests/transactions.routes.test.js`
Expected: FAIL — `/suggest` returns 404 (Express falls through); `learnInBackground` not called.

- [ ] **Step 4: Add the route and hooks**

In `backend/src/routes/transactions.js`, add the require after the `savingsRate` require (line 8):

```js
const { suggest, learnInBackground, unlearnInBackground, relearnInBackground } = require('../utils/txClassifierStore');
```

Add the route directly after the `/search` handler (after line 50, before `router.get('/'`):

```js
router.get('/suggest', async (req, res) => {
    try {
        const description = typeof req.query.description === 'string' ? req.query.description.trim() : '';
        if (description.length < 2)
            return res.json({ ready: false, trained: 0, category: [], payment_method: [] });
        const parsedHour = parseInt(req.query.hour, 10);
        const input = {
            description,
            amount: req.query.amount,
            date: req.query.date,
            type: req.query.type === 'income' ? 'income' : 'expense',
            hour: Number.isInteger(parsedHour) && parsedHour >= 0 && parsedHour <= 23 ? parsedHour : undefined,
        };
        res.json(await suggest(pool, req.user.id, input));
    } catch (err) {
        console.error('[Transactions] suggest failed:', err.message);
        res.status(500).json({ error: 'Server error.' });
    }
});
```

**POST hook** — immediately after the `res.status(201).json({...})` call (after line 308), before the existing `setImmediate` blocks:

```js
        learnInBackground(pool, req.user.id, tx);
```

**PUT hook** — change the `existing` select (line 481-484) to fetch the whole row so the old version can be unlearned:

```js
        const existing = await pool.query(
            'SELECT * FROM transactions WHERE id = $1 AND user_id = $2',
            [req.params.id, req.user.id]
        );
```

`before.goal_id` and `before.amount` keep working unchanged. Then after `res.json({ transaction: result.rows[0] });` (line 543) add:

```js
            relearnInBackground(pool, req.user.id, before, result.rows[0]);
```

**DELETE hook** — change the `RETURNING` clause (line 568) to:

```js
                'DELETE FROM transactions WHERE id = $1 AND user_id = $2 RETURNING *',
```

and after `res.json({ message: 'Deleted.' });` (line 594) add:

```js
            unlearnInBackground(pool, req.user.id, result.rows[0]);
```

- [ ] **Step 5: Run the whole backend suite**

Run: `cd backend && npx jest`
Expected: PASS — all suites, including the pre-existing transactions tests (the store is mocked so the hooks are no-ops there).

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/transactions.js backend/tests/transactions.routes.test.js
git commit -m "feat(transactions): /suggest endpoint and online classifier training on write"
```

---

### Task 7: Frontend API client

**Files:**
- Modify: `frontend/lib/api.ts:91-100`

- [ ] **Step 1: Add `suggest` to `transactionsAPI`**

```ts
export const transactionsAPI = {
    getAll: (params?: { type?: string; month?: number; year?: number; credit_card_id?: number }) =>
        api.get('/api/transactions', { params }),
    search: (q: string) =>
        api.get('/api/transactions/search', { params: { q } }),
    suggest: (params: { description: string; amount?: string; date?: string; type?: string; hour?: number }) =>
        api.get('/api/transactions/suggest', { params }),
    create: (data: object) => api.post('/api/transactions', data),
    update: (id: string, data: object) => api.put(`/api/transactions/${id}`, data),
    delete: (id: string) => api.delete(`/api/transactions/${id}`),
    earliest: () => api.get('/api/transactions/earliest'),
};
```

- [ ] **Step 2: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add frontend/lib/api.ts
git commit -m "feat(api): transactionsAPI.suggest"
```

---

### Task 8: Modal — model-backed category chips and payment auto-apply

**Files:**
- Modify: `frontend/components/transactions/TransactionModal.tsx`
- Test: `frontend/components/transactions/TransactionModal.test.tsx`

- [ ] **Step 1: Update the API mock in the test file**

In `TransactionModal.test.tsx`, change the `transactionsAPI` mock (lines 12-15) to:

```ts
    transactionsAPI: {
        create: vi.fn().mockResolvedValue({ data: {} }),
        update: vi.fn().mockResolvedValue({ data: {} }),
        suggest: vi.fn().mockResolvedValue({ data: { ready: false, trained: 0, category: [], payment_method: [] } }),
    },
```

- [ ] **Step 2: Append failing tests**

```ts
describe('classifier suggestions', () => {
    it('shows a model-suggested category chip even when the name does not match, and sends its id', async () => {
        (transactionsAPI.suggest as any).mockResolvedValue({ data: {
            ready: true, trained: 40,
            category: [{ id: 'c1', prob: 0.82 }],
            payment_method: [],
        } });
        const { onSuccess } = open();
        await fillBasics('450', 'Zomato');

        const chip = await waitFor(() => {
            const el = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.trim() === 'Food');
            expect(el).toBeTruthy();
            return el!;
        });
        fireEvent.click(chip);
        submit();

        await waitFor(() => expect(transactionsAPI.create).toHaveBeenCalledWith(
            expect.objectContaining({ category_id: 'c1' })
        ));
        await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    });

    it('auto-applies a confident payment method the user has not touched', async () => {
        (transactionsAPI.suggest as any).mockResolvedValue({ data: {
            ready: true, trained: 40, category: [],
            payment_method: [{ method: 'Cash', prob: 0.9 }],
        } });
        open();
        await fillBasics('120', 'Chai');

        await waitFor(() => expect(document.body.textContent).toContain('usual'));
        submit();

        await waitFor(() => expect(transactionsAPI.create).toHaveBeenCalledWith(
            expect.objectContaining({ payment_method: 'Cash' })
        ));
    });

    it('ignores a low-confidence payment suggestion', async () => {
        (transactionsAPI.suggest as any).mockResolvedValue({ data: {
            ready: true, trained: 40, category: [],
            payment_method: [{ method: 'Cash', prob: 0.4 }],
        } });
        open();
        await fillBasics('120', 'Chai');
        await waitFor(() => expect(transactionsAPI.suggest).toHaveBeenCalled());
        submit();

        await waitFor(() => expect(transactionsAPI.create).toHaveBeenCalledWith(
            expect.objectContaining({ payment_method: 'UPI' })
        ));
    });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd frontend && npx vitest run components/transactions/TransactionModal.test.tsx`
Expected: FAIL — no "Food" chip (heuristic can't match "Zomato"); payment stays "UPI".

- [ ] **Step 4: Wire the modal**

In `TransactionModal.tsx`:

(a) Add a constant after `PAYMENT_METHOD_ICONS` (line 33):

```ts
type MlSuggest = {
    ready: boolean;
    category: { id: string; prob: number }[];
    payment_method: { method: string; prob: number }[];
};
const EMPTY_SUGGEST: MlSuggest = { ready: false, category: [], payment_method: [] };
const CATEGORY_CHIP_MIN_PROB = 0.25;
const PAYMENT_AUTO_MIN_PROB = 0.6;
```

(b) Add state/refs after `const [showMore, setShowMore] = useState(false);` (line 98):

```ts
    const [mlSuggest, setMlSuggest] = useState<MlSuggest>(EMPTY_SUGGEST);
    // Once the user picks a payment method themselves, the model stops
    // overriding it for the rest of this entry.
    const paymentTouched = useRef(false);
    const [paymentAutoSet, setPaymentAutoSet] = useState(false);
```

(c) In the populate `useEffect` (lines 131-151), add before `setShowMore(!!transaction);`:

```ts
        setMlSuggest(EMPTY_SUGGEST);
        paymentTouched.current = false;
        setPaymentAutoSet(false);
```

(d) Add the debounced fetch effect directly after the credit-card-selection effect (after line 172):

```ts
    useEffect(() => {
        if (!isOpen || form.type === 'transfer') { setMlSuggest(EMPTY_SUGGEST); return; }
        const description = form.description.trim();
        if (description.length < 3) { setMlSuggest(EMPTY_SUGGEST); return; }
        const timer = setTimeout(() => {
            transactionsAPI.suggest({
                description,
                amount: form.amount || undefined,
                date: form.date,
                type: form.type,
                hour: new Date().getHours(),
            })
                .then(res => setMlSuggest({
                    ready: !!res.data.ready,
                    category: res.data.category || [],
                    payment_method: res.data.payment_method || [],
                }))
                .catch(() => setMlSuggest(EMPTY_SUGGEST));
        }, 350);
        return () => clearTimeout(timer);
    }, [isOpen, form.type, form.description, form.amount, form.date]);

    useEffect(() => {
        if (!isOpen || isEditing || paymentTouched.current || form.type !== 'expense') return;
        const top = mlSuggest.ready ? mlSuggest.payment_method[0] : undefined;
        if (!top || top.prob < PAYMENT_AUTO_MIN_PROB || top.method === form.payment_method) return;
        setForm(prev => ({ ...prev, payment_method: top.method }));
        setPaymentAutoSet(true);
    }, [mlSuggest, isOpen, isEditing, form.type, form.payment_method]);
```

(e) Replace the `suggestedCats` memo (lines 174-191) with:

```ts
    const suggestedCats = useMemo(() => {
        if (mlSuggest.ready) {
            const fromModel = mlSuggest.category
                .filter(s => s.prob >= CATEGORY_CHIP_MIN_PROB && s.id !== form.category_id)
                .map(s => categories.find((c: any) => String(c.id) === s.id))
                .filter(Boolean)
                .slice(0, 2);
            if (fromModel.length) return fromModel;
        }
        const desc = form.description.trim().toLowerCase();
        if (desc.length < 3 || !categories.length) return [];
        const words = desc.split(/\s+/).filter((w: string) => w.length >= 3);
        const scored = categories
            .filter((c: any) => !form.category_id || String(c.id) !== form.category_id)
            .map((c: any) => {
                const cn = c.name.toLowerCase();
                let score = 0;
                if (cn === desc) score = 100;
                else if (cn.includes(desc) || desc.includes(cn)) score = 50;
                else for (const w of words) { if (cn.includes(w)) score += 10; }
                return { ...c, score };
            })
            .filter((c: any) => c.score > 0)
            .sort((a: any, b: any) => b.score - a.score || (Number(b.usage_count) || 0) - (Number(a.usage_count) || 0));
        return scored.slice(0, 2);
    }, [form.description, form.category_id, categories, mlSuggest]);
```

(f) In `paymentSheet`, change the option button's `onClick` (line 471) to:

```tsx
                        <button key={m} type="button" onClick={() => { paymentTouched.current = true; setPaymentAutoSet(false); setForm({ ...form, payment_method: m }); setPaymentSheetOpen(false); }}
```

(g) In the payment-method trigger (lines 725-727), insert the "usual" hint between the method name and the chevron:

```tsx
                                    <span style={{ flexShrink: 0 }}>{PAYMENT_METHOD_ICONS[form.payment_method]}</span>
                                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{form.payment_method}</span>
                                    {paymentAutoSet && <span style={{ fontSize: '10.5px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>usual</span>}
                                    <ChevronDown size={16} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
```

- [ ] **Step 5: Run the modal tests**

Run: `cd frontend && npx vitest run components/transactions/TransactionModal.test.tsx`
Expected: PASS — all existing tests plus the three new ones.

- [ ] **Step 6: Lint + type-check**

Run: `cd frontend && npx tsc --noEmit && npx eslint components/transactions/TransactionModal.tsx`
Expected: clean

- [ ] **Step 7: Commit**

```bash
git add frontend/components/transactions/TransactionModal.tsx frontend/components/transactions/TransactionModal.test.tsx
git commit -m "feat(transactions): learned category chips and payment-method auto-fill in the modal"
```

---

### Task 9: Docs

**Files:**
- Modify: `docs/AI_FEATURES.md`

- [ ] **Step 1: Add a section after "Opportunities"**

```markdown
---

## Transaction Classifier (`backend/src/utils/txClassifier.js`, `txClassifierStore.js`)

**Not LLM-backed.** A per-user multinomial Naive Bayes model (targets: `category_id`,
`payment_method`) over description tokens/bigrams, log2 amount bucket, weekday, 4-hour
IST bucket and type. Stored as JSONB in `tx_classifier_models` (one row per user).

- Bootstrapped from the user's last 5,000 transactions on first use.
- Updated online: `POST` learns, `PUT` unlearns the old row and learns the new one,
  `DELETE` unlearns — all fire-and-forget after the response, serialised per user with
  a transaction-scoped advisory lock.
- `GET /api/transactions/suggest?description=&amount=&date=&type=&hour=` returns
  `{ ready, trained, category: [{id, prob}], payment_method: [{method, prob}] }`.
  `ready` is false below 20 samples; the modal then falls back to its name-overlap heuristic.
- Transfers and credit-card bill payments (tagged rows) are never used as training data.
```

- [ ] **Step 2: Commit**

```bash
git add docs/AI_FEATURES.md
git commit -m "docs: document the transaction classifier"
```

---

## Self-review

- **Spec coverage:** per-user learning (Task 4/5 bootstrap + online), category + payment suggestion (Task 4 `suggest`, Task 8 UI), new-user cold start (`ready` flag + heuristic fallback, Task 8e), learning from edits/deletes (Task 6 hooks). ✔
- **Placeholders:** none.
- **Type consistency:** `suggest()` returns `{ ready, trained, category:[{id,prob}], payment_method:[{method,prob}] }` everywhere (store, route test, `MlSuggest` type). Store exports `learnInBackground/unlearnInBackground/relearnInBackground` and the route imports exactly those. ✔
- **Known simplifications (deliberate):** no vocabulary pruning (a 5k-row bootstrap stays well under 1 MB JSONB); `hour` for prediction is the device's local hour, which is IST for this user base.
