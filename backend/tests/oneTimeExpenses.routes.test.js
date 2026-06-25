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
const expensesRouter = require('../src/routes/oneTimeExpenses');

function buildApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/one-time-expenses', expensesRouter);
    return app;
}

const app = buildApp();

function mockClient(queryImpl) {
    return { query: jest.fn(queryImpl), release: jest.fn() };
}

afterEach(() => {
    pool.query.mockReset();
    pool.connect.mockReset();
});

describe('POST /api/one-time-expenses', () => {
    test('a new parent expense starts at zero with no items', async () => {
        pool.query.mockResolvedValueOnce({ rows: [{ id: 'exp-1', title: 'Trip', amount: '0' }] });

        const res = await request(app).post('/api/one-time-expenses').send({ title: 'Trip' });

        expect(res.status).toBe(201);
        expect(res.body.expense.total_amount).toBe(0);
        expect(res.body.expense.item_count).toBe(0);
        expect(res.body.expense.items).toEqual([]);
    });
});

describe('GET /api/one-time-expenses', () => {
    test('skips the items query entirely when there are no expenses', async () => {
        pool.query.mockResolvedValueOnce({ rows: [] });

        const res = await request(app).get('/api/one-time-expenses');

        expect(res.status).toBe(200);
        expect(res.body.expenses).toEqual([]);
        expect(pool.query).toHaveBeenCalledTimes(1);
    });
});

describe('POST /api/one-time-expenses/:id/items', () => {
    test('adding an item recomputes the parent total via the SUM subquery', async () => {
        const calls = [];
        const client = mockClient(async (sql, params) => {
            calls.push(sql);
            if (sql === 'BEGIN' || sql === 'COMMIT') return {};
            if (sql.includes('SELECT * FROM one_time_expenses')) return { rows: [{ id: 'exp-1', title: 'Trip', bank_account_id: null }] };
            if (sql.includes('SELECT id FROM categories')) return { rows: [] };
            if (sql.includes('INSERT INTO transactions')) return { rows: [{ id: 'tx-1' }] };
            if (sql.includes('INSERT INTO one_time_expense_items')) return { rows: [{ id: 'item-1', amount: '500' }] };
            if (sql.includes('UPDATE one_time_expenses') && sql.includes('computed_amount')) return {};
            throw new Error(`Unexpected query: ${sql}`);
        });
        pool.connect.mockResolvedValue(client);

        const res = await request(app)
            .post('/api/one-time-expenses/exp-1/items')
            .send({ description: 'Hotel', amount: 500, date: '2026-06-20' });

        expect(res.status).toBe(201);
        const recomputeCall = calls.find(s => s.includes('computed_amount'));
        expect(recomputeCall).toMatch(/COALESCE\(SUM\(amount\), 0\)/);
    });
});

describe('DELETE /api/one-time-expenses/:id/items/:itemId', () => {
    test('removing the last item still recomputes the total down to zero', async () => {
        const calls = [];
        const client = mockClient(async (sql) => {
            calls.push(sql);
            if (sql === 'BEGIN' || sql === 'COMMIT') return {};
            if (sql.includes('SELECT * FROM one_time_expense_items')) return { rows: [{ id: 'item-1', transaction_id: 'tx-1' }] };
            if (sql.includes('DELETE FROM transactions')) return {};
            if (sql.includes('DELETE FROM one_time_expense_items')) return {};
            if (sql.includes('UPDATE one_time_expenses') && sql.includes('computed_amount')) return {};
            throw new Error(`Unexpected query: ${sql}`);
        });
        pool.connect.mockResolvedValue(client);

        const res = await request(app).delete('/api/one-time-expenses/exp-1/items/item-1');

        expect(res.status).toBe(200);
        const recomputeCall = calls.find(s => s.includes('computed_amount'));
        expect(recomputeCall).toBeDefined();
        expect(recomputeCall).toMatch(/COALESCE\(SUM\(amount\), 0\)/);
        // The recompute happens after the item row is actually gone.
        expect(calls.indexOf(recomputeCall)).toBeGreaterThan(calls.findIndex(s => s.includes('DELETE FROM one_time_expense_items')));
    });
});
