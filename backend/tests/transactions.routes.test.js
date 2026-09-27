process.env.JWT_SECRET = 'test-secret';

jest.mock('../src/db/pool', () => ({
    query: jest.fn(),
    connect: jest.fn(),
}));
jest.mock('../src/utils/fcm', () => ({
    notifyOnce: jest.fn(),
    sendToUser: jest.fn(),
    userHasTokens: jest.fn(),
}));
jest.mock('../src/middleware/auth', () => (req, res, next) => {
    req.user = { id: 'user-123', email: 'test@example.com' };
    next();
});
jest.mock('../src/utils/txClassifierStore', () => ({
    suggest: jest.fn(),
    learnInBackground: jest.fn(),
    unlearnInBackground: jest.fn(),
    relearnInBackground: jest.fn(),
}));
jest.mock('../src/utils/txEntrySignals', () => ({
    ...jest.requireActual('../src/utils/txEntrySignals'),
    collectEntrySignals: jest.fn(),
    assessAnomaly: jest.fn(),
}));

const express = require('express');
const request = require('supertest');
const pool = require('../src/db/pool');
const classifierStore = require('../src/utils/txClassifierStore');
const entrySignals = require('../src/utils/txEntrySignals');
const transactionsRouter = require('../src/routes/transactions');

function buildApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/transactions', transactionsRouter);
    return app;
}

describe('GET /api/transactions', () => {
    afterEach(() => {
        pool.query.mockReset();
    });

    test('returns transactions for the authenticated user', async () => {
        const rows = [{ id: 1, amount: '100.00', type: 'expense', description: 'Coffee' }];
        pool.query.mockResolvedValueOnce({ rows });

        const res = await request(buildApp()).get('/api/transactions');

        expect(res.status).toBe(200);
        expect(res.body.transactions).toEqual(rows);

        const [query, params] = pool.query.mock.calls[0];
        expect(params[0]).toBe('user-123');
        expect(query).not.toMatch(/LIMIT/);
    });

    test('applies LIMIT and OFFSET when provided as query params', async () => {
        pool.query.mockResolvedValueOnce({ rows: [] });

        const res = await request(buildApp()).get('/api/transactions?limit=10&offset=5');

        expect(res.status).toBe(200);
        const [query, params] = pool.query.mock.calls[0];
        expect(query).toMatch(/LIMIT \$\d+/);
        expect(query).toMatch(/OFFSET \$\d+/);
        expect(params).toContain(10);
        expect(params).toContain(5);
    });

    test('caps an excessive limit at 500', async () => {
        pool.query.mockResolvedValueOnce({ rows: [] });

        const res = await request(buildApp()).get('/api/transactions?limit=99999');

        expect(res.status).toBe(200);
        const [, params] = pool.query.mock.calls[0];
        expect(params).toContain(500);
        expect(params).not.toContain(99999);
    });

    test('returns 500 on database error', async () => {
        pool.query.mockRejectedValueOnce(new Error('db down'));

        const res = await request(buildApp()).get('/api/transactions');

        expect(res.status).toBe(500);
        expect(res.body.error).toBeDefined();
    });

    test('applies month/year filters when from/to are absent', async () => {
        pool.query.mockResolvedValueOnce({ rows: [] });

        const res = await request(buildApp()).get('/api/transactions?month=6&year=2026');

        expect(res.status).toBe(200);
        const [query, params] = pool.query.mock.calls[0];
        expect(query).toMatch(/EXTRACT\(MONTH FROM t\.date\)/);
        expect(query).toMatch(/EXTRACT\(YEAR {2}FROM t\.date\)/);
        expect(params).toContain('6');
        expect(params).toContain('2026');
    });

    test('from alone applies a half-open range (>=) with no upper bound', async () => {
        pool.query.mockResolvedValueOnce({ rows: [] });

        const res = await request(buildApp()).get('/api/transactions?from=2026-06-01');

        expect(res.status).toBe(200);
        const [query, params] = pool.query.mock.calls[0];
        expect(query).toMatch(/AND t\.date >= \$\d+/);
        expect(query).not.toMatch(/t\.date <=/);
        expect(params).toContain('2026-06-01');
    });

    test('to alone applies a half-open range (<=) with no lower bound', async () => {
        pool.query.mockResolvedValueOnce({ rows: [] });

        const res = await request(buildApp()).get('/api/transactions?to=2026-06-30');

        expect(res.status).toBe(200);
        const [query, params] = pool.query.mock.calls[0];
        expect(query).toMatch(/AND t\.date <= \$\d+/);
        expect(query).not.toMatch(/t\.date >=/);
        expect(params).toContain('2026-06-30');
    });

    test('from and to together apply a closed range', async () => {
        pool.query.mockResolvedValueOnce({ rows: [] });

        const res = await request(buildApp()).get('/api/transactions?from=2026-06-01&to=2026-06-30');

        expect(res.status).toBe(200);
        const [query, params] = pool.query.mock.calls[0];
        expect(query).toMatch(/AND t\.date >= \$\d+/);
        expect(query).toMatch(/AND t\.date <= \$\d+/);
        expect(params).toContain('2026-06-01');
        expect(params).toContain('2026-06-30');
    });

    test('from/to entirely override month/year -- no AND-combination, no month/year clause at all', async () => {
        pool.query.mockResolvedValueOnce({ rows: [] });

        const res = await request(buildApp()).get('/api/transactions?from=2026-06-01&to=2026-06-30&month=1&year=2020');

        expect(res.status).toBe(200);
        const [query, params] = pool.query.mock.calls[0];
        expect(query).not.toMatch(/EXTRACT\(MONTH FROM t\.date\)/);
        expect(query).not.toMatch(/EXTRACT\(YEAR {2}FROM t\.date\)/);
        expect(params).not.toContain('1');
        expect(params).not.toContain('2020');
    });

    test('from/to combine (AND) correctly with type, category_id, and credit_card_id', async () => {
        pool.query.mockResolvedValueOnce({ rows: [] });

        const res = await request(buildApp()).get(
            '/api/transactions?from=2026-06-01&to=2026-06-30&type=expense&category_id=cat-1&credit_card_id=5'
        );

        expect(res.status).toBe(200);
        const [query, params] = pool.query.mock.calls[0];
        expect(query).toMatch(/AND t\.type = \$\d+/);
        expect(query).toMatch(/AND t\.date >= \$\d+/);
        expect(query).toMatch(/AND t\.date <= \$\d+/);
        expect(query).toMatch(/AND t\.category_id = \$\d+/);
        expect(query).toMatch(/AND t\.credit_card_id = \$\d+/);
        expect(params).toContain('expense');
        expect(params).toContain('2026-06-01');
        expect(params).toContain('2026-06-30');
        expect(params).toContain('cat-1');
        expect(params).toContain('5');
    });

    test('rejects an invalid from date with 400', async () => {
        const res = await request(buildApp()).get('/api/transactions?from=not-a-date');

        expect(res.status).toBe(400);
        expect(res.body.error).toBeDefined();
        expect(pool.query).not.toHaveBeenCalled();
    });

    test('rejects an invalid to date with 400', async () => {
        const res = await request(buildApp()).get('/api/transactions?to=2026-13-99');

        expect(res.status).toBe(400);
        expect(res.body.error).toBeDefined();
        expect(pool.query).not.toHaveBeenCalled();
    });
});

describe('POST /api/transactions', () => {
    afterEach(() => {
        pool.query.mockReset();
    });

    test('rejects when required fields are missing', async () => {
        const res = await request(buildApp())
            .post('/api/transactions')
            .send({ type: 'expense' });

        expect(res.status).toBe(400);
        expect(pool.query).not.toHaveBeenCalled();
    });

    test('creates a transaction and returns it', async () => {
        const tx = {
            id: 1, user_id: 'user-123', type: 'expense', amount: '50.00',
            description: 'Lunch', date: '2026-06-01', account_id: null,
        };
        pool.query
            .mockResolvedValueOnce({ rows: [tx] }) // INSERT transaction
            .mockResolvedValueOnce({ rows: [] });  // default account lookup

        const res = await request(buildApp())
            .post('/api/transactions')
            .send({ type: 'expense', amount: 50, description: 'Lunch', date: '2026-06-01' });

        expect(res.status).toBe(201);
        expect(res.body.transaction).toMatchObject({ id: 1, description: 'Lunch' });
    });

    test('rejects credit_card_id that does not belong to the user (no INSERT runs)', async () => {
        pool.query.mockResolvedValueOnce({ rows: [] }); // ownership check finds nothing

        const res = await request(buildApp())
            .post('/api/transactions')
            .send({ type: 'expense', amount: 50, description: 'Lunch', date: '2026-06-01', credit_card_id: 999 });

        expect(res.status).toBe(400);
        expect(pool.query).toHaveBeenCalledTimes(1); // only the ownership check, no INSERT
    });

    test('rejects credit_card_id on an income transaction', async () => {
        const res = await request(buildApp())
            .post('/api/transactions')
            .send({ type: 'income', amount: 50, description: 'Refund', date: '2026-06-01', credit_card_id: 1 });

        expect(res.status).toBe(400);
        expect(pool.query).not.toHaveBeenCalled(); // rejected before the ownership check even runs
    });

    test('accepts credit_card_id that belongs to the user', async () => {
        const tx = { id: 2, user_id: 'user-123', type: 'expense', amount: '20.00', credit_card_id: 5 };
        pool.query
            .mockResolvedValueOnce({ rows: [{ id: 5 }] }) // ownership check passes
            .mockResolvedValueOnce({ rows: [tx] })        // INSERT transaction
            .mockResolvedValueOnce({ rows: [] });         // default account lookup

        const res = await request(buildApp())
            .post('/api/transactions')
            .send({ type: 'expense', amount: 20, description: 'Dinner', date: '2026-06-01', credit_card_id: 5 });

        expect(res.status).toBe(201);
        const [, insertParams] = pool.query.mock.calls[1];
        expect(insertParams).toContain(5); // credit_card_id made it into the INSERT
    });

    test('rejects category_id genuinely owned by a different real user (no INSERT runs)', async () => {
        // A category owned by a different real user has a non-null, foreign user_id,
        // so it never matches `user_id = $2 OR user_id IS NULL` and the check
        // correctly finds nothing.
        pool.query.mockResolvedValueOnce({ rows: [] }); // category ownership check finds nothing

        const res = await request(buildApp())
            .post('/api/transactions')
            .send({ type: 'expense', amount: 50, description: 'Lunch', date: '2026-06-01', category_id: 'not-mine' });

        expect(res.status).toBe(400);
        expect(pool.query).toHaveBeenCalledTimes(1); // only the ownership check, no INSERT

        const [query, params] = pool.query.mock.calls[0];
        expect(query).toMatch(/WHERE id = \$1 AND \(user_id = \$2 OR user_id IS NULL\)/);
        expect(params).toEqual(['not-mine', 'user-123']);
    });

    test('accepts category_id that is a shared legacy default (user_id IS NULL)', async () => {
        // Legacy global categories seeded by 001_initial_schema.sql have user_id
        // IS NULL and are not owned by any specific user -- the ownership check's
        // `OR user_id IS NULL` clause must let these through for pre-existing
        // accounts that still reference them.
        const tx = { id: 5, user_id: 'user-123', type: 'expense', amount: '10.00', category_id: 'legacy-cat', account_id: null };
        pool.query
            .mockResolvedValueOnce({ rows: [{ id: 'legacy-cat' }] }) // category ownership check matches via IS NULL
            .mockResolvedValueOnce({ rows: [tx] })                   // INSERT transaction
            .mockResolvedValueOnce({ rows: [] });                    // default account lookup

        const res = await request(buildApp())
            .post('/api/transactions')
            .send({ type: 'expense', amount: 10, description: 'Tea', date: '2026-06-01', category_id: 'legacy-cat' });

        expect(res.status).toBe(201);
        const [, insertParams] = pool.query.mock.calls[1];
        expect(insertParams).toContain('legacy-cat');
    });

    test('rejects account_id that does not belong to the user (no INSERT runs)', async () => {
        pool.query.mockResolvedValueOnce({ rows: [] }); // account ownership check finds nothing

        const res = await request(buildApp())
            .post('/api/transactions')
            .send({ type: 'expense', amount: 50, description: 'Lunch', date: '2026-06-01', account_id: 999 });

        expect(res.status).toBe(400);
        expect(pool.query).toHaveBeenCalledTimes(1); // only the ownership check, no INSERT
    });

    test('accepts category_id and account_id that belong to the user', async () => {
        const tx = { id: 3, user_id: 'user-123', type: 'expense', amount: '30.00', category_id: 'cat-1', account_id: 7 };
        pool.query
            .mockResolvedValueOnce({ rows: [{ id: 'cat-1' }] }) // category ownership check passes
            .mockResolvedValueOnce({ rows: [{ id: 7 }] })       // account ownership check passes
            .mockResolvedValueOnce({ rows: [tx] });             // INSERT transaction

        const res = await request(buildApp())
            .post('/api/transactions')
            .send({ type: 'expense', amount: 30, description: 'Snacks', date: '2026-06-01', category_id: 'cat-1', account_id: 7 });

        expect(res.status).toBe(201);
        const [, insertParams] = pool.query.mock.calls[2];
        expect(insertParams).toContain('cat-1');
        expect(insertParams).toContain(7);
    });
});

describe('POST /api/transactions — large-charge alert', () => {
    const { notifyOnce } = require('../src/utils/fcm');
    const flush = async () => {
        for (let i = 0; i < 5; i++) await new Promise(r => setImmediate(r));
    };
    const largeTxCalls = () => notifyOnce.mock.calls.filter(([, key]) => String(key).startsWith('large_tx:'));

    // Earlier POST tests leave their fire-and-forget blocks queued; drain
    // them so their calls don't land in this suite's mocks.
    beforeEach(async () => {
        await flush();
        pool.query.mockReset();
        notifyOnce.mockReset();
        entrySignals.assessAnomaly.mockReset();
    });
    afterEach(async () => {
        await flush();
        pool.query.mockReset();
    });

    const postRent = (amount, categoryRow) => {
        const tx = {
            id: 'tx-rent', user_id: 'user-123', type: 'expense', amount: String(amount),
            description: 'Rent', category_id: 'cat-rent', account_id: 7, tags: [], date: '2026-09-01',
        };
        pool.query
            .mockResolvedValueOnce({ rows: [categoryRow] }) // category ownership check
            .mockResolvedValueOnce({ rows: [{ id: 7 }] })  // account ownership check
            .mockResolvedValueOnce({ rows: [tx] });        // INSERT transaction
        return request(buildApp())
            .post('/api/transactions')
            .send({ type: 'expense', amount, description: 'Rent', date: '2026-09-01', category_id: 'cat-rent', account_id: 7 });
    };

    test('a normal ₹6,000 rent-like expense with history no longer pushes', async () => {
        entrySignals.assessAnomaly.mockResolvedValue({ status: 'normal', basis: 'description', label: 'Rent', median: 6000, n: 12 });

        const res = await postRent(6000, { id: 'cat-rent', is_investment_category: false });
        await flush();

        expect(res.status).toBe(201);
        expect(entrySignals.assessAnomaly).toHaveBeenCalledTimes(1);
        expect(entrySignals.assessAnomaly.mock.calls[0][2]).toMatchObject({ type: 'expense', amount: 6000, exclude_id: 'tx-rent' });
        expect(largeTxCalls()).toHaveLength(0);
    });

    test('an anomalous expense pushes with the large_tx key', async () => {
        entrySignals.assessAnomaly.mockResolvedValue({ status: 'anomaly', basis: 'description', label: 'Rent', median: 2000, n: 12 });

        await postRent(6000, { id: 'cat-rent', is_investment_category: false });
        await flush();

        expect(largeTxCalls()).toHaveLength(1);
        const [userId, key, payload] = largeTxCalls()[0];
        expect(userId).toBe('user-123');
        expect(key).toBe('large_tx:tx-rent');
        expect(payload.body).toBe('₹6,000 on Rent is about 3× what you usually spend there (₹2,000). Worth a quick check.');
        expect(payload.data).toMatchObject({ type: 'info', deepLink: '/transactions' });
    });

    test('investment-category expenses skip the history lookup entirely', async () => {
        await postRent(50000, { id: 'cat-rent', is_investment_category: true });
        await flush();

        expect(entrySignals.assessAnomaly).not.toHaveBeenCalled();
        expect(largeTxCalls()).toHaveLength(0);
    });
});

describe('PUT /api/transactions/:id — credit_card_id', () => {
    // The handler runs its UPDATE through a transactional client (pool.connect()),
    // not the plain pool — added in 9ce4a77 to keep the goal-contribution
    // reconciliation atomic with the transaction update. Without mocking
    // pool.connect(), client.query('BEGIN') throws on an undefined client.
    function mockClient(queryImpl) {
        return { query: jest.fn(queryImpl), release: jest.fn() };
    }

    afterEach(() => {
        pool.query.mockReset();
        pool.connect.mockReset();
    });

    test('clears credit_card_id when payment_method moves away from Credit Card', async () => {
        pool.query.mockResolvedValueOnce({ rows: [{ id: 1 }] }); // ownership check
        let updateParams;
        const client = mockClient(async (sql, params) => {
            if (sql === 'BEGIN' || sql === 'COMMIT') return {};
            if (sql.startsWith('UPDATE transactions')) {
                updateParams = params;
                return { rows: [{ id: 1, payment_method: 'Cash', credit_card_id: null }] };
            }
            throw new Error(`Unexpected client query: ${sql}`);
        });
        pool.connect.mockResolvedValue(client);

        const res = await request(buildApp())
            .put('/api/transactions/1')
            .send({ payment_method: 'Cash' });

        expect(res.status).toBe(200);
        // clearCreditCardId (param index 11, 0-based) must be true so the SQL's
        // CASE WHEN sets credit_card_id = NULL regardless of any stale value.
        expect(updateParams[11]).toBe(true);
    });

    test('does not touch credit_card_id when payment_method is unrelated to the update', async () => {
        pool.query.mockResolvedValueOnce({ rows: [{ id: 1 }] }); // ownership check
        let updateParams;
        const client = mockClient(async (sql, params) => {
            if (sql === 'BEGIN' || sql === 'COMMIT') return {};
            if (sql.startsWith('UPDATE transactions')) {
                updateParams = params;
                return { rows: [{ id: 1 }] };
            }
            throw new Error(`Unexpected client query: ${sql}`);
        });
        pool.connect.mockResolvedValue(client);

        const res = await request(buildApp())
            .put('/api/transactions/1')
            .send({ amount: 75 });

        expect(res.status).toBe(200);
        expect(updateParams[11]).toBe(false); // clearCreditCardId false -> COALESCE keeps existing value
    });
});

describe('PUT /api/transactions/:id — category_id', () => {
    function mockClient(queryImpl) {
        return { query: jest.fn(queryImpl), release: jest.fn() };
    }

    afterEach(() => {
        pool.query.mockReset();
        pool.connect.mockReset();
    });

    test('rejects category_id genuinely owned by a different real user (no UPDATE runs)', async () => {
        // A category owned by a different real user has a non-null, foreign user_id,
        // so it never matches `user_id = $2 OR user_id IS NULL` and the check
        // correctly finds nothing.
        pool.query.mockResolvedValueOnce({ rows: [] }); // category ownership check finds nothing

        const res = await request(buildApp())
            .put('/api/transactions/1')
            .send({ category_id: 'not-mine' });

        expect(res.status).toBe(400);
        expect(pool.query).toHaveBeenCalledTimes(1); // only the ownership check ran
        expect(pool.connect).not.toHaveBeenCalled();

        const [query, params] = pool.query.mock.calls[0];
        expect(query).toMatch(/WHERE id = \$1 AND \(user_id = \$2 OR user_id IS NULL\)/);
        expect(params).toEqual(['not-mine', 'user-123']);
    });

    test('accepts category_id that is a shared legacy default (user_id IS NULL)', async () => {
        pool.query
            .mockResolvedValueOnce({ rows: [{ id: 'legacy-cat' }] })          // category ownership check matches via IS NULL
            .mockResolvedValueOnce({ rows: [{ id: 1, goal_id: null }] });     // existing transaction lookup
        const client = mockClient(async (sql) => {
            if (sql === 'BEGIN' || sql === 'COMMIT') return {};
            if (sql.startsWith('UPDATE transactions')) {
                return { rows: [{ id: 1, category_id: 'legacy-cat' }] };
            }
            throw new Error(`Unexpected client query: ${sql}`);
        });
        pool.connect.mockResolvedValue(client);

        const res = await request(buildApp())
            .put('/api/transactions/1')
            .send({ category_id: 'legacy-cat' });

        expect(res.status).toBe(200);
        expect(res.body.transaction.category_id).toBe('legacy-cat');
    });

    test('accepts category_id that belongs to the user', async () => {
        pool.query
            .mockResolvedValueOnce({ rows: [{ id: 'cat-1' }] })           // category ownership check
            .mockResolvedValueOnce({ rows: [{ id: 1, goal_id: null }] }); // existing transaction lookup
        const client = mockClient(async (sql) => {
            if (sql === 'BEGIN' || sql === 'COMMIT') return {};
            if (sql.startsWith('UPDATE transactions')) {
                return { rows: [{ id: 1, category_id: 'cat-1' }] };
            }
            throw new Error(`Unexpected client query: ${sql}`);
        });
        pool.connect.mockResolvedValue(client);

        const res = await request(buildApp())
            .put('/api/transactions/1')
            .send({ category_id: 'cat-1' });

        expect(res.status).toBe(200);
        expect(res.body.transaction.category_id).toBe('cat-1');
    });
});

describe('DELETE /api/transactions/:id — transfer_group_id pairing', () => {
    function mockClient(queryImpl) {
        return { query: jest.fn(queryImpl), release: jest.fn() };
    }
    afterEach(() => {
        pool.query.mockReset();
        pool.connect.mockReset();
    });

    test('deletes the sibling leg sharing the same transfer_group_id', async () => {
        const calls = [];
        const client = mockClient(async (sql, params) => {
            calls.push(sql);
            if (sql === 'BEGIN' || sql === 'COMMIT') return {};
            if (sql.startsWith('DELETE FROM transactions WHERE id = $1')) {
                return { rows: [{ id: 'tx-1', source: 'manual', transfer_group_id: 'group-abc' }] };
            }
            if (sql.startsWith('DELETE FROM transactions WHERE transfer_group_id')) {
                expect(params[0]).toBe('group-abc');
                return { rowCount: 1 };
            }
            if (sql.startsWith('INSERT INTO transaction_deletions')) return {};
            throw new Error(`Unexpected client query: ${sql}`);
        });
        pool.connect.mockResolvedValue(client);

        const res = await request(buildApp()).delete('/api/transactions/tx-1');

        expect(res.status).toBe(200);
        expect(calls.some(sql => sql.startsWith('DELETE FROM transactions WHERE transfer_group_id'))).toBe(true);
    });

    test('does not attempt a sibling delete when transfer_group_id is null', async () => {
        const client = mockClient(async (sql) => {
            if (sql === 'BEGIN' || sql === 'COMMIT') return {};
            if (sql.startsWith('DELETE FROM transactions WHERE id = $1')) {
                return { rows: [{ id: 'tx-1', source: 'manual', transfer_group_id: null }] };
            }
            if (sql.startsWith('INSERT INTO transaction_deletions')) return {};
            throw new Error(`Unexpected client query: ${sql}`);
        });
        pool.connect.mockResolvedValue(client);

        const res = await request(buildApp()).delete('/api/transactions/tx-1');

        expect(res.status).toBe(200);
        expect(client.query.mock.calls.some(([sql]) => sql.startsWith('DELETE FROM transactions WHERE transfer_group_id'))).toBe(false);
    });
});

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
        pool.connect.mockReset();
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

    test('PUT relearns from the full before row to the updated row', async () => {
        const before = { id: 't1', user_id: 'user-123', type: 'expense', amount: '50.00', description: 'Lunch', date: '2026-06-01', goal_id: null, category_id: null, payment_method: 'UPI' };
        const after = { ...before, category_id: 'c9' };
        pool.query
            .mockResolvedValueOnce({ rows: [{ id: 'c9' }] }) // category ownership check
            .mockResolvedValueOnce({ rows: [before] });      // existing lookup
        const client = { query: jest.fn(), release: jest.fn() };
        client.query
            .mockResolvedValueOnce({ rows: [] })        // BEGIN
            .mockResolvedValueOnce({ rows: [after] })   // UPDATE
            .mockResolvedValueOnce({ rows: [] });       // COMMIT
        pool.connect.mockResolvedValueOnce(client);
        const res = await request(buildApp()).put('/api/transactions/t1').send({ category_id: 'c9' });
        expect(res.status).toBe(200);
        expect(classifierStore.relearnInBackground).toHaveBeenCalledWith(expect.anything(), 'user-123',
            expect.objectContaining({ id: 't1', description: 'Lunch', payment_method: 'UPI' }),
            expect.objectContaining({ id: 't1', category_id: 'c9' }));
        expect(pool.query.mock.calls[1][0]).toMatch(/SELECT \* FROM transactions/);
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

describe('goal-linked contributions (POST stores goal_id; DELETE/PUT reconcile it)', () => {
    // A tiny in-memory stand-in for the two tables involved, so each test can
    // assert on the resulting state (row stored? goal moved by how much?)
    // rather than on SQL call order.
    const GOAL = '11111111-1111-4111-8111-111111111111';
    const OTHER_USERS_GOAL = '22222222-2222-4222-8222-222222222222';
    const { notifyOnce } = require('../src/utils/fcm');
    const flush = async () => {
        for (let i = 0; i < 5; i++) await new Promise(r => setImmediate(r));
    };
    let db;

    function goalUpdate(params) {
        const [delta, goalId, userId] = params;
        db.goalUpdates++;
        const g = db.goals.find(x => x.id === goalId && x.user_id === userId);
        if (!g) return { rows: [], rowCount: 0 };
        g.saved_amount = Math.max(0, g.saved_amount + delta);
        return { rows: [{ ...g }], rowCount: 1 };
    }

    function clientQuery(sql, params) {
        if (sql === 'BEGIN') { db.snapshot = JSON.stringify({ goals: db.goals, txs: db.txs }); return {}; }
        if (sql === 'COMMIT') { db.snapshot = null; return {}; }
        if (sql === 'ROLLBACK') {
            if (db.snapshot) Object.assign(db, JSON.parse(db.snapshot));
            db.rolledBack = true;
            return {};
        }
        if (sql.startsWith('INSERT INTO transactions')) {
            const cols = sql.match(/\(([^)]+)\)/)[1].split(',').map(s => s.trim());
            const row = { id: `tx-${db.txs.length + 1}`, transfer_group_id: null, personal_loan_id: null, goal_id: null };
            cols.forEach((c, i) => { row[c] = params[i]; });
            if (row.goal_id && !db.goals.some(g => g.id === row.goal_id))
                throw new Error('violates foreign key constraint');
            db.txs.push(row);
            return { rows: [{ ...row }] };
        }
        if (sql.includes('FROM bank_accounts WHERE user_id')) return { rows: [] };
        if (sql.startsWith('UPDATE savings_goals')) return goalUpdate(params);
        if (sql.startsWith('DELETE FROM transactions WHERE id = $1')) {
            const i = db.txs.findIndex(t => t.id === params[0] && t.user_id === params[1]);
            if (i === -1) return { rows: [] };
            const [row] = db.txs.splice(i, 1);
            return { rows: [row] };
        }
        if (sql.startsWith('INSERT INTO transaction_deletions')) return {};
        if (sql.startsWith('UPDATE transactions')) {
            const t = db.txs.find(x => x.id === params[8] && x.user_id === params[9]);
            if (params[1] !== undefined && params[1] !== null) t.amount = String(params[1]);
            if (params[13]) t.goal_id = null;
            else if (params[14]) t.goal_id = params[14];
            return { rows: [{ ...t }] };
        }
        throw new Error(`Unexpected client query: ${sql}`);
    }

    function poolQuery(sql, params) {
        if (sql.startsWith('SELECT id FROM savings_goals')) {
            return { rows: db.goals.filter(g => g.id === params[0] && g.user_id === params[1]).map(g => ({ id: g.id })) };
        }
        if (sql.startsWith('SELECT * FROM transactions WHERE id = $1')) {
            return { rows: db.txs.filter(t => t.id === params[0] && t.user_id === params[1]).map(t => ({ ...t })) };
        }
        return { rows: [] }; // fire-and-forget alert blocks
    }

    beforeEach(async () => {
        await flush();
        db = {
            goals: [
                { id: GOAL, user_id: 'user-123', name: 'Goa Trip', target_amount: 50000, saved_amount: 1000 },
                { id: OTHER_USERS_GOAL, user_id: 'someone-else', name: 'Theirs', target_amount: 9000, saved_amount: 300 },
            ],
            txs: [],
            snapshot: null,
            rolledBack: false,
            goalUpdates: 0,
        };
        pool.query.mockReset();
        pool.connect.mockReset();
        notifyOnce.mockReset();
        entrySignals.assessAnomaly.mockReset();
        pool.query.mockImplementation(async (sql, params) => poolQuery(sql, params));
        pool.connect.mockImplementation(async () => ({
            query: jest.fn(async (sql, params) => clientQuery(sql, params)),
            release: jest.fn(),
        }));
    });
    afterEach(async () => {
        await flush();
        pool.query.mockReset();
        pool.connect.mockReset();
    });

    const saved = id => db.goals.find(g => g.id === id).saved_amount;
    const contribute = (amount, goalId = GOAL) => request(buildApp())
        .post('/api/transactions')
        .send({ type: 'expense', amount, description: 'Goa trip savings', date: '2026-09-20', goal_id: goalId });

    test('POST with goal_id stores it on the row and applies the contribution once', async () => {
        const res = await contribute(2500);
        await flush();

        expect(res.status).toBe(201);
        expect(res.body.transaction.goal_id).toBe(GOAL);
        expect(db.txs).toHaveLength(1);
        expect(db.txs[0].goal_id).toBe(GOAL);
        expect(db.goalUpdates).toBe(1);
        expect(saved(GOAL)).toBe(3500);
        expect(res.body.goal).toMatchObject({ id: GOAL, saved_amount: 3500 });
        // A goal contribution is never a "large charge". The alert now reads
        // goal_id off the stored row, so the history lookup never runs.
        expect(entrySignals.assessAnomaly).not.toHaveBeenCalled();
    });

    test('DELETE of a POSTed contribution reverses it on the goal', async () => {
        const created = await contribute(2500);
        expect(saved(GOAL)).toBe(3500);

        const res = await request(buildApp()).delete(`/api/transactions/${created.body.transaction.id}`);

        expect(res.status).toBe(200);
        expect(db.txs).toHaveLength(0);
        expect(saved(GOAL)).toBe(1000);
    });

    test('PUT changing the amount of a POSTed contribution moves the goal by the difference', async () => {
        const created = await contribute(2500);
        expect(saved(GOAL)).toBe(3500);

        const res = await request(buildApp())
            .put(`/api/transactions/${created.body.transaction.id}`)
            .send({ amount: 4000 });

        expect(res.status).toBe(200);
        expect(db.txs[0].goal_id).toBe(GOAL);
        expect(saved(GOAL)).toBe(5000); // net +1500 on top of the original 2500
    });

    test('POST with another user\'s goal_id is a 400: no row, no goal change', async () => {
        const res = await contribute(2500, OTHER_USERS_GOAL);

        expect(res.status).toBe(400);
        expect(res.body.error).toBe('Invalid goal_id.');
        expect(db.txs).toHaveLength(0);
        expect(saved(OTHER_USERS_GOAL)).toBe(300);
        expect(saved(GOAL)).toBe(1000);
        expect(db.goalUpdates).toBe(0);
        expect(pool.connect).not.toHaveBeenCalled(); // rejected before any INSERT
    });

    test('a goal that stops being the user\'s after the check still rolls back with 400', async () => {
        pool.query.mockImplementation(async (sql, params) => {
            if (sql.startsWith('SELECT id FROM savings_goals')) return { rows: [{ id: GOAL }] };
            return poolQuery(sql, params);
        });
        db.goals.find(g => g.id === GOAL).user_id = 'someone-else';

        const res = await contribute(2500);

        expect(res.status).toBe(400);
        expect(db.rolledBack).toBe(true);
        expect(db.txs).toHaveLength(0);
        expect(saved(GOAL)).toBe(1000);
    });
});
