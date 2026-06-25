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
const accountsRouter = require('../src/routes/accounts');

function buildApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/accounts', accountsRouter);
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

describe('POST /api/accounts', () => {
    test('is_default:true unsets the prior default and backfills orphaned transactions', async () => {
        const calls = [];
        const client = mockClient(async (sql, params) => {
            calls.push(sql);
            if (sql === 'BEGIN' || sql === 'COMMIT') return {};
            if (sql.includes('UPDATE bank_accounts SET is_default = FALSE')) return { rows: [] };
            if (sql.includes('INSERT INTO bank_accounts')) return { rows: [{ id: 'acc-1', name: 'New Account' }] };
            if (sql.includes('UPDATE transactions SET account_id')) return { rowCount: 3 };
            throw new Error(`Unexpected query: ${sql}`);
        });
        pool.connect.mockResolvedValue(client);

        const res = await request(app)
            .post('/api/accounts')
            .send({ name: 'New Account', is_default: true });

        expect(res.status).toBe(201);
        expect(res.body.transactions_linked).toBe(3);
        // Unset-old-default must happen before the insert.
        const unsetIdx = calls.findIndex(s => s.includes('is_default = FALSE'));
        const insertIdx = calls.findIndex(s => s.includes('INSERT INTO bank_accounts'));
        expect(unsetIdx).toBeGreaterThanOrEqual(0);
        expect(unsetIdx).toBeLessThan(insertIdx);
    });
});

describe('PATCH /api/accounts/:id — ownership', () => {
    test('returns 404 for an account belonging to a different user, with no further writes', async () => {
        pool.query.mockResolvedValueOnce({ rows: [] }); // ownership check finds nothing

        const res = await request(app)
            .patch('/api/accounts/acc-999')
            .send({ name: 'Hacked' });

        expect(res.status).toBe(404);
        expect(pool.connect).not.toHaveBeenCalled();
    });
});

describe('PATCH /api/accounts/:id/set-default', () => {
    test('rolls back if the transaction-linking UPDATE throws mid-transaction', async () => {
        pool.query.mockResolvedValueOnce({ rows: [{ id: 'acc-1' }] }); // ownership check passes

        const client = mockClient(async (sql) => {
            if (sql === 'BEGIN' || sql === 'ROLLBACK') return {};
            if (sql.includes('UPDATE bank_accounts SET is_default = FALSE')) return {};
            if (sql.includes('SET is_default = TRUE')) return {};
            if (sql.includes('UPDATE transactions SET account_id')) throw new Error('boom');
            throw new Error(`Unexpected query: ${sql}`);
        });
        pool.connect.mockResolvedValue(client);

        const res = await request(app).patch('/api/accounts/acc-1/set-default');

        expect(res.status).toBe(500);
        expect(client.query).toHaveBeenCalledWith('ROLLBACK');
        expect(client.query.mock.calls.some(([sql]) => sql === 'COMMIT')).toBe(false);
        expect(client.release).toHaveBeenCalled();
    });
});

describe('DELETE /api/accounts/:id', () => {
    test('nulls account_id on linked transactions before deleting the account', async () => {
        const calls = [];
        const client = mockClient(async (sql) => {
            calls.push(sql);
            if (sql === 'BEGIN' || sql === 'COMMIT') return {};
            if (sql.includes('UPDATE transactions SET account_id = NULL')) return { rowCount: 2 };
            if (sql.includes('DELETE FROM bank_accounts')) return { rowCount: 1 };
            throw new Error(`Unexpected query: ${sql}`);
        });
        pool.connect.mockResolvedValue(client);

        const res = await request(app).delete('/api/accounts/acc-1');

        expect(res.status).toBe(200);
        const nullIdx = calls.findIndex(s => s.includes('SET account_id = NULL'));
        const deleteIdx = calls.findIndex(s => s.includes('DELETE FROM bank_accounts'));
        expect(nullIdx).toBeGreaterThanOrEqual(0);
        expect(nullIdx).toBeLessThan(deleteIdx);
    });

    test('returns 404 and rolls back when no matching account exists for this user', async () => {
        const client = mockClient(async (sql) => {
            if (sql === 'BEGIN' || sql === 'ROLLBACK') return {};
            if (sql.includes('UPDATE transactions SET account_id = NULL')) return { rowCount: 0 };
            if (sql.includes('DELETE FROM bank_accounts')) return { rowCount: 0 };
            throw new Error(`Unexpected query: ${sql}`);
        });
        pool.connect.mockResolvedValue(client);

        const res = await request(app).delete('/api/accounts/not-mine');

        expect(res.status).toBe(404);
        expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    });
});
