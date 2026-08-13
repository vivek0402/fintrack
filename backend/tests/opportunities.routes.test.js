jest.mock('../src/db/pool', () => ({
    query: jest.fn(),
}));

const pool = require('../src/db/pool');
const {
    getFinancialPlan,
    detectIdleCash,
    detectEmergencyFundLow,
    detectSipUnderinvesting,
    detectCreditCardInterest,
    detectSpendingSpike,
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

        // detectIdleCash: getBankBalance, getAvgMonthlyExpenses
        pool.query.mockResolvedValueOnce({ rows: [{ total: '1500000' }] }); // bank balance
        pool.query.mockResolvedValueOnce({ rows: [{ avg: '50000' }] });     // avg expenses
        const idle = await detectIdleCash('user-1', plan);
        expect(idle.description).toContain('9-month');

        // detectEmergencyFundLow: getBankBalance, getAvgMonthlyExpenses (low balance this time)
        pool.query.mockResolvedValueOnce({ rows: [{ total: '100000' }] });
        pool.query.mockResolvedValueOnce({ rows: [{ avg: '50000' }] });
        const low = await detectEmergencyFundLow('user-1', plan);
        expect(low.title).toContain('9 months');
        expect(low.description).toContain('9 months');
    });

    test('detectIdleCash falls back to the default 6-month target with no plan row', async () => {
        const plan = { risk_profile: 'balanced', emergency_fund_target_months: 6, has_plan: false };
        pool.query.mockResolvedValueOnce({ rows: [{ total: '1500000' }] });
        pool.query.mockResolvedValueOnce({ rows: [{ avg: '50000' }] });
        const idle = await detectIdleCash('user-1', plan);
        expect(idle.description).toContain('6-month');
    });
});

describe('detectSipUnderinvesting — risk-profile-aware target %', () => {
    test('safety profile never fires (target is 0%)', async () => {
        const plan = { risk_profile: 'safety', emergency_fund_target_months: 6, has_plan: true };
        const result = await detectSipUnderinvesting('user-1', plan);
        expect(result).toBeNull();
        expect(pool.query).not.toHaveBeenCalled();
    });

    test('balanced profile matches the prior flat 15% behavior', async () => {
        const plan = { risk_profile: 'balanced', emergency_fund_target_months: 6, has_plan: true };
        pool.query.mockResolvedValueOnce({ rows: [{ total: '100000' }] }); // income
        pool.query.mockResolvedValueOnce({ rows: [{ total: '5000' }] });  // invested (5%)
        const result = await detectSipUnderinvesting('user-1', plan);
        expect(result.title).toContain('15%');
    });

    test('growth profile targets 21%', async () => {
        const plan = { risk_profile: 'growth', emergency_fund_target_months: 6, has_plan: true };
        pool.query.mockResolvedValueOnce({ rows: [{ total: '100000' }] });
        pool.query.mockResolvedValueOnce({ rows: [{ total: '5000' }] });
        const result = await detectSipUnderinvesting('user-1', plan);
        expect(result.title).toContain('21%');
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
