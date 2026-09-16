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

    test('rejects category_id genuinely owned by a different real user (no INSERT runs)', async () => {
        // A category owned by a different real user has a non-null, foreign user_id,
        // so it never matches `user_id = $2 OR user_id IS NULL` and the check
        // correctly finds nothing.
        pool.query.mockResolvedValueOnce({ rows: [] }); // category ownership check finds nothing

        const res = await request(buildApp())
            .post('/api/recurring')
            .send({ type: 'expense', amount: 1000, description: 'Rent', frequency: 'monthly', day_of_month: 1, category_id: 'not-mine' });

        expect(res.status).toBe(400);
        expect(pool.query).toHaveBeenCalledTimes(1); // only the ownership check, no INSERT

        const [query, params] = pool.query.mock.calls[0];
        expect(query).toMatch(/WHERE id = \$1 AND \(user_id = \$2 OR user_id IS NULL\)/);
        expect(params).toEqual(['not-mine', 'user-123']);
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

    test('accepts category_id that is a shared legacy default (user_id IS NULL)', async () => {
        // Legacy global categories seeded by 001_initial_schema.sql have user_id
        // IS NULL and are not owned by any specific user -- the ownership check's
        // `OR user_id IS NULL` clause must let these through for pre-existing
        // accounts that still reference them.
        const recurring = { id: 3, type: 'expense', amount: '1000.00', description: 'Rent', frequency: 'monthly', category_id: 'legacy-cat' };
        pool.query
            .mockResolvedValueOnce({ rows: [{ id: 'legacy-cat' }] }) // ownership check matches via IS NULL
            .mockResolvedValueOnce({ rows: [recurring] });           // INSERT

        const res = await request(buildApp())
            .post('/api/recurring')
            .send({ type: 'expense', amount: 1000, description: 'Rent', frequency: 'monthly', day_of_month: 1, category_id: 'legacy-cat' });

        expect(res.status).toBe(201);
        expect(res.body.recurring).toMatchObject({ id: 3, category_id: 'legacy-cat' });
    });
});

describe('GET /api/recurring', () => {
    afterEach(() => pool.query.mockReset());

    test('scopes the categories join to the same user_id as the recurring transaction, or a shared legacy default', async () => {
        pool.query.mockResolvedValueOnce({ rows: [] });

        await request(buildApp()).get('/api/recurring');

        const [query] = pool.query.mock.calls[0];
        expect(query).toMatch(/LEFT JOIN categories c ON r\.category_id = c\.id AND \(c\.user_id = r\.user_id OR c\.user_id IS NULL\)/);
    });

    test('still populates category_name for a recurring item whose category is a shared legacy default (user_id IS NULL)', async () => {
        pool.query.mockResolvedValueOnce({
            rows: [{ id: 'r1', category_id: 'legacy-cat', category_name: 'Food', category_icon: '🍽️', category_color: '#FF6B6B' }],
        });

        const res = await request(buildApp()).get('/api/recurring');

        expect(res.status).toBe(200);
        expect(res.body.recurring).toHaveLength(1);
        expect(res.body.recurring[0]).toMatchObject({ id: 'r1', category_name: 'Food' });
    });
});

describe('PUT /api/recurring/:id', () => {
    afterEach(() => pool.query.mockReset());

    test('rejects category_id that does not belong to the user (no UPDATE runs)', async () => {
        pool.query.mockResolvedValueOnce({ rows: [] }); // category ownership check finds nothing

        const res = await request(buildApp())
            .put('/api/recurring/1')
            .send({ type: 'expense', amount: 1000, description: 'Rent', frequency: 'monthly', category_id: 'not-mine' });

        expect(res.status).toBe(400);
        expect(pool.query).toHaveBeenCalledTimes(1); // only the ownership check, no UPDATE
    });

    test('updates a recurring transaction when category_id belongs to the user', async () => {
        const updated = { id: 1, type: 'expense', amount: '1200.00', description: 'Rent', frequency: 'monthly', category_id: 'cat-1' };
        pool.query
            .mockResolvedValueOnce({ rows: [{ id: 'cat-1' }] })    // category ownership check passes
            .mockResolvedValueOnce({ rows: [{ amount: '1000' }] }) // oldRows lookup
            .mockResolvedValueOnce({ rows: [updated] });           // UPDATE

        const res = await request(buildApp())
            .put('/api/recurring/1')
            .send({ type: 'expense', amount: 1200, description: 'Rent', frequency: 'monthly', category_id: 'cat-1' });

        expect(res.status).toBe(200);
        expect(res.body.recurring).toMatchObject({ id: 1, category_id: 'cat-1' });
    });

    test('accepts category_id that is a shared legacy default (user_id IS NULL)', async () => {
        const updated = { id: 1, type: 'expense', amount: '1200.00', description: 'Rent', frequency: 'monthly', category_id: 'legacy-cat' };
        pool.query
            .mockResolvedValueOnce({ rows: [{ id: 'legacy-cat' }] }) // ownership check matches via IS NULL
            .mockResolvedValueOnce({ rows: [{ amount: '1000' }] })   // oldRows lookup
            .mockResolvedValueOnce({ rows: [updated] });             // UPDATE

        const res = await request(buildApp())
            .put('/api/recurring/1')
            .send({ type: 'expense', amount: 1200, description: 'Rent', frequency: 'monthly', category_id: 'legacy-cat' });

        expect(res.status).toBe(200);
        expect(res.body.recurring).toMatchObject({ id: 1, category_id: 'legacy-cat' });
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
