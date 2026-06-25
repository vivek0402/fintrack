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
const budgetsRouter = require('../src/routes/budgets');

function buildApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/budgets', budgetsRouter);
    return app;
}

const app = buildApp();

afterEach(() => {
    pool.query.mockReset();
});

describe('POST /api/budgets', () => {
    test('reposting the same category/month/year upserts via ON CONFLICT instead of duplicating', async () => {
        pool.query.mockImplementation(async (sql) => {
            expect(sql).toMatch(/ON CONFLICT \(user_id, category_id, month, year\)\s+DO UPDATE/);
            return { rows: [{ id: 'b1', amount: '500' }] };
        });

        const payload = { category_id: 'cat-1', amount: 500, month: 6, year: 2026 };
        const res1 = await request(app).post('/api/budgets').send(payload);
        const res2 = await request(app).post('/api/budgets').send(payload);

        expect(res1.status).toBe(201);
        expect(res2.status).toBe(201);
        expect(pool.query).toHaveBeenCalledTimes(2);
    });

    test('negative amount returns 400', async () => {
        const res = await request(app)
            .post('/api/budgets')
            .send({ category_id: 'cat-1', amount: -100, month: 6, year: 2026 });

        expect(res.status).toBe(400);
        expect(pool.query).not.toHaveBeenCalled();
    });
});

describe('DELETE /api/budgets/:id', () => {
    test("returns 404 for a budget belonging to a different user", async () => {
        pool.query.mockResolvedValueOnce({ rows: [] });

        const res = await request(app).delete('/api/budgets/not-mine');

        expect(res.status).toBe(404);
    });
});

describe('GET /api/budgets', () => {
    test('a budget with zero matching transactions reports spent: 0, not null', async () => {
        pool.query.mockResolvedValueOnce({
            rows: [{ id: 'b1', category_id: 'cat-1', amount: '500', spent: '0' }],
        });

        const res = await request(app).get('/api/budgets?month=6&year=2026');

        expect(res.status).toBe(200);
        expect(res.body.budgets[0].spent).not.toBeNull();
        expect(parseFloat(res.body.budgets[0].spent)).toBe(0);
    });
});
