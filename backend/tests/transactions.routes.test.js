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
    collectEntrySignals: jest.fn(),
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

    test('rejects category_id that does not belong to the user (no INSERT runs)', async () => {
        pool.query.mockResolvedValueOnce({ rows: [] }); // category ownership check finds nothing

        const res = await request(buildApp())
            .post('/api/transactions')
            .send({ type: 'expense', amount: 50, description: 'Lunch', date: '2026-06-01', category_id: 'not-mine' });

        expect(res.status).toBe(400);
        expect(pool.query).toHaveBeenCalledTimes(1); // only the ownership check, no INSERT
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

    test('rejects category_id that does not belong to the user (no UPDATE runs)', async () => {
        pool.query.mockResolvedValueOnce({ rows: [] }); // category ownership check finds nothing

        const res = await request(buildApp())
            .put('/api/transactions/1')
            .send({ category_id: 'not-mine' });

        expect(res.status).toBe(400);
        expect(pool.query).toHaveBeenCalledTimes(1); // only the ownership check ran
        expect(pool.connect).not.toHaveBeenCalled();
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
