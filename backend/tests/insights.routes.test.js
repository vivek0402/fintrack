process.env.JWT_SECRET = 'test-secret';
// insights.js pulls in utils/ai.js, which constructs a Groq client at require
// time and throws when the key is absent. A dummy value is enough -- these
// tests never reach a model call. Same guard as tests/utils.ai.test.js.
process.env.GROQ_API_KEY = 'test-groq-key';

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
const insightsRouter = require('../src/routes/insights');

const app = express();
app.use(express.json());
app.use('/api/insights', insightsRouter);

afterEach(() => { pool.query.mockReset(); });

// /peer-benchmarks compares the user's spending mix against income-bracket
// bands. Its two helpers (mapCategoryToGroup, getIncomeBracket) are module-
// local, so they are exercised through the route -- which also covers the
// route's own arithmetic.
//
// Query order: [0] 3-month income, then a Promise.all of
// [1] last month's expenses by category, [2] last month's income,
// [3] last month's non-savings expense.

const total = (n) => ({ rows: [{ total: String(n) }] });
const categories = (pairs) => ({
    rows: pairs.map(([category_name, t]) => ({ category_name, total: String(t) })),
});

/**
 * @param threeMonthIncome drives the income bracket
 * @param catRows          last month's spend by category name
 */
function mockBenchmarks({ threeMonthIncome = 300000, catRows = [], monthIncome = 100000, nonSavingsExpense = 50000 } = {}) {
    pool.query
        .mockResolvedValueOnce(total(threeMonthIncome))   // avg monthly income
        .mockResolvedValueOnce(categories(catRows))       // expenses by category
        .mockResolvedValueOnce(total(monthIncome))        // month income
        .mockResolvedValueOnce(total(nonSavingsExpense)); // non-savings expense
}

const get = () => request(app).get('/api/insights/peer-benchmarks');
const groupOf = (body, key) => body.benchmark_groups.find(g => g.group === key);

describe('GET /peer-benchmarks — income bracket', () => {
    it('places a low earner in the lowest bracket', async () => {
        mockBenchmarks({ threeMonthIncome: 90000 }); // 30k/month
        const res = await get();
        expect(res.status).toBe(200);
        expect(res.body.income_bracket).toBe('under_5L');
    });

    it('moves the user up a bracket as income rises', async () => {
        mockBenchmarks({ threeMonthIncome: 300000 }); // 100k/month
        const mid = (await get()).body.income_bracket;

        pool.query.mockReset();
        mockBenchmarks({ threeMonthIncome: 3000000 }); // 1M/month
        const high = (await get()).body.income_bracket;

        expect(mid).not.toBe('under_5L');
        expect(high).toBe('above_20L');
    });

    it('averages three months rather than using the raw total', async () => {
        // Dividing by 3 is what turns the window into a monthly figure; without
        // it every user would be bracketed three times too high.
        mockBenchmarks({ threeMonthIncome: 90000 });
        const low = (await get()).body.income_bracket;

        pool.query.mockReset();
        mockBenchmarks({ threeMonthIncome: 270000 }); // same monthly, x3 window
        expect((await get()).body.income_bracket).not.toBe(low);
    });
});

describe('GET /peer-benchmarks — category grouping', () => {
    it('maps category names onto benchmark groups by keyword', async () => {
        mockBenchmarks({
            monthIncome: 100000,
            catRows: [['Groceries', 20000], ['Rent', 30000]],
        });
        const res = await get();

        // 'groceries' and 'rent' are keywords for their respective groups.
        const food = res.body.benchmark_groups.find(g => g.user_pct === 20);
        const housing = res.body.benchmark_groups.find(g => g.user_pct === 30);
        expect(food).toBeDefined();
        expect(housing).toBeDefined();
    });

    it('is case-insensitive and matches on substrings', async () => {
        mockBenchmarks({ monthIncome: 100000, catRows: [['MONTHLY RENT PAYMENT', 25000]] });
        const res = await get();
        expect(res.body.benchmark_groups.some(g => g.user_pct === 25)).toBe(true);
    });

    it('ignores a category that matches no group instead of miscounting it', async () => {
        mockBenchmarks({ monthIncome: 100000, catRows: [['Blorptastic', 40000]] });
        const res = await get();
        // Every group stays at zero -- an unmatched category must not be
        // silently folded into one.
        expect(res.body.benchmark_groups.every(g => g.user_pct === 0)).toBe(true);
    });
});

describe('GET /peer-benchmarks — banding', () => {
    it('labels spend inside, below and above its band', async () => {
        mockBenchmarks({ monthIncome: 100000, catRows: [['Rent', 90000]] });
        const res = await get();

        const statuses = res.body.benchmark_groups.map(g => g.status);
        expect(statuses).toContain('above_benchmark'); // 90% on housing
        expect(statuses).toContain('below_benchmark'); // everything else at 0
        expect(new Set(statuses).size).toBeGreaterThan(1);
    });

    it('reports deviation from the midpoint of the band', async () => {
        mockBenchmarks({ monthIncome: 100000, catRows: [['Rent', 30000]] });
        const res = await get();
        const g = res.body.benchmark_groups.find(x => x.user_pct === 30);
        expect(g.deviation_pct).toBeCloseTo(30 - (g.benchmark_min + g.benchmark_max) / 2, 2);
    });

    it('does not divide by zero when the month had no income', async () => {
        mockBenchmarks({ monthIncome: 0, catRows: [['Rent', 30000]] });
        const res = await get();
        expect(res.status).toBe(200);
        expect(res.body.benchmark_groups.every(g => Number.isFinite(g.user_pct))).toBe(true);
        expect(res.body.savings_rate_comparison.user_pct).toBe(0);
    });
});

describe('GET /peer-benchmarks — savings rate', () => {
    it('derives the rate from the non-savings expense figure, not total spend', async () => {
        // The route deliberately runs two expense queries: the by-category one
        // still counts investing (so the "Savings & Investments" comparison
        // bucket is not empty for anyone using a real Investments category),
        // while the savings-rate figure excludes it. Collapsing the two would
        // silently understate the savings rate.
        mockBenchmarks({
            monthIncome: 100000,
            catRows: [['Investments', 40000]], // counted in the group total
            nonSavingsExpense: 20000,          // but not in the savings rate
        });
        const res = await get();

        expect(res.body.savings_rate_comparison.user_pct).toBe(80); // (100k-20k)/100k
        // ...while the group bucket still sees the 40k of investing.
        expect(res.body.benchmark_groups.some(g => g.user_pct === 40)).toBe(true);
    });

    it('can report a negative savings rate when spending exceeds income', async () => {
        mockBenchmarks({ monthIncome: 50000, nonSavingsExpense: 75000 });
        const res = await get();
        expect(res.body.savings_rate_comparison.user_pct).toBeLessThan(0);
    });
});

describe('GET /peer-benchmarks — summary', () => {
    it('never nominates savings as a "strongest area" for being below benchmark', async () => {
        // Under-saving is a weakness, not a strength, and is already reported
        // by savings_rate_comparison.
        mockBenchmarks({ monthIncome: 100000, catRows: [] });
        const res = await get();
        expect(res.body.summary?.strongest_area?.group).not.toBe('savings_investments');
    });
});

describe('GET /peer-benchmarks — plumbing', () => {
    it('scopes every query to the authenticated user', async () => {
        mockBenchmarks();
        await get();
        for (const [, params] of pool.query.mock.calls) {
            expect(params[0]).toBe('user-123');
        }
    });

    it('excludes transfers from the income window it brackets on', async () => {
        // Uses nonSpendingExclusionSQL, so an internal transfer cannot inflate
        // income and push the user into a higher benchmark bracket.
        mockBenchmarks();
        await get();
        expect(pool.query.mock.calls[0][0]).toMatch(/credit_card_payment/);
    });

    it('returns 500 rather than leaking a database error', async () => {
        pool.query.mockRejectedValueOnce(new Error('column does not exist'));
        const res = await get();
        expect(res.status).toBe(500);
        expect(JSON.stringify(res.body)).not.toMatch(/column does not exist/);
    });
});
