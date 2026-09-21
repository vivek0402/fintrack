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
const debtRouter = require('../src/routes/debt');
const { computeCreditUtilization, computeDtiBreakdown } = debtRouter;

function buildApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/debt', debtRouter);
    return app;
}

const app = buildApp();

afterEach(() => {
    pool.query.mockReset();
});

describe('computeCreditUtilization', () => {
    test('a card with credit_limit 0 does not divide by zero', async () => {
        pool.query.mockResolvedValueOnce({
            rows: [{ id: 1, card_name: 'Test', bank_name: 'Bank', last_four: '1234', outstanding_balance: '500', current_outstanding_balance: '500', credit_limit: '0' }],
        });
        const result = await computeCreditUtilization('user-1');
        expect(result.per_card[0].utilization_pct).toBe(0);
        expect(result.aggregate.overall_utilization_pct).toBe(0);
        expect(Number.isFinite(result.per_card[0].utilization_pct)).toBe(true);
    });

    test.each([
        [30, 'moderate'],
        [50, 'high'],
        [75, 'critical'],
    ])('utilization of exactly %i%% classifies as %s', async (pct, expectedStatus) => {
        pool.query.mockResolvedValueOnce({
            rows: [{ id: 1, card_name: 'Test', bank_name: 'Bank', last_four: '1234', outstanding_balance: String(pct), current_outstanding_balance: String(pct), credit_limit: '100' }],
        });
        const result = await computeCreditUtilization('user-1');
        expect(result.per_card[0].utilization_pct).toBe(pct);
        expect(result.per_card[0].status).toBe(expectedStatus);
        expect(result.aggregate.status).toBe(expectedStatus);
    });
});

describe('computeDtiBreakdown', () => {
    test('zero income over the trailing 3 months does not divide by zero', async () => {
        pool.query.mockResolvedValueOnce({ rows: [{ total: '0' }] }); // income
        pool.query.mockResolvedValueOnce({ rows: [] }); // loans
        pool.query.mockResolvedValueOnce({ rows: [] }); // credit cards

        const result = await computeDtiBreakdown('user-1');
        expect(result.monthly_income).toBe(0);
        expect(result.dti_ratio).toBe(0);
        expect(Number.isFinite(result.dti_ratio)).toBe(true);
        expect(result.status).toBe('excellent');
    });

    test('uses the IST month boundary, not the UTC one, for the trailing 3-month income window', async () => {
        // 2026-01-31T19:00:00.000Z is 2026-02-01 00:30 IST -- already February
        // in IST while UTC is still on January 31. "This month" must resolve
        // to February (firstOfThisMonth=2026-02-01) and the trailing window
        // must start from November (threeMonthsAgo=2025-11-01), not from a
        // UTC-anchored January/October pair.
        jest.useFakeTimers().setSystemTime(new Date('2026-01-31T19:00:00.000Z'));
        try {
            pool.query.mockResolvedValueOnce({ rows: [{ total: '0' }] }); // income
            pool.query.mockResolvedValueOnce({ rows: [] }); // loans
            pool.query.mockResolvedValueOnce({ rows: [] }); // credit cards

            await computeDtiBreakdown('user-1');

            const [, incomeParams] = pool.query.mock.calls[0];
            expect(incomeParams).toEqual(['user-1', '2025-11-01', '2026-02-01']);
        } finally {
            jest.useRealTimers();
        }
    });
});

describe('GET /api/debt/payoff-optimizer', () => {
    test('a single loan ties — avalanche and snowball orders are identical', async () => {
        pool.query.mockResolvedValueOnce({
            rows: [{ id: 'loan-1', name: 'Only Loan', outstanding_balance: '100000', interest_rate_pct: '12', emi_amount: '5000', is_active: true }],
        });

        const res = await request(app).get('/api/debt/payoff-optimizer');

        expect(res.status).toBe(200);
        expect(res.body.avalanche.total_interest).toBe(res.body.snowball.total_interest);
        expect(res.body.recommendation).toMatch(/same total interest/i);
    });

    test('two loans with different rates/balances — recommendation matches whichever total_interest is actually lower', async () => {
        pool.query.mockResolvedValueOnce({
            rows: [
                { id: 'loan-a', name: 'High Rate', outstanding_balance: '100000', interest_rate_pct: '24', emi_amount: '5000', is_active: true },
                { id: 'loan-b', name: 'Low Rate', outstanding_balance: '50000', interest_rate_pct: '8', emi_amount: '2000', is_active: true },
            ],
        });

        const res = await request(app).get('/api/debt/payoff-optimizer?extra_monthly_payment=2000');

        expect(res.status).toBe(200);
        const { avalanche, snowball, recommendation } = res.body;
        if (avalanche.total_interest < snowball.total_interest) {
            expect(recommendation).toMatch(/avalanche method/i);
        } else if (snowball.total_interest < avalanche.total_interest) {
            expect(recommendation).toMatch(/snowball method/i);
        } else {
            expect(recommendation).toMatch(/same total interest/i);
        }
    });
});

describe('GET /api/debt/prepayment-impact — cross-user access', () => {
    test('returns 403 when the loan belongs to a different user', async () => {
        pool.query.mockResolvedValueOnce({ rows: [{ id: 'loan-1', user_id: 'someone-else' }] });

        const res = await request(app).get('/api/debt/prepayment-impact?loan_id=loan-1&prepayment_amount=10000');

        expect(res.status).toBe(403);
    });
});

describe('GET /api/debt/prepayment-impact — IST "today" for the simulated prepayment date', () => {
    test('uses the IST calendar day, not the UTC one, as the prepayment date', async () => {
        // 2026-01-31T19:00:00.000Z is 2026-02-01 00:30 IST -- already the next
        // calendar day in IST while UTC is still on Jan 31. The "after"
        // simulation's synthetic prepayment must be dated 2026-02-01, not
        // 2026-01-31. Uses isolateModulesAsync with its own mocked pool/auth/
        // amortization so this one test can freshly require debt.js under a
        // spy without disturbing the rest of this file's shared `pool`/`app`.
        jest.useFakeTimers().setSystemTime(new Date('2026-01-31T19:00:00.000Z'));
        let capturedPrepaymentDate;
        try {
            await jest.isolateModulesAsync(async () => {
                jest.doMock('../src/db/pool', () => ({ query: jest.fn() }));
                jest.doMock('../src/middleware/auth', () => (req, res, next) => {
                    req.user = { id: 'user-123' };
                    next();
                });
                jest.doMock('../src/utils/amortization', () => {
                    const actual = jest.requireActual('../src/utils/amortization');
                    return {
                        ...actual,
                        generateAmortization: jest.fn((args) => {
                            if (args.prepayments && args.prepayments.length > 0) {
                                capturedPrepaymentDate = args.prepayments[args.prepayments.length - 1].date;
                            }
                            return actual.generateAmortization(args);
                        }),
                    };
                });

                const freshPool = require('../src/db/pool');
                const freshRouter = require('../src/routes/debt');
                const freshExpress = require('express');
                const freshRequest = require('supertest');
                const freshApp = freshExpress();
                freshApp.use(freshExpress.json());
                freshApp.use('/api/debt', freshRouter);

                freshPool.query.mockResolvedValueOnce({
                    rows: [{
                        id: 'loan-1', user_id: 'user-123', outstanding_balance: '100000',
                        interest_rate_pct: '12', emi_amount: '5000', tenure_months: 24,
                        prepayment_penalty_pct: null,
                    }],
                });
                freshPool.query.mockResolvedValueOnce({ rows: [] }); // existing prepayments

                const res = await freshRequest(freshApp).get('/api/debt/prepayment-impact?loan_id=loan-1&prepayment_amount=10000');
                expect(res.status).toBe(200);
            });

            expect(capturedPrepaymentDate).toBe('2026-02-01');
        } finally {
            jest.useRealTimers();
        }
    });
});
