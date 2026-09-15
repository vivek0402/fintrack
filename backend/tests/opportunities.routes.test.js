jest.mock('../src/db/pool', () => ({
    query: jest.fn(),
}));

const pool = require('../src/db/pool');
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
