process.env.JWT_SECRET = 'test-secret';

jest.mock('../src/db/pool', () => ({
    query: jest.fn(),
    connect: jest.fn(),
}));
jest.mock('../src/middleware/auth', () => (req, res, next) => {
    req.user = { id: 'user-123', email: 'test@example.com' };
    next();
});
jest.mock('../src/services/planningEngine', () => ({
    simulateFinancialPlan: jest.fn(() => ({
        rows: [{ month: 1, sipContribution: 1000, emergencyFundBalance: 0, sipBalance: 0, goalBalance: 0, netWorth: 0 }],
        emergencyFundReachedMonth: null,
        goalReachedMonth: null,
    })),
    getFiveYearSummary: jest.fn(() => ({})),
    calculateEMI: jest.fn(() => 0),
}));
jest.mock('../src/services/fundCatalog', () => ({
    getFundsForPlan: jest.fn(() => []),
}));
jest.mock('../src/utils/ai', () => ({
    aiComplete: jest.fn(),
}));
jest.mock('../src/services/behaviorAnalysis', () => ({
    computeDriftReport: jest.fn(),
}));

const express = require('express');
const request = require('supertest');
const pool = require('../src/db/pool');
const planningRouter = require('../src/routes/planning');

function buildApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/planning', planningRouter);
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

const basePlanRow = {
    id: 'plan-1',
    monthly_income: '75000.50',
    risk_profile: 'balanced',
    emergency_fund_target_months: 6,
    emergency_fund_current_balance: '10000.00',
    goal_name: null,
    goal_amount: null,
    goal_target_months: null,
    loan_principal: null,
    loan_annual_rate_pct: null,
    loan_tenure_months: null,
    loan_moratorium_months: null,
    ai_narrative: null,
    ai_narrative_generated_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
};

describe('GET /api/planning', () => {
    test('returns a clean { exists: false } with status 200 when no plan exists yet, not a 404', async () => {
        pool.query.mockResolvedValueOnce({ rows: [] });

        const res = await request(app).get('/api/planning');

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ exists: false });
    });

    test('numeric fields coming back from pg as strings are parsed into actual numbers', async () => {
        pool.query.mockResolvedValueOnce({ rows: [basePlanRow] }); // plan
        pool.query.mockResolvedValueOnce({ rows: [] }); // expenses

        const res = await request(app).get('/api/planning');

        expect(res.status).toBe(200);
        expect(res.body.plan.monthly_income).toBe(75000.5);
        expect(typeof res.body.plan.monthly_income).toBe('number');
        expect(res.body.plan.emergency_fund_current_balance).toBe(10000);
        expect(typeof res.body.plan.emergency_fund_current_balance).toBe('number');
    });
});

describe('POST /api/planning', () => {
    test('always issues an upsert (ON CONFLICT) — calling it twice never inserts a duplicate row', async () => {
        const client = mockClient(async (sql, params) => {
            if (sql === 'BEGIN' || sql === 'COMMIT') return {};
            if (sql.includes('INSERT INTO financial_plans')) {
                expect(sql).toMatch(/ON CONFLICT \(user_id\) DO UPDATE/);
                return { rows: [{ ...basePlanRow, monthly_income: String(params[1]) }] };
            }
            if (sql.includes('DELETE FROM financial_plan_expenses')) return {};
            throw new Error(`Unexpected query: ${sql}`);
        });
        pool.connect.mockResolvedValue(client);

        const payload = { monthly_income: 80000, risk_profile: 'balanced', emergency_fund_target_months: 6 };

        const res1 = await request(app).post('/api/planning').send(payload);
        const res2 = await request(app).post('/api/planning').send(payload);

        expect(res1.status).toBe(200);
        expect(res2.status).toBe(200);
        const upsertCalls = client.query.mock.calls.filter(([sql]) => sql.includes('INSERT INTO financial_plans'));
        expect(upsertCalls).toHaveLength(2);
    });

    test('rejects a category_id belonging to a different real user (no transaction opened)', async () => {
        pool.query.mockResolvedValueOnce({ rows: [] }); // batched category ownership check finds nothing

        const payload = {
            monthly_income: 80000, risk_profile: 'balanced', emergency_fund_target_months: 6,
            expenses: [{ name: 'Rent', amount: 20000, category_id: 'not-mine' }],
        };
        const res = await request(app).post('/api/planning').send(payload);

        expect(res.status).toBe(400);
        expect(pool.query).toHaveBeenCalledTimes(1); // only the ownership check, no INSERT
        expect(pool.connect).not.toHaveBeenCalled();

        const [sql, params] = pool.query.mock.calls[0];
        expect(sql).toMatch(/WHERE id = ANY\(\$1::uuid\[\]\) AND \(user_id = \$2 OR user_id IS NULL\)/);
        expect(params).toEqual([['not-mine'], 'user-123']);
    });

    test('accepts expenses whose category_ids are owned or shared legacy defaults', async () => {
        pool.query.mockResolvedValueOnce({ rows: [{ id: 'cat-1' }, { id: 'legacy-cat' }] }); // batched ownership check: both pass

        const client = mockClient(async (sql, params) => {
            if (sql === 'BEGIN' || sql === 'COMMIT') return {};
            if (sql.includes('INSERT INTO financial_plans')) {
                return { rows: [{ ...basePlanRow, monthly_income: String(params[1]) }] };
            }
            if (sql.includes('DELETE FROM financial_plan_expenses')) return {};
            if (sql.includes('INSERT INTO financial_plan_expenses')) {
                return {
                    rows: [
                        { id: 'e1', name: 'Rent', amount: '20000', category_id: 'cat-1' },
                        { id: 'e2', name: 'Food', amount: '5000', category_id: 'legacy-cat' },
                    ],
                };
            }
            throw new Error(`Unexpected query: ${sql}`);
        });
        pool.connect.mockResolvedValue(client);

        const payload = {
            monthly_income: 80000, risk_profile: 'balanced', emergency_fund_target_months: 6,
            expenses: [
                { name: 'Rent', amount: 20000, category_id: 'cat-1' },
                { name: 'Food', amount: 5000, category_id: 'legacy-cat' },
            ],
        };
        const res = await request(app).post('/api/planning').send(payload);

        expect(res.status).toBe(200);
        expect(res.body.expenses).toHaveLength(2);
        expect(res.body.expenses.map(e => e.category_id)).toEqual(['cat-1', 'legacy-cat']);
    });
});

describe('GET /api/planning/cashflow — IST month boundary', () => {
    afterEach(() => jest.useRealTimers());

    test('uses the IST calendar month, not the UTC one, for the trailing 3-full-months window and the forward month labels', async () => {
        // 2026-01-31T19:00:00.000Z is 2026-02-01 00:30 IST -- already February
        // in IST while UTC is still on January 31. The trailing window must
        // start at 2025-11-01 and end at 2026-02-01 (not a UTC-anchored
        // January/October pair), and month 1 of the 12-month forward
        // projection must be labeled "Mar 2026" (one month after February),
        // not "Feb 2026".
        jest.useFakeTimers().setSystemTime(new Date('2026-01-31T19:00:00.000Z'));

        pool.query
            .mockResolvedValueOnce({ rows: [{ total: '0' }] }) // income
            .mockResolvedValueOnce({ rows: [] })               // expense by category
            .mockResolvedValueOnce({ rows: [] })               // loans
            .mockResolvedValueOnce({ rows: [] });               // recurring

        const res = await request(app).get('/api/planning/cashflow');

        expect(res.status).toBe(200);

        const [, incomeParams] = pool.query.mock.calls[0];
        expect(incomeParams).toEqual(['user-123', '2025-11-01', '2026-02-01']);

        expect(res.body.months[0].month).toBe('Mar 2026');
        expect(res.body.months[11].month).toBe('Feb 2027');
    });
});

describe('DELETE /api/planning', () => {
    test('deletes only the caller\'s own plan, scoped by user_id', async () => {
        pool.query.mockResolvedValueOnce({ rows: [{ id: 'plan-1' }] });

        const res = await request(app).delete('/api/planning');

        expect(res.status).toBe(200);
        const [sql, params] = pool.query.mock.calls[0];
        expect(sql).toMatch(/WHERE user_id = \$1/);
        expect(params).toEqual(['user-123']);
    });

    test('returns 404 when the caller has no plan to delete', async () => {
        pool.query.mockResolvedValueOnce({ rows: [] });

        const res = await request(app).delete('/api/planning');

        expect(res.status).toBe(404);
    });
});
