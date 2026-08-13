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
const investmentsRouter = require('../src/routes/investments');
const analyticsRouter = require('../src/routes/analytics');

function buildApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/investments', investmentsRouter);
    app.use('/api/analytics', analyticsRouter);
    return app;
}

function makeInvestment(overrides = {}) {
    return {
        id: 'inv-1',
        user_id: 'user-123',
        type: 'mutual_fund',
        name: 'Test Fund',
        ticker_or_folio: null,
        units: '10',
        purchase_price_per_unit: '100.00',
        current_nav_or_price: '120.00',
        purchase_date: '2026-01-01',
        account_label: null,
        notes: null,
        ...overrides,
    };
}

describe('POST /api/investments', () => {
    afterEach(() => pool.query.mockReset());

    test('creates a valid investment and returns computed fields', async () => {
        const row = makeInvestment();
        pool.query.mockResolvedValueOnce({ rows: [row] });

        const res = await request(buildApp()).post('/api/investments').send({
            type: 'mutual_fund',
            name: 'Test Fund',
            units: 10,
            purchase_price_per_unit: 100,
            current_nav_or_price: 120,
            purchase_date: '2026-01-01',
        });

        expect(res.status).toBe(201);
        expect(res.body.investment.current_value).toBe(1200);
        expect(res.body.investment.total_invested).toBe(1000);
        expect(res.body.investment.unrealized_gain).toBe(200);
        expect(res.body.investment.unrealized_gain_pct).toBe(20);
    });

    test('returns 400 for invalid type enum', async () => {
        const res = await request(buildApp()).post('/api/investments').send({
            type: 'bitcoin_mining',
            name: 'Test',
            units: 10,
            purchase_price_per_unit: 100,
            current_nav_or_price: 120,
            purchase_date: '2026-01-01',
        });

        expect(res.status).toBe(400);
        expect(pool.query).not.toHaveBeenCalled();
    });

    test('returns 400 for units <= 0', async () => {
        const res = await request(buildApp()).post('/api/investments').send({
            type: 'stock',
            name: 'Test',
            units: 0,
            purchase_price_per_unit: 100,
            current_nav_or_price: 120,
            purchase_date: '2026-01-01',
        });

        expect(res.status).toBe(400);
        expect(pool.query).not.toHaveBeenCalled();
    });
});

describe('GET /api/investments', () => {
    afterEach(() => pool.query.mockReset());

    test('returns only the requesting user\'s investments', async () => {
        const rows = [makeInvestment({ id: 'inv-1' }), makeInvestment({ id: 'inv-2', current_nav_or_price: '50.00' })];
        pool.query.mockResolvedValueOnce({ rows });

        const res = await request(buildApp()).get('/api/investments');

        expect(res.status).toBe(200);
        const [query, params] = pool.query.mock.calls[0];
        expect(query).toMatch(/WHERE user_id = \$1/);
        expect(params[0]).toBe('user-123');
        expect(res.body.investments).toHaveLength(2);
        // sorted by current_value DESC
        expect(res.body.investments[0].id).toBe('inv-1');
    });
});

describe('GET /api/investments/summary', () => {
    afterEach(() => pool.query.mockReset());

    test('returns correct totals', async () => {
        const rows = [
            makeInvestment({ id: 'inv-1', units: '10', purchase_price_per_unit: '100', current_nav_or_price: '120', type: 'mutual_fund' }),
            makeInvestment({ id: 'inv-2', units: '5', purchase_price_per_unit: '200', current_nav_or_price: '180', type: 'stock' }),
        ];
        pool.query.mockResolvedValueOnce({ rows });

        const res = await request(buildApp()).get('/api/investments/summary');

        expect(res.status).toBe(200);
        expect(res.body.total_invested).toBe(2000); // 1000 + 1000
        expect(res.body.total_current_value).toBe(2100); // 1200 + 900
        expect(res.body.total_unrealized_gain).toBe(100);
        expect(res.body.by_type).toHaveLength(2);
        expect(res.body.top_holdings.length).toBeLessThanOrEqual(5);
    });
});

describe('PATCH /api/investments/:id', () => {
    afterEach(() => pool.query.mockReset());

    test('returns 403 when updating another user\'s investment', async () => {
        pool.query.mockResolvedValueOnce({ rows: [{ id: 'inv-1', user_id: 'other-user' }] });

        const res = await request(buildApp()).patch('/api/investments/inv-1').send({ units: 5 });

        expect(res.status).toBe(403);
    });

    test('updates own investment and returns computed fields', async () => {
        pool.query.mockResolvedValueOnce({ rows: [{ id: 'inv-1', user_id: 'user-123' }] });
        pool.query.mockResolvedValueOnce({ rows: [makeInvestment({ current_nav_or_price: '150.00' })] });

        const res = await request(buildApp()).patch('/api/investments/inv-1').send({ current_nav_or_price: 150 });

        expect(res.status).toBe(200);
        expect(res.body.investment.current_value).toBe(1500);
    });
});

describe('DELETE /api/investments/:id', () => {
    afterEach(() => pool.query.mockReset());

    test('removes the investment', async () => {
        pool.query.mockResolvedValueOnce({ rows: [{ id: 'inv-1', user_id: 'user-123' }] });
        pool.query.mockResolvedValueOnce({ rows: [{ id: 'inv-1' }] });

        const res = await request(buildApp()).delete('/api/investments/inv-1');

        expect(res.status).toBe(200);
        expect(res.body.message).toBe('Investment deleted');
    });
});

describe('GET /api/analytics/networth', () => {
    afterEach(() => pool.query.mockReset());

    test('returns { current, history } structure', async () => {
        pool.query
            .mockResolvedValueOnce({ rows: [{ total: '5000' }] }) // bank
            .mockResolvedValueOnce({ rows: [{ total: '2000' }] }) // investments
            .mockResolvedValueOnce({ rows: [{ id: 1, current_outstanding_balance: '500' }] }) // credit cards (via fetchTotalCreditCardOutstanding)
            .mockResolvedValueOnce({ rows: [{ total: '0' }] })    // loans
            .mockResolvedValueOnce({ rows: [] }) // upsert
            .mockResolvedValueOnce({ rows: [{ snapshot_date: '2026-06-14', net_worth: '6500', total_assets: '7000', total_liabilities: '500' }] }); // history

        const res = await request(buildApp()).get('/api/analytics/networth');

        expect(res.status).toBe(200);
        expect(res.body.current).toMatchObject({
            total_bank_balance: 5000,
            total_investments: 2000,
            total_credit_outstanding: 500,
            total_loans_outstanding: 0,
            net_worth: 6500,
        });
        expect(Array.isArray(res.body.history)).toBe(true);
    });
});

describe('GET /api/analytics/investment-ratio', () => {
    afterEach(() => pool.query.mockReset());

    test('returns { ratio_pct }', async () => {
        pool.query
            .mockResolvedValueOnce({ rows: [{ total: '10000' }] }) // income
            .mockResolvedValueOnce({ rows: [{ total: '2000' }] }); // invested

        const res = await request(buildApp()).get('/api/analytics/investment-ratio');

        expect(res.status).toBe(200);
        expect(res.body.ratio_pct).toBe(20);
        expect(res.body.income_this_month).toBe(10000);
        expect(res.body.invested_this_month).toBe(2000);
    });
});
