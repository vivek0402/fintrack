// Compares a saved financial plan's declared numbers against actual transaction
// history. Unlike planningEngine.js this needs the database, so every function
// here takes a `query` function (e.g. `pool.query` or a transaction client's
// `.query`) as a parameter instead of importing the connection pool directly —
// keeps this testable with a mock query function, no real DB required.

const ROLLING_MONTHS_DEFAULT = 3;
const MIN_FULL_MONTHS_REQUIRED = 2; // below this, a category/income stream is too new to average meaningfully
const DRIFT_THRESHOLD_PCT = 15; // % difference between declared and actual before it's worth flagging

// [start, end) date strings covering the trailing `months` full calendar months,
// excluding the current, in-progress month (same windowing convention as
// lastNFullMonthsRange() in routes/planning.js).
function lastNFullMonthsRange(months) {
    const now = new Date();
    const end = new Date(now.getFullYear(), now.getMonth(), 1);
    const start = new Date(now.getFullYear(), now.getMonth() - months, 1);
    return {
        start: start.toISOString().split('T')[0],
        end: end.toISOString().split('T')[0],
    };
}

/**
 * Average monthly spend in a category over the trailing N full calendar months.
 * Returns null if fewer than MIN_FULL_MONTHS_REQUIRED distinct months in that
 * window have any transactions — too little history to average meaningfully.
 * @param {(sql: string, params: any[]) => Promise<{rows: any[]}>} query
 * @param {string} userId
 * @param {string} categoryId
 * @param {number} months
 * @returns {Promise<number|null>}
 */
async function getRollingCategoryAverage(query, userId, categoryId, months = ROLLING_MONTHS_DEFAULT) {
    const { start, end } = lastNFullMonthsRange(months);
    const result = await query(
        `SELECT
            COALESCE(SUM(amount), 0) AS total,
            COUNT(DISTINCT DATE_TRUNC('month', date)) AS months_with_activity
         FROM transactions
         WHERE user_id = $1 AND category_id = $2 AND type = 'expense'
           AND date >= $3 AND date < $4`,
        [userId, categoryId, start, end]
    );
    const row = result.rows[0];
    if (parseInt(row.months_with_activity, 10) < MIN_FULL_MONTHS_REQUIRED) return null;
    return parseFloat(row.total) / months;
}

/**
 * Average monthly income over the trailing N full calendar months. Same
 * "not enough history yet" null guard as getRollingCategoryAverage.
 * @param {(sql: string, params: any[]) => Promise<{rows: any[]}>} query
 * @param {string} userId
 * @param {number} months
 * @returns {Promise<number|null>}
 */
async function getRollingIncomeAverage(query, userId, months = ROLLING_MONTHS_DEFAULT) {
    const { start, end } = lastNFullMonthsRange(months);
    const result = await query(
        `SELECT
            COALESCE(SUM(amount), 0) AS total,
            COUNT(DISTINCT DATE_TRUNC('month', date)) AS months_with_activity
         FROM transactions
         WHERE user_id = $1 AND type = 'income'
           AND date >= $2 AND date < $3`,
        [userId, start, end]
    );
    const row = result.rows[0];
    if (parseInt(row.months_with_activity, 10) < MIN_FULL_MONTHS_REQUIRED) return null;
    return parseFloat(row.total) / months;
}

/**
 * Compares each expense line item's declared amount against its category's
 * rolling actual average. Items with no category_id are skipped — they can't
 * be compared. Only items drifting by more than DRIFT_THRESHOLD_PCT are returned.
 * @param {(sql: string, params: any[]) => Promise<{rows: any[]}>} query
 * @param {string} userId
 * @param {Array<{id: string, name: string, amount: number|string, category_id: string|null}>} expenseItems
 * @param {number} months
 */
async function detectExpenseDrift(query, userId, expenseItems, months = ROLLING_MONTHS_DEFAULT) {
    const drifted = [];

    for (const item of expenseItems) {
        if (!item.category_id) continue;

        const declared = parseFloat(item.amount);
        if (!Number.isFinite(declared) || declared === 0) continue;

        const actualAverage = await getRollingCategoryAverage(query, userId, item.category_id, months);
        if (actualAverage === null) continue;

        const percentDifference = ((actualAverage - declared) / declared) * 100;
        if (Math.abs(percentDifference) > DRIFT_THRESHOLD_PCT) {
            drifted.push({
                id: item.id,
                name: item.name,
                category_id: item.category_id,
                declared_amount: declared,
                actual_average: actualAverage,
                percent_difference: percentDifference,
            });
        }
    }

    return drifted;
}

/**
 * Compares the plan's declared monthly income against the rolling actual
 * average of income-type transactions. Returns null if there's nothing
 * meaningful to compare or the drift doesn't clear DRIFT_THRESHOLD_PCT.
 * @param {(sql: string, params: any[]) => Promise<{rows: any[]}>} query
 * @param {string} userId
 * @param {number|string} declaredMonthlyIncome
 * @param {number} months
 */
async function detectIncomeDrift(query, userId, declaredMonthlyIncome, months = ROLLING_MONTHS_DEFAULT) {
    const declared = parseFloat(declaredMonthlyIncome);
    if (!Number.isFinite(declared) || declared === 0) return null;

    const actualAverage = await getRollingIncomeAverage(query, userId, months);
    if (actualAverage === null) return null;

    const percentDifference = ((actualAverage - declared) / declared) * 100;
    if (Math.abs(percentDifference) <= DRIFT_THRESHOLD_PCT) return null;

    return {
        declared_amount: declared,
        actual_average: actualAverage,
        percent_difference: percentDifference,
    };
}

/**
 * Single entry point: runs both drift checks for a user's plan and returns one
 * structured report. Every call is an explicit, user-requested preview — there
 * is no "isSignificant" auto-trigger here.
 * @param {(sql: string, params: any[]) => Promise<{rows: any[]}>} query
 * @param {string} userId
 * @param {{monthly_income: number|string}} plan
 * @param {Array<{id: string, name: string, amount: number|string, category_id: string|null}>} expenseItems
 * @param {number} months
 */
async function computeDriftReport(query, userId, plan, expenseItems, months = ROLLING_MONTHS_DEFAULT) {
    const driftedExpenses = await detectExpenseDrift(query, userId, expenseItems, months);
    const incomeDrift = await detectIncomeDrift(query, userId, plan.monthly_income, months);
    return { driftedExpenses, incomeDrift };
}

module.exports = {
    getRollingCategoryAverage,
    getRollingIncomeAverage,
    detectExpenseDrift,
    detectIncomeDrift,
    computeDriftReport,
    ROLLING_MONTHS_DEFAULT,
    MIN_FULL_MONTHS_REQUIRED,
    DRIFT_THRESHOLD_PCT,
};
