const pool = require('../db/pool');
const { nonSpendingExclusionSQL } = require('./savingsRate');

// One place for "how much did this user spend" totals, so the dashboard
// (GET /api/analytics/summary) and the Android widgets (GET /api/widget/summary)
// can't drift apart. "Spending" is type='expense' minus investing, goal
// contributions, personal-loan movements and internal transfers — the same
// nonSpendingExclusionSQL filter every analytics view uses.

// Month total: the dashboard's "Expenses" hero figure (summary.total_expenses).
async function fetchMonthExpenseTotal(userId, month, year) {
    const { rows } = await pool.query(
        `SELECT COALESCE(SUM(amount),0) AS total FROM transactions
       WHERE user_id=$1 AND type='expense'
       AND EXTRACT(MONTH FROM date)=$2 AND EXTRACT(YEAR FROM date)=$3
       AND ${nonSpendingExclusionSQL('transactions')}`,
        [userId, month, year]
    );
    return parseFloat(rows[0]?.total) || 0;
}

// Single-day total, same definition. `dateStr` is an IST 'YYYY-MM-DD'
// (istDateStr), never a server-local date.
async function fetchDayExpenseTotal(userId, dateStr) {
    const { rows } = await pool.query(
        `SELECT COALESCE(SUM(amount),0) AS total FROM transactions
       WHERE user_id=$1 AND type='expense' AND date=$2
       AND ${nonSpendingExclusionSQL('transactions')}`,
        [userId, dateStr]
    );
    return parseFloat(rows[0]?.total) || 0;
}

module.exports = { fetchMonthExpenseTotal, fetchDayExpenseTotal };
