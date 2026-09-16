process.env.JWT_SECRET = 'test-secret';

jest.mock('../src/db/pool', () => ({
    query: jest.fn(),
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
const recurringRouter = require('../src/routes/recurring');

function buildApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/recurring', recurringRouter);
    return app;
}

describe('POST /api/recurring', () => {
    afterEach(() => pool.query.mockReset());

    test('rejects missing required fields', async () => {
        const res = await request(buildApp()).post('/api/recurring').send({ type: 'expense' });
        expect(res.status).toBe(400);
        expect(pool.query).not.toHaveBeenCalled();
    });

    test('rejects an invalid type', async () => {
        const res = await request(buildApp())
            .post('/api/recurring')
            .send({ type: 'savings', amount: 100, description: 'Rent', frequency: 'monthly', day_of_month: 1 });
        expect(res.status).toBe(400);
        expect(pool.query).not.toHaveBeenCalled();
    });

    test('rejects a non-positive amount', async () => {
        const res = await request(buildApp())
            .post('/api/recurring')
            .send({ type: 'expense', amount: 0, description: 'Rent', frequency: 'monthly', day_of_month: 1 });
        expect(res.status).toBe(400);
        expect(pool.query).not.toHaveBeenCalled();
    });

    test('rejects an invalid frequency', async () => {
        const res = await request(buildApp())
            .post('/api/recurring')
            .send({ type: 'expense', amount: 100, description: 'Rent', frequency: 'yearly' });
        expect(res.status).toBe(400);
        expect(pool.query).not.toHaveBeenCalled();
    });

    test('creates a recurring transaction with valid input', async () => {
        const recurring = { id: 1, type: 'expense', amount: '1000.00', description: 'Rent', frequency: 'monthly' };
        pool.query.mockResolvedValueOnce({ rows: [recurring] });

        const res = await request(buildApp())
            .post('/api/recurring')
            .send({ type: 'expense', amount: 1000, description: 'Rent', frequency: 'monthly', day_of_month: 1 });

        expect(res.status).toBe(201);
        expect(res.body.recurring).toMatchObject({ id: 1, description: 'Rent' });
    });

    test('rejects category_id that does not belong to the user (no INSERT runs)', async () => {
        pool.query.mockResolvedValueOnce({ rows: [] }); // category ownership check finds nothing

        const res = await request(buildApp())
            .post('/api/recurring')
            .send({ type: 'expense', amount: 1000, description: 'Rent', frequency: 'monthly', day_of_month: 1, category_id: 'not-mine' });

        expect(res.status).toBe(400);
        expect(pool.query).toHaveBeenCalledTimes(1); // only the ownership check, no INSERT
    });

    test('creates a recurring transaction when category_id belongs to the user', async () => {
        const recurring = { id: 2, type: 'expense', amount: '1000.00', description: 'Rent', frequency: 'monthly', category_id: 'cat-1' };
        pool.query
            .mockResolvedValueOnce({ rows: [{ id: 'cat-1' }] }) // category ownership check passes
            .mockResolvedValueOnce({ rows: [recurring] });      // INSERT

        const res = await request(buildApp())
            .post('/api/recurring')
            .send({ type: 'expense', amount: 1000, description: 'Rent', frequency: 'monthly', day_of_month: 1, category_id: 'cat-1' });

        expect(res.status).toBe(201);
        expect(res.body.recurring).toMatchObject({ id: 2, category_id: 'cat-1' });
    });
});

describe('GET /api/recurring', () => {
    afterEach(() => pool.query.mockReset());

    test('scopes the categories join to the same user_id as the recurring transaction (no cross-user leakage)', async () => {
        pool.query.mockResolvedValueOnce({ rows: [] });

        await request(buildApp()).get('/api/recurring');

        const [query] = pool.query.mock.calls[0];
        expect(query).toMatch(/LEFT JOIN categories c ON r\.category_id = c\.id AND c\.user_id = r\.user_id/);
    });
});

describe('PATCH /api/recurring/:id/toggle', () => {
    afterEach(() => pool.query.mockReset());

    test('returns 404 when not found', async () => {
        pool.query.mockResolvedValueOnce({ rows: [] });

        const res = await request(buildApp()).patch('/api/recurring/999/toggle');

        expect(res.status).toBe(404);
    });

    test('toggles is_active for a valid id', async () => {
        pool.query.mockResolvedValueOnce({ rows: [{ id: 1, is_active: false }] });

        const res = await request(buildApp()).patch('/api/recurring/1/toggle');

        expect(res.status).toBe(200);
        expect(res.body.recurring).toMatchObject({ id: 1, is_active: false });
    });
});
