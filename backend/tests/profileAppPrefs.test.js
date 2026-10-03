process.env.JWT_SECRET = 'test-secret';

jest.mock('../src/db/pool', () => ({ query: jest.fn(), connect: jest.fn() }));
jest.mock('../src/middleware/auth', () => (req, res, next) => {
    req.user = { id: 'user-123', email: 'test@example.com' };
    next();
});

const express = require('express');
const request = require('supertest');
const pool = require('../src/db/pool');
const profileRouter = require('../src/routes/profile');

function buildApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/profile', profileRouter);
    return app;
}

afterEach(() => pool.query.mockReset());

describe('GET /api/profile/app-prefs', () => {
    test('returns saved prefs, or {} when none', async () => {
        pool.query.mockResolvedValueOnce({ rows: [{ app_prefs: { cc_not_paid: { 3: ['2026-07-15'] } } }] });
        expect((await request(buildApp()).get('/api/profile/app-prefs')).body).toEqual({ prefs: { cc_not_paid: { 3: ['2026-07-15'] } } });
        pool.query.mockResolvedValueOnce({ rows: [{ app_prefs: null }] });
        expect((await request(buildApp()).get('/api/profile/app-prefs')).body).toEqual({ prefs: {} });
    });
});

describe('PATCH /api/profile/app-prefs', () => {
    test('replaces one key, merged into the rest', async () => {
        pool.query.mockResolvedValueOnce({ rows: [{ app_prefs: { account_memory: { byDesc: { swiggy: 2 }, byMethod: {} } } }] });
        const res = await request(buildApp()).patch('/api/profile/app-prefs')
            .send({ key: 'account_memory', value: { byDesc: { swiggy: 2 }, byMethod: {} } });
        expect(res.status).toBe(200);
        const [sql, params] = pool.query.mock.calls[0];
        expect(sql).toContain("COALESCE(app_prefs, '{}'::jsonb) || jsonb_build_object($2::text, $3::jsonb)");
        expect(params).toEqual(['user-123', 'account_memory', JSON.stringify({ byDesc: { swiggy: 2 }, byMethod: {} })]);
    });

    test('rejects unknown keys, non-objects and oversized values without touching the DB', async () => {
        const app = buildApp();
        expect((await request(app).patch('/api/profile/app-prefs').send({ key: 'theme', value: {} })).status).toBe(400);
        expect((await request(app).patch('/api/profile/app-prefs').send({ key: 'cc_not_paid', value: [1] })).status).toBe(400);
        expect((await request(app).patch('/api/profile/app-prefs').send({ key: 'cc_not_paid', value: 'x' })).status).toBe(400);
        const big = { 1: Array.from({ length: 9000 }, (_, i) => `2026-01-${String(i).padStart(5, '0')}`) };
        expect((await request(app).patch('/api/profile/app-prefs').send({ key: 'cc_not_paid', value: big })).status).toBe(413);
        expect(pool.query).not.toHaveBeenCalled();
    });
});
