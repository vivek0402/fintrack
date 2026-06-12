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
});
