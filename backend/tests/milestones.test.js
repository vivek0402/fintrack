process.env.JWT_SECRET = 'test-secret';

jest.mock('../src/db/pool', () => ({ query: jest.fn() }));
jest.mock('../src/middleware/auth', () => (req, res, next) => {
    req.user = { id: 'user-123', email: 'test@example.com' };
    next();
});

const express = require('express');
const request = require('supertest');
const pool = require('../src/db/pool');
const milestonesRouter = require('../src/routes/milestones');

function buildApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/milestones', milestonesRouter);
    return app;
}

const app = buildApp();

afterEach(() => pool.query.mockReset());

describe('POST /api/milestones', () => {
    test('creates a valid milestone', async () => {
        const newMilestone = {
            id: 'milestone-1',
            user_id: 'user-123',
            name: 'Buy a house',
            description: null,
            target_date: '2030-01-01',
            target_amount: '5000000',
            current_amount: '0',
            parent_id: null,
            status: 'not_started',
            priority: 0,
            notes: null,
        };

        pool.query
            .mockResolvedValueOnce({ rows: [newMilestone] }) // INSERT
            .mockResolvedValueOnce({ rows: [] }); // average monthly savings

        const res = await request(app)
            .post('/api/milestones')
            .send({ name: 'Buy a house', target_date: '2030-01-01', target_amount: 5000000 });

        expect(res.status).toBe(201);
        expect(res.body.milestone).toMatchObject({ id: 'milestone-1', name: 'Buy a house' });
        expect(res.body.milestone.feasibility).toBeDefined();
    });

    test('with parent_id from another user returns 404', async () => {
        pool.query.mockResolvedValueOnce({ rows: [] }); // parent ownership check fails

        const res = await request(app)
            .post('/api/milestones')
            .send({ name: 'Sub-goal', target_date: '2028-01-01', parent_id: 'other-users-milestone' });

        expect(res.status).toBe(404);
    });
});

describe('PATCH /api/milestones/:id', () => {
    test('with circular parent_id returns 400', async () => {
        const milestoneA = {
            id: 'milestone-A',
            user_id: 'user-123',
            name: 'Milestone A',
            description: null,
            target_date: '2030-01-01',
            target_amount: '100000',
            current_amount: '0',
            parent_id: null,
            status: 'not_started',
            priority: 0,
            notes: null,
        };

        pool.query
            .mockResolvedValueOnce({ rows: [milestoneA] }) // SELECT existing milestone
            .mockResolvedValueOnce({ rows: [{ id: 'milestone-B' }] }) // parent ownership check
            .mockResolvedValueOnce({ rows: [{ parent_id: 'milestone-A' }] }); // chainContains walk

        const res = await request(app)
            .patch('/api/milestones/milestone-A')
            .send({ parent_id: 'milestone-B' });

        expect(res.status).toBe(400);
        expect(res.body.error).toBe('This would create a circular dependency');
    });
});

describe('PATCH /api/milestones/:id/progress', () => {
    test('auto-sets status to achieved when current_amount equals target_amount', async () => {
        const existing = {
            id: 'milestone-2',
            user_id: 'user-123',
            name: 'Emergency fund',
            description: null,
            target_date: '2027-01-01',
            target_amount: '100000',
            current_amount: '50000',
            parent_id: null,
            status: 'in_progress',
            priority: 0,
            notes: null,
        };

        const updated = { ...existing, current_amount: '100000', status: 'achieved' };

        pool.query
            .mockResolvedValueOnce({ rows: [existing] }) // SELECT existing
            .mockResolvedValueOnce({ rows: [updated] }) // UPDATE
            .mockResolvedValueOnce({ rows: [] }); // average monthly savings

        const res = await request(app)
            .patch('/api/milestones/milestone-2/progress')
            .send({ current_amount: 100000 });

        expect(res.status).toBe(200);
        expect(res.body.milestone.status).toBe('achieved');
    });
});

describe('GET /api/milestones — IST month boundary for lastNFullMonthsRange (average savings window)', () => {
    afterEach(() => jest.useRealTimers());

    test('uses the IST calendar month, not the UTC one, for the trailing 3-full-months savings window', async () => {
        // 2026-01-31T19:00:00.000Z is 2026-02-01 00:30 IST -- already February
        // in IST while UTC is still on January 31. "This month" (excluded) must
        // resolve to February, so the last 3 FULL months end at 2026-02-01 and
        // start at 2025-11-01 -- not a UTC-anchored January/October pair.
        jest.useFakeTimers().setSystemTime(new Date('2026-01-31T19:00:00.000Z'));

        pool.query
            .mockResolvedValueOnce({ rows: [] }) // milestones list
            .mockResolvedValueOnce({ rows: [] }); // average monthly savings

        await request(app).get('/api/milestones');

        const [, avgSavingsParams] = pool.query.mock.calls[1];
        expect(avgSavingsParams).toEqual(['user-123', '2025-11-01', '2026-02-01']);
    });
});

describe('DELETE /api/milestones/:id', () => {
    test('unlinks children', async () => {
        pool.query
            .mockResolvedValueOnce({ rows: [{ user_id: 'user-123' }] }) // ownership check
            .mockResolvedValueOnce({ rows: [{ count: 2 }] }) // count children
            .mockResolvedValueOnce({ rows: [] }); // DELETE

        const res = await request(app).delete('/api/milestones/milestone-3');

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ message: 'Milestone deleted', children_unlinked: 2 });
    });
});
