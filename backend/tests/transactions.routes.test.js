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

const express = require('express');
const request = require('supertest');
const pool = require('../src/db/pool');
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
});

describe('PUT /api/transactions/:id — credit_card_id', () => {
    afterEach(() => {
        pool.query.mockReset();
    });

    test('clears credit_card_id when payment_method moves away from Credit Card', async () => {
        pool.query
            .mockResolvedValueOnce({ rows: [{ id: 1 }] })       // ownership check
            .mockResolvedValueOnce({ rows: [{ id: 1, payment_method: 'Cash', credit_card_id: null }] }); // UPDATE ... RETURNING *

        const res = await request(buildApp())
            .put('/api/transactions/1')
            .send({ payment_method: 'Cash' });

        expect(res.status).toBe(200);
        // clearCreditCardId (param index 11, 0-based) must be true so the SQL's
        // CASE WHEN sets credit_card_id = NULL regardless of any stale value.
        const [, updateParams] = pool.query.mock.calls[1];
        expect(updateParams[11]).toBe(true);
    });

    test('does not touch credit_card_id when payment_method is unrelated to the update', async () => {
        pool.query
            .mockResolvedValueOnce({ rows: [{ id: 1 }] })
            .mockResolvedValueOnce({ rows: [{ id: 1 }] });

        const res = await request(buildApp())
            .put('/api/transactions/1')
            .send({ amount: 75 });

        expect(res.status).toBe(200);
        const [, updateParams] = pool.query.mock.calls[1];
        expect(updateParams[11]).toBe(false); // clearCreditCardId false -> COALESCE keeps existing value
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
