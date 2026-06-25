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
