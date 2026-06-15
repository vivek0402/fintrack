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
