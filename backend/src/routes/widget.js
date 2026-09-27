const express = require('express');
const { rateLimit } = require('express-rate-limit');
const pool = require('../db/pool');
const auth = require('../middleware/auth');
const widgetAuth = require('../middleware/widgetAuth');
const { signWidgetToken, WIDGET_TOKEN_TTL_DAYS } = require('../utils/widgetToken');
const { fetchMonthExpenseTotal, fetchDayExpenseTotal } = require('../utils/spendTotals');
const { fetchBudgetsWithSpent, budgetTotals, tightestBudgets } = require('../utils/budgetSpend');
const { istDateStr, istMonthYear } = require('../utils/istDate');
const router = express.Router();

// Both limiters run after auth, so they key on the user, not the IP.
const tokenLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => `widget-token:${req.user.id}`,
    message: { error: 'Too many requests. Please try again later.' },
});

// Widgets refresh every 30 min plus on app open, transaction saves and taps:
// 60 per 15 min is far above real use and still bounds a runaway client.
const summaryLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => `widget-summary:${req.user.id}`,
    message: { error: 'Too many requests. Please try again later.' },
});

// ₹ + Indian digit grouping, preformatted so the Java side never has to do
// lakh/crore grouping itself.
function inr(n) {
    return '₹' + (Math.round(Number(n) || 0) || 0).toLocaleString('en-IN');
}

// Issue a widget token for the signed-in user (normal access token required).
router.post('/token', auth, tokenLimiter, async (req, res) => {
    try {
        const { rows } = await pool.query(
            'SELECT widget_token_version FROM users WHERE id = $1',
            [req.user.id]
        );
        if (!rows.length) return res.status(404).json({ error: 'User not found.' });
        const token = signWidgetToken(req.user.id, Number(rows[0].widget_token_version) || 0);
        res.json({ token, expires_in_days: WIDGET_TOKEN_TTL_DAYS });
    } catch {
        res.status(500).json({ error: 'Server error.' });
    }
});

// Invalidate every widget token issued so far (all devices).
router.post('/revoke', auth, tokenLimiter, async (req, res) => {
    try {
        await pool.query(
            'UPDATE users SET widget_token_version = widget_token_version + 1 WHERE id = $1',
            [req.user.id]
        );
        res.json({ revoked: true });
    } catch {
        res.status(500).json({ error: 'Server error.' });
    }
});

// Everything the three widgets render. Numbers come from the same helpers
// the app uses: month spend = dashboard "Expenses" (analytics summary), budget
// rows = Budgets page (GET /api/budgets), today = the same spending filter
// applied to today's IST date.
router.get('/summary', widgetAuth, summaryLimiter, async (req, res) => {
    try {
        const now = new Date();
        const today = istDateStr(now);
        const { month, year } = istMonthYear(now);

        const [todaySpent, monthSpent, budgetRows] = await Promise.all([
            fetchDayExpenseTotal(req.user.id, today),
            fetchMonthExpenseTotal(req.user.id, month, year),
            fetchBudgetsWithSpent(req.user.id, month, year),
        ]);

        const totals = budgetTotals(budgetRows);
        const budgets = tightestBudgets(budgetRows, 3).map(b => ({
            ...b,
            display: {
                limit: inr(b.limit),
                spent: inr(b.spent),
                remaining: inr(b.remaining),
                over: inr(b.over),
            },
        }));

        res.set('Cache-Control', 'no-store');
        res.json({
            today_spent: todaySpent,
            month_spent: monthSpent,
            month_budget_total: totals.total,
            budget_spent: totals.spent,
            budget_left: totals.left,
            budget_over: totals.over,
            budget_used_pct: totals.used_pct,
            budget_level: totals.level,
            budgets,
            month_label: new Date(Date.UTC(year, month - 1, 1))
                .toLocaleString('en-US', { month: 'long', timeZone: 'UTC' }),
            date: today,
            generated_at: now.toISOString(),
            display: {
                today_spent: inr(todaySpent),
                month_spent: inr(monthSpent),
                month_budget_total: inr(totals.total),
                budget_spent: inr(totals.spent),
                budget_left: inr(totals.left),
                budget_over: inr(totals.over),
            },
        });
    } catch {
        res.status(500).json({ error: 'Server error.' });
    }
});

module.exports = router;
module.exports.inr = inr;
