process.env.JWT_SECRET = 'test-secret';

jest.mock('../src/db/pool', () => ({
    query: jest.fn(),
}));
jest.mock('../src/middleware/auth', () => (req, res, next) => {
    req.user = { id: 'user-123' };
    next();
});

const express = require('express');
const request = require('supertest');
const pool = require('../src/db/pool');
const router = require('../src/routes/opportunities');
const {
    getFinancialPlan,
    detectIdleCash,
    detectEmergencyFundLow,
    detectCreditCardInterest,
    detectSpendingSpike,
    detectAllocationGap,
    detectOpportunities,
    saveOpportunities,
} = require('../src/routes/opportunities');

function buildApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/opportunities', router);
    return app;
}

afterEach(() => {
    pool.query.mockReset();
});

describe('getFinancialPlan', () => {
    test('falls back to balanced/6 months when the user has no financial_plans row', async () => {
        pool.query.mockResolvedValueOnce({ rows: [] });
        const plan = await getFinancialPlan('user-1');
        expect(plan).toEqual({ risk_profile: 'balanced', emergency_fund_target_months: 6, has_plan: false });
    });

    test('uses the user-set risk profile and emergency fund target when a plan row exists', async () => {
        pool.query.mockResolvedValueOnce({ rows: [{ risk_profile: 'growth', emergency_fund_target_months: 9 }] });
        const plan = await getFinancialPlan('user-1');
        expect(plan).toEqual({ risk_profile: 'growth', emergency_fund_target_months: 9, has_plan: true });
    });
});

describe('detectIdleCash / detectEmergencyFundLow — personalized emergency fund target', () => {
    test('detectIdleCash and detectEmergencyFundLow agree on the same target months', async () => {
        const plan = { risk_profile: 'balanced', emergency_fund_target_months: 9, has_plan: true };

        const idle = await detectIdleCash('user-1', plan, 1500000, 50000);
        expect(idle.description).toContain('9-month');

        const low = await detectEmergencyFundLow('user-1', plan, 100000, 50000);
        expect(low.title).toContain('9 months');
        expect(low.description).toContain('9 months');
    });

    test('detectIdleCash falls back to the default 6-month target with no plan row', async () => {
        const plan = { risk_profile: 'balanced', emergency_fund_target_months: 6, has_plan: false };
        const idle = await detectIdleCash('user-1', plan, 1500000, 50000);
        expect(idle.description).toContain('6-month');
    });
});

describe('detectCreditCardInterest — real per-card APR', () => {
    test('uses each card\'s own APR when set, and the fallback only when missing', async () => {
        pool.query.mockResolvedValueOnce({
            rows: [
                { bank_name: 'HDFC', card_name: 'Millennia', outstanding_balance: '100000', current_outstanding_balance: '100000', interest_rate_pct: '39' },
                { bank_name: 'ICICI', card_name: 'Amazon Pay', outstanding_balance: '50000', current_outstanding_balance: '50000', interest_rate_pct: null },
            ],
        });
        const result = await detectCreditCardInterest('user-1');
        // 100000 * 0.39 + 50000 * 0.42 = 39000 + 21000 = 60000
        expect(result.amount_saved).toBe(60000);
        expect(result.description).toContain('39% APR');
    });
});

describe('detectSpendingSpike — noise floor', () => {
    test('does not fire for a trivial category even with a huge % swing', async () => {
        pool.query.mockResolvedValueOnce({
            rows: [
                { category_name: 'Misc', month: '2026-04-01', total: '50' },
                { category_name: 'Misc', month: '2026-05-01', total: '70' },
            ],
        });
        const result = await detectSpendingSpike('user-1');
        expect(result).toBeNull();
    });

    test('still fires for a meaningful category above both floors', async () => {
        pool.query.mockResolvedValueOnce({
            rows: [
                { category_name: 'Dining', month: '2026-04-01', total: '2000' },
                { category_name: 'Dining', month: '2026-05-01', total: '4000' },
            ],
        });
        const result = await detectSpendingSpike('user-1');
        expect(result).not.toBeNull();
        expect(result.title).toContain('Dining');
    });
});

describe('detectAllocationGap — no longer queries bank balance itself', () => {
    test('accepts bankBalance as a parameter instead of querying it', async () => {
        pool.query.mockResolvedValueOnce({
            rows: [{ type: 'mutual_fund', total: '900000' }],
        });
        const result = await detectAllocationGap('user-1', 100000);
        // total portfolio = 100000 (bank) + 900000 (mutual_fund) = 1000000
        // bank% = 10% (matches RECOMMENDED_PCT.bank exactly -> no gap on bank)
        // mutual_fund% = 90% vs recommended 30% -> a 60-point gap, biggest
        // detectAllocationGap doesn't expose a raw `category` field (only detectSpendingSpike
        // adds that additive field) -- the biggest-gap category is only observable via title/description.
        expect(result.title).toContain('Mutual funds');
        expect(pool.query).toHaveBeenCalledTimes(1); // only the investments query, no bank-balance query
    });
});

describe('detectOpportunities — computes shared values once', () => {
    test('queries bank balance and avg expenses exactly once each, not once per detector that needs them', async () => {
        pool.query.mockImplementation((sql) => {
            if (sql.includes('FROM bank_accounts')) return Promise.resolve({ rows: [{ total: '1500000' }] });
            if (sql.includes("type = 'expense'") && sql.includes('3 months')) return Promise.resolve({ rows: [{ avg: '50000' }] });
            return Promise.resolve({ rows: [] });
        });

        await detectOpportunities('user-1');

        const bankBalanceCalls = pool.query.mock.calls.filter(c => c[0].includes('FROM bank_accounts'));
        const avgExpenseCalls = pool.query.mock.calls.filter(c => c[0].includes("type = 'expense'") && c[0].includes('3 months'));
        expect(bankBalanceCalls).toHaveLength(1);
        expect(avgExpenseCalls).toHaveLength(1);
    });
});

describe('saveOpportunities — parallel upsert', () => {
    test('upserts every detected opportunity with the right params', async () => {
        pool.query.mockResolvedValue({ rows: [] });
        const detected = [
            { type: 'idle_cash', title: 'T1', description: 'D1', amount_saved: 100, priority: 1, action_label: 'A1', action_route: '/x', expires_at: null },
            { type: 'spending_spike', title: 'T2', description: 'D2', amount_saved: 200, priority: 2, action_label: 'A2', action_route: '/y', expires_at: null },
        ];
        await saveOpportunities('user-1', detected);
        expect(pool.query).toHaveBeenCalledTimes(2);
        expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO opportunities'), ['user-1', 'idle_cash', 'T1', 'D1', 100, 1, 'A1', '/x', null]);
        expect(pool.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO opportunities'), ['user-1', 'spending_spike', 'T2', 'D2', 200, 2, 'A2', '/y', null]);
    });

    test('does not wait for one upsert to resolve before starting the next', async () => {
        let resolveFirst;
        const firstPromise = new Promise(r => { resolveFirst = r; });
        let secondCallStarted = false;
        pool.query.mockImplementationOnce(() => firstPromise);
        pool.query.mockImplementationOnce(() => { secondCallStarted = true; return Promise.resolve({ rows: [] }); });

        const detected = [
            { type: 'a', title: 't', description: 'd', amount_saved: 0, priority: 1, action_label: 'l', action_route: '/r', expires_at: null },
            { type: 'b', title: 't', description: 'd', amount_saved: 0, priority: 1, action_label: 'l', action_route: '/r', expires_at: null },
        ];
        const promise = saveOpportunities('user-1', detected);
        await Promise.resolve();
        expect(secondCallStarted).toBe(true);
        resolveFirst({ rows: [] });
        await promise;
    });
});

describe('GET /api/opportunities — lazy-detect on a user\'s first-ever call', () => {
    function mockQueriesForFreshDetectionRun(freshActiveRows) {
        pool.query.mockImplementation((sql) => {
            if (sql.includes('SELECT 1 FROM opportunities')) return Promise.resolve({ rows: [] }); // no rows of any status ever
            if (sql.includes('FROM financial_plans')) return Promise.resolve({ rows: [] });
            if (sql.includes('FROM bank_accounts')) return Promise.resolve({ rows: [{ total: '500000' }] });
            if (sql.includes("type = 'expense'") && sql.includes('3 months')) return Promise.resolve({ rows: [{ avg: '10000' }] });
            if (sql.includes('FROM credit_cards')) return Promise.resolve({ rows: [] });
            if (sql.includes('FROM loans')) return Promise.resolve({ rows: [] });
            if (sql.includes('FROM transactions t LEFT JOIN categories')) return Promise.resolve({ rows: [] });
            if (sql.includes('FROM investments')) return Promise.resolve({ rows: [] });
            if (sql.includes('FROM users WHERE id')) return Promise.resolve({ rows: [{ ai_cache: {} }] });
            if (sql.includes('FROM budgets')) return Promise.resolve({ rows: [{ total: '0' }] });
            if (sql.includes('INSERT INTO opportunities')) return Promise.resolve({ rows: [] });
            if (sql.includes('SELECT * FROM opportunities') && sql.includes("status = 'active'")) return Promise.resolve({ rows: freshActiveRows });
            if (sql.includes("status = 'dismissed'")) return Promise.resolve({ rows: [{ count: '0' }] });
            if (sql.includes("status = 'acted_on'")) return Promise.resolve({ rows: [{ count: '0' }] });
            return Promise.resolve({ rows: [] });
        });
    }

    test('runs detection inline and reflects the freshly-saved data when the user has zero opportunity rows of any status', async () => {
        const freshActiveRows = [{ id: 'opp-1', type: 'idle_cash', title: 'Fresh idle cash opportunity' }];
        mockQueriesForFreshDetectionRun(freshActiveRows);

        const res = await request(buildApp()).get('/api/opportunities');

        expect(res.status).toBe(200);
        expect(res.body.opportunities).toEqual(freshActiveRows);

        // Detection actually ran: bank balance + avg expenses were queried (the shared
        // inputs detectOpportunities computes) and at least one opportunity was upserted.
        const bankBalanceCalls = pool.query.mock.calls.filter(c => c[0].includes('FROM bank_accounts'));
        const insertCalls = pool.query.mock.calls.filter(c => c[0].includes('INSERT INTO opportunities'));
        expect(bankBalanceCalls.length).toBeGreaterThan(0);
        expect(insertCalls.length).toBeGreaterThan(0);

        // Detection (and its save) happened BEFORE the final summary read, so that a
        // freshly-detected/saved opportunity is what the response reflects.
        const existsCheckIndex = pool.query.mock.calls.findIndex(c => c[0].includes('SELECT 1 FROM opportunities'));
        const insertIndex = pool.query.mock.calls.findIndex(c => c[0].includes('INSERT INTO opportunities'));
        const activeReadIndex = pool.query.mock.calls.findIndex(c => c[0].includes('SELECT * FROM opportunities') && c[0].includes("status = 'active'"));
        expect(existsCheckIndex).toBeGreaterThanOrEqual(0);
        expect(existsCheckIndex).toBeLessThan(insertIndex);
        expect(insertIndex).toBeLessThan(activeReadIndex);
    });

    test('returns 200 with an empty/zero summary when lazy-detect throws, instead of 500ing the dashboard load', async () => {
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        pool.query.mockImplementation((sql) => {
            if (sql.includes('SELECT 1 FROM opportunities')) return Promise.resolve({ rows: [] }); // no rows ever -> triggers lazy-detect
            if (sql.includes('FROM financial_plans')) return Promise.reject(new Error('db exploded'));
            if (sql.includes('SELECT * FROM opportunities') && sql.includes("status = 'active'")) return Promise.resolve({ rows: [] });
            if (sql.includes("status = 'dismissed'")) return Promise.resolve({ rows: [{ count: '0' }] });
            if (sql.includes("status = 'acted_on'")) return Promise.resolve({ rows: [{ count: '0' }] });
            return Promise.resolve({ rows: [] });
        });

        const res = await request(buildApp()).get('/api/opportunities');

        expect(res.status).toBe(200);
        expect(res.body).toEqual({
            opportunities: [],
            summary: { active_count: 0, dismissed_count: 0, acted_on_count: 0 },
        });
        expect(consoleErrorSpy).toHaveBeenCalled();

        consoleErrorSpy.mockRestore();
    });

    test('does not run detection when the user already has an opportunity row of any status', async () => {
        pool.query.mockImplementation((sql) => {
            if (sql.includes('SELECT 1 FROM opportunities')) return Promise.resolve({ rows: [{ '?column?': 1 }] }); // has a row (any status)
            if (sql.includes("status = 'active'")) return Promise.resolve({ rows: [] });
            if (sql.includes("status = 'dismissed'")) return Promise.resolve({ rows: [{ count: '3' }] });
            if (sql.includes("status = 'acted_on'")) return Promise.resolve({ rows: [{ count: '2' }] });
            return Promise.resolve({ rows: [] });
        });

        const res = await request(buildApp()).get('/api/opportunities');

        expect(res.status).toBe(200);
        expect(res.body.summary).toEqual({ active_count: 0, dismissed_count: 3, acted_on_count: 2 });

        // No detection: none of the shared-input queries fired.
        const bankBalanceCalls = pool.query.mock.calls.filter(c => c[0].includes('FROM bank_accounts'));
        const avgExpenseCalls = pool.query.mock.calls.filter(c => c[0].includes("type = 'expense'") && c[0].includes('3 months'));
        const insertCalls = pool.query.mock.calls.filter(c => c[0].includes('INSERT INTO opportunities'));
        expect(bankBalanceCalls).toHaveLength(0);
        expect(avgExpenseCalls).toHaveLength(0);
        expect(insertCalls).toHaveLength(0);
    });
});
