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
            if (sql.includes('FROM categories')) return { rows: [{ id: 'cat-1' }] }; // ownership check
            expect(sql).toMatch(/ON CONFLICT \(user_id, category_id, month, year\)\s+DO UPDATE/);
            return { rows: [{ id: 'b1', amount: '500' }] };
        });

        const payload = { category_id: 'cat-1', amount: 500, month: 6, year: 2026 };
        const res1 = await request(app).post('/api/budgets').send(payload);
        const res2 = await request(app).post('/api/budgets').send(payload);

        expect(res1.status).toBe(201);
        expect(res2.status).toBe(201);
        expect(pool.query).toHaveBeenCalledTimes(4); // 2 requests x (ownership check + upsert)
    });

    test('negative amount returns 400', async () => {
        const res = await request(app)
            .post('/api/budgets')
            .send({ category_id: 'cat-1', amount: -100, month: 6, year: 2026 });

        expect(res.status).toBe(400);
        expect(pool.query).not.toHaveBeenCalled();
    });

    test('rejects category_id that does not belong to the user (no INSERT/UPSERT runs)', async () => {
        pool.query.mockResolvedValueOnce({ rows: [] }); // category ownership check finds nothing

        const res = await request(app)
            .post('/api/budgets')
            .send({ category_id: 'not-mine', amount: 500, month: 6, year: 2026 });

        expect(res.status).toBe(400);
        expect(pool.query).toHaveBeenCalledTimes(1); // only the ownership check, no INSERT/UPSERT
    });

    test('creates a budget when category_id belongs to the user', async () => {
        pool.query
            .mockResolvedValueOnce({ rows: [{ id: 'cat-1' }] })             // category ownership check
            .mockResolvedValueOnce({ rows: [{ id: 'b1', amount: '500' }] }); // INSERT/UPSERT

        const res = await request(app)
            .post('/api/budgets')
            .send({ category_id: 'cat-1', amount: 500, month: 6, year: 2026 });

        expect(res.status).toBe(201);
        expect(res.body.budget).toMatchObject({ id: 'b1' });
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

    test('scopes the categories join to the same user_id as the budget (no cross-user leakage)', async () => {
        pool.query.mockResolvedValueOnce({ rows: [] });

        await request(app).get('/api/budgets?month=6&year=2026');

        const [query] = pool.query.mock.calls[0];
        expect(query).toMatch(/JOIN categories c ON b\.category_id = c\.id AND c\.user_id = b\.user_id/);
    });
});
