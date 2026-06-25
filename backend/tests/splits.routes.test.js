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
const splitsRouter = require('../src/routes/splits');

function buildApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/splits', splitsRouter);
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

describe('POST /api/splits', () => {
    test('a three-way split (you + 2 participants) of an odd amount sums back exactly to the total', async () => {
        pool.query.mockResolvedValueOnce({ rows: [{ id: 'tx-1' }] }); // INSERT transactions
        pool.query.mockImplementationOnce(async (sql, params) => {
            // INSERT expense_splits — echo back what was inserted so we can inspect shares
            return { rows: [{ id: 'split-1', your_share: params[5], participants: JSON.parse(params[6]) }] };
        });

        const res = await request(app)
            .post('/api/splits')
            .send({ description: 'Dinner', total_amount: 100, participants: [{ name: 'A' }, { name: 'B' }] });

        expect(res.status).toBe(201);
        const { your_share, participants } = res.body.split;
        const sum = participants.reduce((s, p) => s + p.share, parseFloat(your_share));
        expect(Math.round(sum * 100) / 100).toBe(100);
    });

    test('total_amount of 0 returns 400', async () => {
        const res = await request(app)
            .post('/api/splits')
            .send({ description: 'Dinner', total_amount: 0, participants: [{ name: 'A' }] });

        expect(res.status).toBe(400);
        expect(pool.query).not.toHaveBeenCalled();
    });

    test('negative total_amount returns 400', async () => {
        const res = await request(app)
            .post('/api/splits')
            .send({ description: 'Dinner', total_amount: -50, participants: [{ name: 'A' }] });

        expect(res.status).toBe(400);
        expect(pool.query).not.toHaveBeenCalled();
    });
});

describe('PATCH /api/splits/:id/settle/:index', () => {
    test('an out-of-range participant index returns 400', async () => {
        pool.query.mockResolvedValueOnce({
            rows: [{ id: 'split-1', participants: [{ name: 'A', share: 50, settled: false }] }],
        });

        const res = await request(app).patch('/api/splits/split-1/settle/5');

        expect(res.status).toBe(400);
        expect(res.body.error).toBe('Invalid participant index');
    });
});

describe('DELETE /api/splits/:id', () => {
    test('deletes the split row and its linked transaction in the same transaction', async () => {
        const calls = [];
        const client = mockClient(async (sql, params) => {
            calls.push(sql);
            if (sql === 'BEGIN' || sql === 'COMMIT') return {};
            if (sql.includes('SELECT transaction_id FROM expense_splits')) return { rows: [{ transaction_id: 'tx-1' }] };
            if (sql.includes('DELETE FROM expense_splits')) return { rowCount: 1 };
            if (sql.includes('DELETE FROM transactions')) return { rowCount: 1 };
            throw new Error(`Unexpected query: ${sql}`);
        });
        pool.connect.mockResolvedValue(client);

        const res = await request(app).delete('/api/splits/split-1');

        expect(res.status).toBe(200);
        expect(calls.some(s => s.includes('DELETE FROM expense_splits'))).toBe(true);
        expect(calls.some(s => s.includes('DELETE FROM transactions'))).toBe(true);
        expect(calls).toContain('COMMIT');
        expect(client.release).toHaveBeenCalled();
    });

    test('returns 404 and rolls back when the split does not belong to the caller', async () => {
        const client = mockClient(async (sql) => {
            if (sql === 'BEGIN' || sql === 'ROLLBACK') return {};
            if (sql.includes('SELECT transaction_id FROM expense_splits')) return { rows: [] };
            throw new Error(`Unexpected query: ${sql}`);
        });
        pool.connect.mockResolvedValue(client);

        const res = await request(app).delete('/api/splits/not-mine');

        expect(res.status).toBe(404);
        expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    });
});
