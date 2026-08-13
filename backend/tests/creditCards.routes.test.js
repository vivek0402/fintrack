process.env.JWT_SECRET = 'test-secret';

jest.mock('../src/db/pool', () => ({
    query: jest.fn(),
    connect: jest.fn(),
}));
jest.mock('../src/middleware/auth', () => (req, res, next) => {
    req.user = { id: 'user-123', email: 'test@example.com' };
    next();
});

const express = require('express');
const request = require('supertest');
const pool = require('../src/db/pool');
const creditCardsRouter = require('../src/routes/creditCards');

function buildApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/credit-cards', creditCardsRouter);
    return app;
}

function mockClient(queryImpl) {
    return { query: jest.fn(queryImpl), release: jest.fn() };
}

afterEach(() => {
    pool.query.mockReset();
    pool.connect.mockReset();
});

describe('GET /api/credit-cards', () => {
    test('returns cards with the computed current_outstanding_balance field', async () => {
        pool.query.mockResolvedValueOnce({
            rows: [{ id: 1, bank_name: 'HDFC', card_name: 'Millennia', outstanding_balance: '1000.00', current_outstanding_balance: '1500.00' }],
        });

        const res = await request(buildApp()).get('/api/credit-cards');

        expect(res.status).toBe(200);
        expect(res.body.cards[0].current_outstanding_balance).toBe('1500.00');
        // The route must go through the canonical helper's query, not a bare
        // `SELECT * FROM credit_cards` -- that's the exact bug being fixed.
        const [sql] = pool.query.mock.calls[0];
        expect(sql).toMatch(/current_outstanding_balance/);
        expect(sql).toMatch(/LEFT JOIN transactions/);
    });
});

describe('POST /api/credit-cards', () => {
    test('persists interest_rate_pct when provided', async () => {
        pool.query.mockResolvedValueOnce({ rows: [{ id: 1, interest_rate_pct: '39.5', outstanding_balance: '0' }] });

        const res = await request(buildApp())
            .post('/api/credit-cards')
            .send({ bank_name: 'HDFC', card_name: 'Millennia', interest_rate_pct: 39.5 });

        expect(res.status).toBe(201);
        expect(res.body.card.interest_rate_pct).toBe('39.5');
        const [, params] = pool.query.mock.calls[0];
        expect(params).toContain(39.5);
    });

    test('defaults interest_rate_pct to null when not provided', async () => {
        pool.query.mockResolvedValueOnce({ rows: [{ id: 1, interest_rate_pct: null, outstanding_balance: '0' }] });

        const res = await request(buildApp())
            .post('/api/credit-cards')
            .send({ bank_name: 'HDFC', card_name: 'Millennia' });

        expect(res.status).toBe(201);
        const [, params] = pool.query.mock.calls[0];
        expect(params).toContain(null);
    });

    test('rejects a negative interest_rate_pct with 400', async () => {
        const res = await request(buildApp())
            .post('/api/credit-cards')
            .send({ bank_name: 'HDFC', card_name: 'Millennia', interest_rate_pct: -5 });

        expect(res.status).toBe(400);
        expect(pool.query).not.toHaveBeenCalled();
    });
});

describe('PUT /api/credit-cards/:id', () => {
    test('updates only interest_rate_pct, leaving other fields via COALESCE', async () => {
        pool.query
            .mockResolvedValueOnce({ rows: [{ id: 1 }] })                              // ownership check
            .mockResolvedValueOnce({ rows: [{ id: 1, interest_rate_pct: '42' }] })      // UPDATE ... RETURNING *
            .mockResolvedValueOnce({ rows: [{ id: 1, interest_rate_pct: '42' }] });     // refreshed card

        const res = await request(buildApp())
            .put('/api/credit-cards/1')
            .send({ interest_rate_pct: 42 });

        expect(res.status).toBe(200);
        const [sql, params] = pool.query.mock.calls[1];
        expect(sql).toContain('COALESCE($10, interest_rate_pct)');
        expect(params).toContain(42);
    });

    test('rejects a negative interest_rate_pct with 400', async () => {
        pool.query.mockResolvedValueOnce({ rows: [{ id: 1 }] }); // ownership check

        const res = await request(buildApp())
            .put('/api/credit-cards/1')
            .send({ interest_rate_pct: -1 });

        expect(res.status).toBe(400);
        expect(pool.query).toHaveBeenCalledTimes(1); // only the ownership check, no UPDATE
    });

    test('resets balance_as_of only when the client explicitly sends the key', async () => {
        pool.query
            .mockResolvedValueOnce({ rows: [{ id: 1 }] })                       // ownership check
            .mockResolvedValueOnce({ rows: [{ id: 1, outstanding_balance: 500 }] }) // UPDATE ... RETURNING *
            .mockResolvedValueOnce({ rows: [{ id: 1, current_outstanding_balance: 500 }] }); // refreshed card

        const res = await request(buildApp())
            .put('/api/credit-cards/1')
            .send({ outstanding_balance: 500, balance_as_of: '2026-06-01' });

        expect(res.status).toBe(200);
        const [, updateParams] = pool.query.mock.calls[1];
        // newBalanceAsOf !== undefined -> true, and the date value itself
        expect(updateParams[updateParams.length - 2]).toBe(true);
        expect(updateParams[updateParams.length - 1]).toBe('2026-06-01');
    });

    test('leaves balance_as_of untouched when the key is omitted', async () => {
        pool.query
            .mockResolvedValueOnce({ rows: [{ id: 1 }] })
            .mockResolvedValueOnce({ rows: [{ id: 1 }] })
            .mockResolvedValueOnce({ rows: [{ id: 1 }] });

        const res = await request(buildApp())
            .put('/api/credit-cards/1')
            .send({ outstanding_balance: 500 });

        expect(res.status).toBe(200);
        const [, updateParams] = pool.query.mock.calls[1];
        expect(updateParams[updateParams.length - 2]).toBe(false);
    });
});

describe('POST /api/credit-cards/:id/pay', () => {
    test('atomically inserts both legs and returns the refreshed card', async () => {
        const calls = [];
        const client = mockClient(async (sql, params) => {
            calls.push(sql);
            if (sql.includes('FROM credit_cards')) return { rows: [{ id: 'card-1', bank_name: 'HDFC', card_name: 'Millennia' }] };
            if (sql.includes('FROM bank_accounts')) return { rows: [{ id: 42, name: 'Main Account' }] };
            if (sql === 'BEGIN' || sql === 'COMMIT') return {};
            if (sql.includes("VALUES ($1,'expense'")) {
                expect(params[6]).toBe(42); // account_id
                return { rows: [{ id: 'tx-1', type: 'expense', amount: 300, account_id: 42 }] };
            }
            if (sql.includes("VALUES ($1,'income'")) {
                expect(params[6]).toBe('card-1'); // credit_card_id
                return { rows: [{ id: 'tx-2', type: 'income', amount: 300, credit_card_id: 'card-1' }] };
            }
            throw new Error(`Unexpected client query: ${sql}`);
        });
        pool.connect.mockResolvedValue(client);
        pool.query.mockResolvedValueOnce({ rows: [{ id: 'card-1', current_outstanding_balance: 700 }] }); // refreshed card

        const res = await request(buildApp())
            .post('/api/credit-cards/card-1/pay')
            .send({ bank_account_id: 42, amount: 300, date: '2026-06-15' });

        expect(res.status).toBe(201);
        expect(res.body.transactions).toHaveLength(2);
        expect(res.body.card.current_outstanding_balance).toBe(700);
        expect(calls).toContain('BEGIN');
        expect(calls).toContain('COMMIT');
        expect(calls.some(sql => sql.includes("VALUES ($1,'expense'"))).toBe(true);
        expect(calls.some(sql => sql.includes("VALUES ($1,'income'"))).toBe(true);
        // Both legs must share one transfer_group_id so they can be deleted together.
        const expenseCall = client.query.mock.calls.find(([sql]) => sql.includes("VALUES ($1,'expense'"));
        const incomeCall = client.query.mock.calls.find(([sql]) => sql.includes("VALUES ($1,'income'"));
        expect(expenseCall[1][expenseCall[1].length - 1]).toBe(incomeCall[1][incomeCall[1].length - 1]);
        expect(client.release).toHaveBeenCalled();
    });

    test('releases the client exactly once when the card is not found (no double-release)', async () => {
        const client = mockClient(async (sql) => {
            if (sql.includes('FROM credit_cards')) return { rows: [] }; // card not found
            if (sql.includes('FROM bank_accounts')) return { rows: [{ id: 42, name: 'Main Account' }] };
            throw new Error(`Unexpected client query: ${sql}`);
        });
        pool.connect.mockResolvedValue(client);

        const res = await request(buildApp())
            .post('/api/credit-cards/card-1/pay')
            .send({ bank_account_id: 42, amount: 300, date: '2026-06-15' });

        expect(res.status).toBe(404);
        expect(client.release).toHaveBeenCalledTimes(1);
    });

    test('rejects a non-positive amount before touching the database', async () => {
        const res = await request(buildApp())
            .post('/api/credit-cards/card-1/pay')
            .send({ bank_account_id: 42, amount: 0, date: '2026-06-15' });

        expect(res.status).toBe(400);
        expect(pool.connect).not.toHaveBeenCalled();
    });

    test('rolls back if a leg insert throws', async () => {
        const client = mockClient(async (sql) => {
            if (sql.includes('FROM credit_cards')) return { rows: [{ id: 'card-1', bank_name: 'HDFC', card_name: 'Millennia' }] };
            if (sql.includes('FROM bank_accounts')) return { rows: [{ id: 42, name: 'Main Account' }] };
            if (sql === 'BEGIN' || sql === 'ROLLBACK') return {};
            if (sql.includes("VALUES ($1,'expense'")) throw new Error('boom');
            throw new Error(`Unexpected client query: ${sql}`);
        });
        pool.connect.mockResolvedValue(client);

        const res = await request(buildApp())
            .post('/api/credit-cards/card-1/pay')
            .send({ bank_account_id: 42, amount: 300, date: '2026-06-15' });

        expect(res.status).toBe(500);
        expect(client.query).toHaveBeenCalledWith('ROLLBACK');
        expect(client.query.mock.calls.some(([sql]) => sql === 'COMMIT')).toBe(false);
        expect(client.release).toHaveBeenCalled();
    });
});
