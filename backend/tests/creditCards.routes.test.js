process.env.JWT_SECRET = 'test-secret';

jest.mock('../src/db/pool', () => ({
    query: jest.fn(),
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

const app = buildApp();

afterEach(() => {
    pool.query.mockReset();
});

describe('POST /api/credit-cards', () => {
    test('persists interest_rate_pct when provided', async () => {
        pool.query.mockResolvedValueOnce({ rows: [{ id: 1, interest_rate_pct: '39.5' }] });

        const res = await request(app)
            .post('/api/credit-cards')
            .send({ bank_name: 'HDFC', card_name: 'Millennia', interest_rate_pct: 39.5 });

        expect(res.status).toBe(201);
        expect(res.body.card.interest_rate_pct).toBe('39.5');
        const [, params] = pool.query.mock.calls[0];
        expect(params).toContain(39.5);
    });

    test('defaults interest_rate_pct to null when not provided', async () => {
        pool.query.mockResolvedValueOnce({ rows: [{ id: 1, interest_rate_pct: null }] });

        const res = await request(app)
            .post('/api/credit-cards')
            .send({ bank_name: 'HDFC', card_name: 'Millennia' });

        expect(res.status).toBe(201);
        const [, params] = pool.query.mock.calls[0];
        expect(params).toContain(null);
    });

    test('rejects a negative interest_rate_pct with 400', async () => {
        const res = await request(app)
            .post('/api/credit-cards')
            .send({ bank_name: 'HDFC', card_name: 'Millennia', interest_rate_pct: -5 });

        expect(res.status).toBe(400);
        expect(pool.query).not.toHaveBeenCalled();
    });
});

describe('PUT /api/credit-cards/:id', () => {
    test('updates only interest_rate_pct, leaving other fields via COALESCE', async () => {
        pool.query.mockResolvedValueOnce({ rows: [{ id: 1 }] }); // ownership check
        pool.query.mockResolvedValueOnce({ rows: [{ id: 1, interest_rate_pct: '42' }] }); // update

        const res = await request(app)
            .put('/api/credit-cards/1')
            .send({ interest_rate_pct: 42 });

        expect(res.status).toBe(200);
        const [sql, params] = pool.query.mock.calls[1];
        expect(sql).toContain('COALESCE($10, interest_rate_pct)');
        expect(params).toContain(42);
    });

    test('rejects a negative interest_rate_pct with 400', async () => {
        pool.query.mockResolvedValueOnce({ rows: [{ id: 1 }] }); // ownership check

        const res = await request(app)
            .put('/api/credit-cards/1')
            .send({ interest_rate_pct: -1 });

        expect(res.status).toBe(400);
        expect(pool.query).toHaveBeenCalledTimes(1); // only the ownership check, no UPDATE
    });
});
