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
const goalsRouter = require('../src/routes/goals');

function buildApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/goals', goalsRouter);
    return app;
}

describe('POST /api/goals', () => {
    afterEach(() => pool.query.mockReset());

    test('rejects missing name/target_amount', async () => {
        const res = await request(buildApp()).post('/api/goals').send({ name: 'Trip' });
        expect(res.status).toBe(400);
        expect(pool.query).not.toHaveBeenCalled();
    });

    test('rejects non-positive target_amount', async () => {
        const res = await request(buildApp()).post('/api/goals').send({ name: 'Trip', target_amount: -5 });
        expect(res.status).toBe(400);
        expect(pool.query).not.toHaveBeenCalled();
    });

    test('creates a goal with valid input', async () => {
        const goal = { id: 1, name: 'Trip', target_amount: '1000.00', saved_amount: '0.00' };
        pool.query.mockResolvedValueOnce({ rows: [goal] });

        const res = await request(buildApp()).post('/api/goals').send({ name: 'Trip', target_amount: 1000 });

        expect(res.status).toBe(201);
        expect(res.body.goal).toMatchObject({ id: 1, name: 'Trip' });
    });
});

describe('PATCH /api/goals/:id/funds', () => {
    afterEach(() => pool.query.mockReset());

    test('rejects non-numeric amount', async () => {
        const res = await request(buildApp()).patch('/api/goals/1/funds').send({ amount: 'abc' });
        expect(res.status).toBe(400);
        expect(pool.query).not.toHaveBeenCalled();
    });

    test('returns 404 when goal not found', async () => {
        pool.query.mockResolvedValueOnce({ rows: [] });

        const res = await request(buildApp()).patch('/api/goals/999/funds').send({ amount: 100 });

        expect(res.status).toBe(404);
    });

    test('updates saved_amount for a valid request', async () => {
        const goal = { id: 1, name: 'Trip', target_amount: '1000.00', saved_amount: '100.00' };
        pool.query
            .mockResolvedValueOnce({ rows: [goal] }) // UPDATE savings_goals
            .mockResolvedValueOnce({ rows: [{ total: '100.00' }] }); // total savings check

        const res = await request(buildApp()).patch('/api/goals/1/funds').send({ amount: 50 });

        expect(res.status).toBe(200);
        expect(res.body.goal).toMatchObject({ id: 1 });
    });
});
