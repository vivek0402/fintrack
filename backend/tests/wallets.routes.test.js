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
const walletsRouter = require('../src/routes/wallets');

function buildApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/wallets', walletsRouter);
    return app;
}

const app = buildApp();

afterEach(() => {
    pool.query.mockReset();
});

describe('POST /api/wallets', () => {
    test('negative balance returns 400', async () => {
        const res = await request(app).post('/api/wallets').send({ name: 'Cash', balance: -10 });
        expect(res.status).toBe(400);
        expect(pool.query).not.toHaveBeenCalled();
    });

    test('empty name returns 400', async () => {
        const res = await request(app).post('/api/wallets').send({ name: '   ', balance: 100 });
        expect(res.status).toBe(400);
        expect(pool.query).not.toHaveBeenCalled();
    });
});

describe('PUT /api/wallets/:id', () => {
    test('returns 404 for a wallet belonging to a different user', async () => {
        pool.query.mockResolvedValueOnce({ rows: [] }); // ownership check finds nothing

        const res = await request(app).put('/api/wallets/not-mine').send({ name: 'Renamed' });

        expect(res.status).toBe(404);
        expect(pool.query).toHaveBeenCalledTimes(1);
    });

    test('a partial update (name only) preserves the existing balance via COALESCE, not zero', async () => {
        pool.query.mockResolvedValueOnce({ rows: [{ id: 'w1' }] }); // ownership check passes
        pool.query.mockResolvedValueOnce({ rows: [{ id: 'w1', name: 'Renamed', balance: '250.00' }] }); // UPDATE

        const res = await request(app).put('/api/wallets/w1').send({ name: 'Renamed' });

        expect(res.status).toBe(200);
        expect(res.body.wallet.balance).toBe('250.00');
        const updateCallParams = pool.query.mock.calls[1][1];
        expect(updateCallParams[2]).toBeUndefined(); // balance param passed through as undefined -> COALESCE keeps existing value
    });

    test('negative balance on update returns 400', async () => {
        pool.query.mockResolvedValueOnce({ rows: [{ id: 'w1' }] }); // ownership check passes

        const res = await request(app).put('/api/wallets/w1').send({ balance: -5 });

        expect(res.status).toBe(400);
        expect(pool.query).toHaveBeenCalledTimes(1);
    });
});

describe('DELETE /api/wallets/:id', () => {
    test('returns 404 for a wallet belonging to a different user', async () => {
        pool.query.mockResolvedValueOnce({ rowCount: 0 });

        const res = await request(app).delete('/api/wallets/not-mine');

        expect(res.status).toBe(404);
    });

    test('deletes successfully when the wallet belongs to the caller', async () => {
        pool.query.mockResolvedValueOnce({ rowCount: 1 });

        const res = await request(app).delete('/api/wallets/w1');

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });
});
