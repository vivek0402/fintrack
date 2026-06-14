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
const taxRouter = require('../src/routes/tax');

function buildApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/tax', taxRouter);
    return app;
}

function makeTaxInvestment(overrides = {}) {
    return {
        id: 'tax-1',
        user_id: 'user-123',
        investment_id: null,
        type: 'ppf',
        name: 'PPF Contribution',
        amount: '50000.00',
        deduction_section: '80C',
        financial_year: '2025-26',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
        ...overrides,
    };
}

describe('POST /api/tax/80c', () => {
    afterEach(() => pool.query.mockReset());

    test('creates a valid entry', async () => {
        const row = makeTaxInvestment();
        pool.query.mockResolvedValueOnce({ rows: [row] });

        const res = await request(buildApp()).post('/api/tax/80c').send({
            type: 'ppf',
            name: 'PPF Contribution',
            amount: 50000,
        });

        expect(res.status).toBe(201);
        expect(res.body.tax_investment.type).toBe('ppf');
        expect(res.body.tax_investment.amount).toBe('50000.00');
    });

    test('returns 400 for amount <= 0', async () => {
        const res = await request(buildApp()).post('/api/tax/80c').send({
            type: 'ppf',
            name: 'PPF Contribution',
            amount: 0,
        });

        expect(res.status).toBe(400);
        expect(pool.query).not.toHaveBeenCalled();
    });
});

describe('PATCH /api/tax/80c/:id', () => {
    afterEach(() => pool.query.mockReset());

    test('returns 403 for another user\'s entry', async () => {
        pool.query.mockResolvedValueOnce({ rows: [makeTaxInvestment({ user_id: 'other-user' })] });

        const res = await request(buildApp()).patch('/api/tax/80c/tax-1').send({ amount: 60000 });

        expect(res.status).toBe(403);
    });
});

describe('DELETE /api/tax/80c/:id', () => {
    afterEach(() => pool.query.mockReset());

    test('removes correctly', async () => {
        pool.query.mockResolvedValueOnce({ rows: [makeTaxInvestment()] });
        pool.query.mockResolvedValueOnce({ rows: [] });

        const res = await request(buildApp()).delete('/api/tax/80c/tax-1');

        expect(res.status).toBe(200);
        expect(res.body.message).toBe('Deleted');
    });
});

describe('GET /api/tax/80c-summary', () => {
    afterEach(() => pool.query.mockReset());

    test('returns correct totals and remaining', async () => {
        const entries = [
            makeTaxInvestment({ id: 'tax-1', type: 'ppf', amount: '50000.00' }),
            makeTaxInvestment({ id: 'tax-2', type: 'elss', amount: '30000.00' }),
        ];
        pool.query
            .mockResolvedValueOnce({ rows: entries }) // entries query
            .mockResolvedValueOnce({ rows: [] }); // auto_add_candidates query

        const res = await request(buildApp()).get('/api/tax/80c-summary?fy=2025-26');

        expect(res.status).toBe(200);
        expect(res.body.financial_year).toBe('2025-26');
        expect(res.body.total_claimed).toBe(80000);
        expect(res.body.limit).toBe(150000);
        expect(res.body.remaining).toBe(70000);
        expect(res.body.utilization_pct).toBeCloseTo(53.3, 1);
        expect(res.body.breakdown_by_type).toEqual(
            expect.arrayContaining([
                { type: 'ppf', total: 50000 },
                { type: 'elss', total: 30000 },
            ])
        );
        expect(res.body.auto_add_candidates).toEqual([]);
    });
});

describe('GET /api/tax/capital-gains', () => {
    afterEach(() => pool.query.mockReset());

    test('returns correct structure (empty case)', async () => {
        pool.query.mockResolvedValueOnce({ rows: [] });

        const res = await request(buildApp()).get('/api/tax/capital-gains?fy=2025-26');

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({
            financial_year: '2025-26',
            stcg_equity: 0,
            ltcg_equity: 0,
            stcg_other: 0,
            ltcg_other: 0,
            total_gains: 0,
            transactions: [],
        });
    });

    test('computes FIFO gains for buy/sell pairs', async () => {
        const rows = [
            {
                id: 'ct-1', user_id: 'user-123', asset_name: 'Reliance', asset_type: 'equity',
                transaction_type: 'buy', units: '10', price_per_unit: '100', transaction_date: '2024-01-01', financial_year: '2025-26',
            },
            {
                id: 'ct-2', user_id: 'user-123', asset_name: 'Reliance', asset_type: 'equity',
                transaction_type: 'sell', units: '10', price_per_unit: '150', transaction_date: '2025-06-01', financial_year: '2025-26',
            },
        ];
        pool.query.mockResolvedValueOnce({ rows });

        const res = await request(buildApp()).get('/api/tax/capital-gains?fy=2025-26');

        expect(res.status).toBe(200);
        expect(res.body.transactions).toHaveLength(1);
        expect(res.body.transactions[0].gain_loss_amount).toBe(500);
        expect(res.body.transactions[0].gain_type).toBe('ltcg');
        expect(res.body.ltcg_equity).toBe(500);
        expect(res.body.total_gains).toBe(500);
    });
});
