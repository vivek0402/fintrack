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
const notificationsRouter = require('../src/routes/notifications');

function buildApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/notifications', notificationsRouter);
    return app;
}

const ALL_ON = { budgetAlerts: true, billReminders: true, goalAlerts: true, weeklySummary: true };

describe('GET /api/notifications/prefs', () => {
    afterEach(() => pool.query.mockReset());

    test('returns all-on defaults and stored:false when never set', async () => {
        pool.query.mockResolvedValueOnce({ rows: [{ notification_prefs: null }] });

        const res = await request(buildApp()).get('/api/notifications/prefs');

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ prefs: ALL_ON, stored: false });
        expect(pool.query.mock.calls[0][1]).toEqual(['user-123']);
    });

    test('returns stored prefs merged over defaults', async () => {
        pool.query.mockResolvedValueOnce({ rows: [{ notification_prefs: { billReminders: false } }] });

        const res = await request(buildApp()).get('/api/notifications/prefs');

        expect(res.body).toEqual({ prefs: { ...ALL_ON, billReminders: false }, stored: true });
    });
});

describe('PUT /api/notifications/prefs', () => {
    afterEach(() => pool.query.mockReset());

    test('merges valid toggles with a parameterized JSONB update', async () => {
        pool.query.mockResolvedValueOnce({ rows: [{ notification_prefs: { goalAlerts: false } }] });

        const res = await request(buildApp()).put('/api/notifications/prefs').send({ goalAlerts: false });

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ prefs: { ...ALL_ON, goalAlerts: false }, stored: true });
        const [sql, params] = pool.query.mock.calls[0];
        expect(sql).toMatch(/notification_prefs = COALESCE\(notification_prefs, '\{\}'::jsonb\) \|\| \$2::jsonb/);
        expect(params).toEqual(['user-123', JSON.stringify({ goalAlerts: false })]);
    });

    test('rejects unknown keys', async () => {
        const res = await request(buildApp()).put('/api/notifications/prefs').send({ goalAlerts: true, marketing: false });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/Unknown preference: marketing/);
        expect(pool.query).not.toHaveBeenCalled();
    });

    test('rejects non-boolean values', async () => {
        const res = await request(buildApp()).put('/api/notifications/prefs').send({ goalAlerts: 'off' });
        expect(res.status).toBe(400);
        expect(pool.query).not.toHaveBeenCalled();
    });

    test('rejects an empty or non-object body', async () => {
        const empty = await request(buildApp()).put('/api/notifications/prefs').send({});
        expect(empty.status).toBe(400);
        const arr = await request(buildApp()).put('/api/notifications/prefs').send([true]);
        expect(arr.status).toBe(400);
        expect(pool.query).not.toHaveBeenCalled();
    });
});
