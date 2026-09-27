const pool = require('../db/pool');

// Budgets for one month with each budget's spent amount — the exact rows the
// Budgets page renders (GET /api/budgets), shared with the Android widgets so
// both show the same per-budget numbers.
async function fetchBudgetsWithSpent(userId, month, year) {
    const result = await pool.query(
        `SELECT b.*, c.name AS category_name, c.icon AS category_icon, c.color AS category_color,
              c.is_investment_category,
              COALESCE(SUM(t.amount), 0) AS spent
       FROM budgets b
       JOIN categories c ON b.category_id = c.id AND (c.user_id = b.user_id OR c.user_id IS NULL)
       LEFT JOIN transactions t
         ON t.category_id = b.category_id AND t.user_id = b.user_id
         AND t.type = 'expense'
         AND EXTRACT(MONTH FROM t.date) = $2
         AND EXTRACT(YEAR  FROM t.date) = $3
       WHERE b.user_id = $1 AND b.month = $2 AND b.year = $3
       GROUP BY b.id, c.name, c.icon, c.color, c.is_investment_category
       ORDER BY c.name ASC`,
        [userId, month, year]
    );
    return result.rows;
}

// A budget is "warn" once 80% of it is used, "over" once spent exceeds it.
const WARN_USED_RATIO = 0.8;

function budgetLevel(spent, limit) {
    if (!(limit > 0)) return spent > 0 ? 'over' : 'ok';
    if (spent > limit) return 'over';
    if (spent / limit >= WARN_USED_RATIO) return 'warn';
    return 'ok';
}

// Mirrors the Budgets page header (Total Budget / Spent So Far / remaining):
// investment-category budgets are left out of the aggregate, because
// investing isn't spending.
function budgetTotals(rows) {
    const spending = rows.filter(b => !b.is_investment_category);
    const total = spending.reduce((s, b) => s + (parseFloat(b.amount) || 0), 0);
    const spent = spending.reduce((s, b) => s + (parseFloat(b.spent) || 0), 0);
    return {
        total,
        spent,
        left: Math.max(total - spent, 0),
        over: Math.max(spent - total, 0),
        used_pct: total > 0 ? (spent / total) * 100 : 0,
        level: total > 0 ? budgetLevel(spent, total) : 'none',
    };
}

// Per-budget figures the same way each Budgets page card computes them.
function budgetFigures(row) {
    const limit = parseFloat(row.amount) || 0;
    const spent = parseFloat(row.spent) || 0;
    const isOver = spent > limit;
    return {
        name: row.category_name,
        limit,
        spent,
        remaining: isOver ? 0 : limit - spent,
        over: isOver ? spent - limit : 0,
        is_over: isOver,
        used_pct: limit > 0 ? (spent / limit) * 100 : 0,
        level: budgetLevel(spent, limit),
    };
}

// The `n` tightest budgets: over-budget ones first, then the smallest share
// of the budget left. Over-budget ones sort among themselves by the same
// ratio (most over, proportionally, first). Zero-amount budgets are skipped:
// they have no "share left" to rank.
function tightestBudgets(rows, n = 3) {
    return rows
        .map(budgetFigures)
        .filter(b => b.limit > 0)
        .map(b => ({ ...b, _leftRatio: (b.limit - b.spent) / b.limit }))
        .sort((a, b) =>
            (Number(b.is_over) - Number(a.is_over))
            || (a._leftRatio - b._leftRatio)
            || String(a.name).localeCompare(String(b.name)))
        .slice(0, n)
        // eslint-disable-next-line no-unused-vars
        .map(({ _leftRatio, ...rest }) => rest);
}

module.exports = { fetchBudgetsWithSpent, budgetTotals, budgetFigures, tightestBudgets, budgetLevel };
