process.env.JWT_SECRET = 'test-secret';

jest.mock('../src/db/pool', () => ({
    query: jest.fn(),
    connect: jest.fn(),
}));

const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const pool = require('../src/db/pool');
const widgetRouter = require('../src/routes/widget');
const analyticsRouter = require('../src/routes/analytics');
const budgetsRouter = require('../src/routes/budgets');
const { signWidgetToken } = require('../src/utils/widgetToken');
const { tightestBudgets, budgetTotals } = require('../src/utils/budgetSpend');

const app = express();
app.use(express.json());
app.use('/api/widget', widgetRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/budgets', budgetsRouter);

const USER = 'user-123';
const accessToken = () => jwt.sign({ id: USER, email: 'a@b.com' }, process.env.JWT_SECRET, { expiresIn: '15m' });
const bearer = (t) => ({ Authorization: `Bearer ${t}` });

// ── Fixture DB ────────────────────────────────────────────────────────────────
// Routes each query to a canned answer by what it selects, so the widget, the
// dashboard summary and the Budgets page can all run against the same data.
let dbVersion = 0;
const TODAY_TOTAL = '1240.4';
const MONTH_TOTAL = '26599.6';
const INCOME_TOTAL = '90000';
const BUDGET_ROWS = [
    { id: 'b1', category_name: 'Food',        amount: '8000',  spent: '5900',  is_investment_category: false },
    { id: 'b2', category_name: 'Shopping',    amount: '5000',  spent: '5640',  is_investment_category: false },
    { id: 'b3', category_name: 'Transport',   amount: '3000',  spent: '600',   is_investment_category: false },
    { id: 'b4', category_name: 'Fun',         amount: '2000',  spent: '1900',  is_investment_category: false },
    { id: 'b5', category_name: 'Investments', amount: '27000', spent: '10000', is_investment_category: true },
];

function fixtureDb(sql, params) {
    if (sql.includes('SELECT widget_token_version FROM users')) return { rows: [{ widget_token_version: dbVersion }] };
    if (sql.includes('UPDATE users SET widget_token_version')) { dbVersion += 1; return { rows: [] }; }
    if (sql.includes('FROM budgets b')) return { rows: BUDGET_ROWS };
    if (sql.includes("type='income'")) return { rows: [{ total: INCOME_TOTAL }] };
    if (sql.includes("type='expense' AND date=$2")) return { rows: [{ total: TODAY_TOTAL }], params };
    if (sql.includes("type='expense'") && sql.includes('EXTRACT(MONTH FROM date)=$2')) return { rows: [{ total: MONTH_TOTAL }] };
    return { rows: [] };
}

beforeEach(() => {
    dbVersion = 0;
    pool.query.mockReset();
    pool.query.mockImplementation(async (sql, params) => fixtureDb(sql, params));
});

// ── Token issue / revoke ─────────────────────────────────────────────────────
describe('POST /api/widget/token', () => {
    test('issues a 180-day widget-scoped token carrying the current version', async () => {
        dbVersion = 4;
        const res = await request(app).post('/api/widget/token').set(bearer(accessToken()));

        expect(res.status).toBe(200);
        const decoded = jwt.verify(res.body.token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
        expect(decoded).toMatchObject({ id: USER, scope: 'widget', ver: 4 });
        const days = (decoded.exp - decoded.iat) / 86400;
        expect(days).toBe(180);
    });

    test('requires a normal access token', async () => {
        const res = await request(app).post('/api/widget/token');
        expect(res.status).toBe(401);
    });

    test('a widget token cannot mint another widget token', async () => {
        const res = await request(app).post('/api/widget/token').set(bearer(signWidgetToken(USER, 0)));
        expect(res.status).toBe(401);
    });
});

describe('POST /api/widget/revoke', () => {
    test('bumps the version so earlier widget tokens stop working', async () => {
        const widgetToken = signWidgetToken(USER, 0);
        expect((await request(app).get('/api/widget/summary').set(bearer(widgetToken))).status).toBe(200);

        const revoke = await request(app).post('/api/widget/revoke').set(bearer(accessToken()));
        expect(revoke.status).toBe(200);
        expect(dbVersion).toBe(1);
        const [sql, params] = pool.query.mock.calls.find(([s]) => s.includes('UPDATE users'));
        expect(sql).toMatch(/widget_token_version = widget_token_version \+ 1 WHERE id = \$1/);
        expect(params).toEqual([USER]);

        const after = await request(app).get('/api/widget/summary').set(bearer(widgetToken));
        expect(after.status).toBe(401);

        // A freshly issued token (new version) works again.
        const fresh = await request(app).post('/api/widget/token').set(bearer(accessToken()));
        expect((await request(app).get('/api/widget/summary').set(bearer(fresh.body.token))).status).toBe(200);
    });

    test('cannot be called with a widget token', async () => {
        const res = await request(app).post('/api/widget/revoke').set(bearer(signWidgetToken(USER, 0)));
        expect(res.status).toBe(401);
        expect(dbVersion).toBe(0);
    });
});

// ── Scope isolation ──────────────────────────────────────────────────────────
describe('scope isolation', () => {
    test('a widget token is refused by normal API routes', async () => {
        const widgetToken = signWidgetToken(USER, 0);
        expect((await request(app).get('/api/budgets').set(bearer(widgetToken))).status).toBe(401);
        expect((await request(app).get('/api/analytics/summary').set(bearer(widgetToken))).status).toBe(401);
        // No data query ran on its behalf.
        expect(pool.query).not.toHaveBeenCalled();
    });

    test('the summary refuses a normal access token', async () => {
        const res = await request(app).get('/api/widget/summary').set(bearer(accessToken()));
        expect(res.status).toBe(401);
        expect(pool.query).not.toHaveBeenCalled();
    });

    test('the summary refuses an expired widget token', async () => {
        const expired = jwt.sign({ id: USER, scope: 'widget', ver: 0, exp: Math.floor(Date.now() / 1000) - 10 }, process.env.JWT_SECRET);
        expect((await request(app).get('/api/widget/summary').set(bearer(expired))).status).toBe(401);
    });

    test('the summary refuses a widget token without a version, or signed with another secret', async () => {
        const noVer = jwt.sign({ id: USER, scope: 'widget' }, process.env.JWT_SECRET);
        const forged = jwt.sign({ id: USER, scope: 'widget', ver: 0 }, 'other-secret');
        expect((await request(app).get('/api/widget/summary').set(bearer(noVer))).status).toBe(401);
        expect((await request(app).get('/api/widget/summary').set(bearer(forged))).status).toBe(401);
    });

    test('the summary refuses a token for a user that no longer exists', async () => {
        pool.query.mockImplementation(async () => ({ rows: [] }));
        expect((await request(app).get('/api/widget/summary').set(bearer(signWidgetToken(USER, 0)))).status).toBe(401);
    });
});

// ── Summary numbers ──────────────────────────────────────────────────────────
describe('GET /api/widget/summary', () => {
    test('matches the dashboard summary and the Budgets page on the same data', async () => {
        const widget = await request(app).get('/api/widget/summary').set(bearer(signWidgetToken(USER, 0)));
        expect(widget.status).toBe(200);

        const { month, year } = require('../src/utils/istDate').istMonthYear();
        const dash = await request(app).get(`/api/analytics/summary?month=${month}&year=${year}`).set(bearer(accessToken()));
        const page = await request(app).get(`/api/budgets?month=${month}&year=${year}`).set(bearer(accessToken()));

        // Month spend == the dashboard's Expenses hero.
        expect(widget.body.month_spent).toBe(dash.body.summary.total_expenses);
        expect(widget.body.today_spent).toBe(1240.4);

        // Budget totals == the Budgets page header (investments excluded).
        const pageTotals = budgetTotals(page.body.budgets);
        expect(widget.body.month_budget_total).toBe(pageTotals.total);
        expect(widget.body.month_budget_total).toBe(18000);
        expect(widget.body.budget_spent).toBe(14040);
        expect(widget.body.budget_left).toBe(3960);

        // Per-budget figures == what each Budgets page card shows.
        const food = widget.body.budgets.find(b => b.name === 'Food');
        expect(food).toMatchObject({ limit: 8000, spent: 5900, remaining: 2100, over: 0, is_over: false });
        const shopping = widget.body.budgets.find(b => b.name === 'Shopping');
        expect(shopping).toMatchObject({ limit: 5000, spent: 5640, remaining: 0, over: 640, is_over: true, level: 'over' });
        expect(shopping.display).toMatchObject({ over: '₹640', remaining: '₹0' });
    });

    test('preformats amounts with ₹ and Indian digit grouping', async () => {
        const res = await request(app).get('/api/widget/summary').set(bearer(signWidgetToken(USER, 0)));
        expect(res.body.display).toMatchObject({
            today_spent: '₹1,240',
            month_spent: '₹26,600',
            month_budget_total: '₹18,000',
            budget_left: '₹3,960',
        });
        expect(widgetRouter.inr(12345678.5)).toBe('₹1,23,45,679');
        expect(widgetRouter.inr(0)).toBe('₹0');
        expect(widgetRouter.inr(-0.2)).toBe('₹0');
    });

    test('uses IST dates: 20:00 UTC on Sep 30 is already Oct 1 in India', async () => {
        jest.useFakeTimers({ now: new Date('2026-09-30T20:00:00Z'), doNotFake: ['nextTick', 'setImmediate', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'clearImmediate', 'queueMicrotask', 'hrtime', 'performance'] });
        try {
            const res = await request(app).get('/api/widget/summary').set(bearer(signWidgetToken(USER, 0)));
            expect(res.body.month_label).toBe('October');
            expect(res.body.date).toBe('2026-10-01');
            const dayCall = pool.query.mock.calls.find(([s]) => s.includes("type='expense' AND date=$2"));
            expect(dayCall[1]).toEqual([USER, '2026-10-01']);
            const monthCall = pool.query.mock.calls.find(([s]) => s.includes('EXTRACT(MONTH FROM date)=$2'));
            expect(monthCall[1]).toEqual([USER, 10, 2026]);
            const budgetCall = pool.query.mock.calls.find(([s]) => s.includes('FROM budgets b'));
            expect(budgetCall[1]).toEqual([USER, 10, 2026]);
        } finally {
            jest.useRealTimers();
        }
    });

    test('today and month totals use the shared spending exclusions (no investing/transfers)', async () => {
        await request(app).get('/api/widget/summary').set(bearer(signWidgetToken(USER, 0)));
        const spendCalls = pool.query.mock.calls.filter(([s]) => s.includes("type='expense'") && !s.includes('FROM budgets'));
        expect(spendCalls).toHaveLength(2);
        for (const [sql] of spendCalls) {
            expect(sql).toMatch(/is_investment_category = true/);
            expect(sql).toMatch(/ARRAY\['transfer','credit_card_payment'\]/);
            expect(sql).toMatch(/personal_loan_id IS NULL/);
        }
    });

    test('a user with no budgets gets zero totals and an empty list', async () => {
        pool.query.mockImplementation(async (sql, params) =>
            sql.includes('FROM budgets b') ? { rows: [] } : fixtureDb(sql, params));
        const res = await request(app).get('/api/widget/summary').set(bearer(signWidgetToken(USER, 0)));
        expect(res.status).toBe(200);
        expect(res.body.budgets).toEqual([]);
        expect(res.body.month_budget_total).toBe(0);
        expect(res.body.budget_level).toBe('none');
    });
});

// ── Tightest-3 ordering ──────────────────────────────────────────────────────
describe('tightestBudgets', () => {
    const row = (name, amount, spent) => ({ category_name: name, amount: String(amount), spent: String(spent) });

    test('over-budget first, then the least share left', () => {
        const out = tightestBudgets([
            row('Roomy', 1000, 100),      // 90% left
            row('Tight', 1000, 950),      // 5% left
            row('SlightlyOver', 1000, 1010),
            row('WayOver', 100, 300),
            row('Middle', 1000, 500),     // 50% left
        ]);
        expect(out.map(b => b.name)).toEqual(['WayOver', 'SlightlyOver', 'Tight']);
    });

    test('ranks by share left, not by rupees left', () => {
        const out = tightestBudgets([
            row('BigBudget', 50000, 40000),   // 10,000 left but only 20%
            row('SmallBudget', 1000, 500),    // 500 left but 50%
        ]);
        expect(out.map(b => b.name)).toEqual(['BigBudget', 'SmallBudget']);
    });

    test('skips zero-amount budgets and returns at most three', () => {
        const out = tightestBudgets([row('Zero', 0, 50), row('A', 10, 1), row('B', 10, 2), row('C', 10, 3), row('D', 10, 4)]);
        expect(out).toHaveLength(3);
        expect(out.map(b => b.name)).not.toContain('Zero');
        expect(out.map(b => b.name)).toEqual(['D', 'C', 'B']);
    });
});
