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
const analyticsRouter = require('../src/routes/analytics');

const app = express();
app.use(express.json());
app.use('/api/analytics', analyticsRouter);

afterEach(() => {
    pool.query.mockReset();
});

// The largest untested route file, feeding the whole Analytics page. Focus is
// on /wealth-velocity, which carries the most derived logic -- and whose
// `trend` value is what the dashboard's WealthVelocityWidget renders as its
// Accelerating / Decelerating / Steady badge.

const snapshot = (date, netWorth) => ({ snapshot_date: date, net_worth: String(netWorth) });

/** N monthly snapshots stepping by a fixed amount. */
const series = (values) =>
    values.map((v, i) => snapshot(`2026-0${(i % 9) + 1}-01`, v));

describe('GET /wealth-velocity', () => {
    it('reports insufficient_data with fewer than two snapshots', async () => {
        pool.query.mockResolvedValueOnce({ rows: [snapshot('2026-08-01', 100000)] });
        const res = await request(app).get('/api/analytics/wealth-velocity');

        expect(res.status).toBe(200);
        expect(res.body.trend).toBe('insufficient_data');
        expect(res.body.mom_changes).toEqual([]);
        expect(res.body.avg_monthly_growth).toBe(0);
        expect(res.body.message).toMatch(/at least 2 months/i);
    });

    it('handles a user with no snapshots at all', async () => {
        pool.query.mockResolvedValueOnce({ rows: [] });
        const res = await request(app).get('/api/analytics/wealth-velocity');

        expect(res.status).toBe(200);
        expect(res.body.snapshots).toEqual([]);
        expect(res.body.trend).toBe('insufficient_data');
    });

    it('computes month-over-month changes between consecutive snapshots', async () => {
        pool.query.mockResolvedValueOnce({ rows: series([100000, 110000, 121000]) });
        const res = await request(app).get('/api/analytics/wealth-velocity');

        expect(res.body.mom_changes).toHaveLength(2);
        expect(res.body.mom_changes[0].absolute_change).toBe(10000);
        expect(res.body.mom_changes[0].pct_change).toBe(10);
        expect(res.body.mom_changes[1].absolute_change).toBe(11000);
        expect(res.body.avg_monthly_growth).toBe(10500);
    });

    it('reports negative movement rather than clamping it', async () => {
        pool.query.mockResolvedValueOnce({ rows: series([100000, 90000]) });
        const res = await request(app).get('/api/analytics/wealth-velocity');

        expect(res.body.mom_changes[0].absolute_change).toBe(-10000);
        expect(res.body.mom_changes[0].pct_change).toBe(-10);
        expect(res.body.avg_monthly_growth).toBeLessThan(0);
    });

    it('does not divide by zero when the previous net worth was zero', async () => {
        // A brand-new user's first snapshot is often 0; without the guard the
        // percentage would be Infinity and serialise as null through JSON.
        pool.query.mockResolvedValueOnce({ rows: series([0, 50000]) });
        const res = await request(app).get('/api/analytics/wealth-velocity');

        expect(res.body.mom_changes[0].pct_change).toBe(0);
        expect(res.body.mom_changes[0].absolute_change).toBe(50000);
    });

    it('measures percentage against the magnitude of a negative net worth', async () => {
        // Someone in net debt moving from -100k to -50k has improved; dividing
        // by the raw (negative) figure would report that improvement as -50%.
        pool.query.mockResolvedValueOnce({ rows: series([-100000, -50000]) });
        const res = await request(app).get('/api/analytics/wealth-velocity');

        expect(res.body.mom_changes[0].absolute_change).toBe(50000);
        expect(res.body.mom_changes[0].pct_change).toBe(50);
    });

    it('stays insufficient_data for trend until six snapshots exist', async () => {
        // Changes and averages are still returned -- only the trend label is
        // withheld, because it compares the last three months against the
        // previous three.
        pool.query.mockResolvedValueOnce({ rows: series([100, 200, 300, 400, 500]) });
        const res = await request(app).get('/api/analytics/wealth-velocity');

        expect(res.body.mom_changes).toHaveLength(4);
        expect(res.body.trend).toBe('insufficient_data');
    });

    it('calls growth that is speeding up "accelerating"', async () => {
        // First three steps +1000 each, last three +5000 each.
        pool.query.mockResolvedValueOnce({
            rows: series([0, 1000, 2000, 3000, 8000, 13000, 18000]),
        });
        const res = await request(app).get('/api/analytics/wealth-velocity');
        expect(res.body.trend).toBe('accelerating');
    });

    it('calls growth that is slowing down "decelerating"', async () => {
        pool.query.mockResolvedValueOnce({
            rows: series([0, 5000, 10000, 15000, 16000, 17000, 18000]),
        });
        const res = await request(app).get('/api/analytics/wealth-velocity');
        expect(res.body.trend).toBe('decelerating');
    });

    it('calls steady growth "steady", within the 5% tolerance either way', async () => {
        pool.query.mockResolvedValueOnce({
            rows: series([0, 1000, 2000, 3000, 4000, 5000, 6000]),
        });
        const res = await request(app).get('/api/analytics/wealth-velocity');
        expect(res.body.trend).toBe('steady');
    });

    it('coerces the numeric column out of the strings pg returns', async () => {
        // net_worth arrives as a string; leaving it uncoerced would make the
        // subtraction concatenate instead.
        pool.query.mockResolvedValueOnce({ rows: series([100000, 110000]) });
        const res = await request(app).get('/api/analytics/wealth-velocity');

        expect(typeof res.body.snapshots[0].net_worth).toBe('number');
        expect(typeof res.body.mom_changes[0].absolute_change).toBe('number');
    });

    it('scopes the query to the authenticated user', async () => {
        pool.query.mockResolvedValueOnce({ rows: [] });
        await request(app).get('/api/analytics/wealth-velocity');

        const [sql, params] = pool.query.mock.calls[0];
        expect(sql).toMatch(/user_id = \$1/);
        expect(params).toEqual(['user-123']);
    });

    it('returns 500 rather than leaking a database error', async () => {
        pool.query.mockRejectedValueOnce(new Error('relation does not exist'));
        const res = await request(app).get('/api/analytics/wealth-velocity');

        expect(res.status).toBe(500);
        expect(res.body.error).toBe('Server error.');
        expect(JSON.stringify(res.body)).not.toMatch(/relation does not exist/);
    });
});

describe('route surface', () => {
    it('scopes every listed endpoint to the authenticated user', async () => {
        // A missing user_id predicate on any of these would expose another
        // user's data, so it is worth asserting across the whole file rather
        // than one endpoint at a time.
        const endpoints = ['/summary', '/trends', '/yearly', '/payment-methods', '/wealth-velocity'];

        for (const path of endpoints) {
            pool.query.mockReset();
            pool.query.mockResolvedValue({ rows: [] });
            await request(app).get(`/api/analytics${path}`);

            expect(pool.query.mock.calls.length).toBeGreaterThan(0);
            // Jest's expect takes no custom-message argument (that is vitest),
            // so unscoped queries are collected and reported by value instead.
            const unscoped = pool.query.mock.calls
                .filter(([, params]) => !Array.isArray(params) || !params.includes('user-123'))
                .map(([sql]) => `${path}: ${String(sql).replace(/\s+/g, ' ').trim().slice(0, 70)}`);
            expect(unscoped).toEqual([]);
        }
    });
});
