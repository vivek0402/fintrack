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
const groupsRouter = require('../src/routes/groups');

function buildApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/groups', groupsRouter);
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

describe('POST /api/groups', () => {
    test('rolls back the whole transaction (including the group insert) if a member insert fails', async () => {
        const calls = [];
        const client = mockClient(async (sql, params) => {
            calls.push(sql);
            if (sql === 'BEGIN' || sql === 'ROLLBACK') return {};
            if (sql.includes('INSERT INTO expense_groups')) return { rows: [{ id: 'grp-1' }] };
            if (sql.includes('INSERT INTO group_members') && params[1] === 'Bob') throw new Error('boom');
            if (sql.includes('INSERT INTO group_members')) return {};
            throw new Error(`Unexpected query: ${sql}`);
        });
        pool.connect.mockResolvedValue(client);

        const res = await request(app)
            .post('/api/groups')
            .send({ name: 'Trip', members: [{ name: 'Alice' }, { name: 'Bob' }] });

        expect(res.status).toBe(500);
        expect(client.query).toHaveBeenCalledWith('ROLLBACK');
        expect(calls.some(s => s === 'COMMIT')).toBe(false);
        // No follow-up read of the (never-committed) group should happen.
        expect(pool.query).not.toHaveBeenCalled();
    });
});

describe('GET /api/groups/:id', () => {
    test("returns 404 for a group belonging to a different user", async () => {
        pool.query.mockResolvedValueOnce({ rows: [] });

        const res = await request(app).get('/api/groups/not-mine');

        expect(res.status).toBe(404);
        expect(pool.query).toHaveBeenCalledTimes(1);
    });
});

describe('PATCH /api/groups/:id/splits/:splitId/shares/:shareId/settle', () => {
    test('flips only the targeted share, not all shares in the split', async () => {
        pool.query.mockResolvedValueOnce({ rows: [{ id: 'share-2', settled: false }] }); // ownership + current state
        pool.query.mockResolvedValueOnce({ rows: [{ id: 'share-2', settled: true }] }); // UPDATE

        const res = await request(app).patch('/api/groups/grp-1/splits/split-1/shares/share-2/settle');

        expect(res.status).toBe(200);
        const updateCall = pool.query.mock.calls[1];
        expect(updateCall[0]).toMatch(/UPDATE group_split_shares SET settled/);
        expect(updateCall[0]).not.toMatch(/split_id/); // scoped by share id only, not the whole split
        expect(updateCall[1][2]).toBe('share-2');
        expect(res.body.share.settled).toBe(true);
    });
});
