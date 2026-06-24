// Manual sanity-check script for behaviorAnalysis.js against the real local
// database — checks the drift comparison logic on real data before relying
// on the "Recalculate from recent spending" button in the UI.
// Run with: node backend/scripts/test-behavior-analysis.js <user-id>

const pool = require('../src/db/pool');
const { computeDriftReport, DRIFT_THRESHOLD_PCT, ROLLING_MONTHS_DEFAULT } = require('../src/services/behaviorAnalysis');

async function main() {
    const userId = process.argv[2];
    if (!userId) {
        console.error('Usage: node backend/scripts/test-behavior-analysis.js <user-id>');
        process.exitCode = 1;
        return;
    }

    const planRes = await pool.query('SELECT * FROM financial_plans WHERE user_id = $1', [userId]);
    if (planRes.rows.length === 0) {
        console.error(`No financial plan found for user ${userId}.`);
        process.exitCode = 1;
        return;
    }
    const plan = planRes.rows[0];

    const expensesRes = await pool.query(
        'SELECT id, name, amount, category_id FROM financial_plan_expenses WHERE plan_id = $1 ORDER BY created_at ASC',
        [plan.id]
    );

    console.log(`\n=== Drift report for user ${userId} ===`);
    console.log(`Rolling window: trailing ${ROLLING_MONTHS_DEFAULT} full calendar months | Drift threshold: ${DRIFT_THRESHOLD_PCT}%`);
    console.log(`Declared monthly income: Rs.${parseFloat(plan.monthly_income).toLocaleString('en-IN')}`);
    console.log(`Expense line items: ${expensesRes.rows.length} (${expensesRes.rows.filter(e => e.category_id).length} linked to a category)`);

    const report = await computeDriftReport(pool.query.bind(pool), userId, plan, expensesRes.rows);

    console.log('\n--- Income drift ---');
    if (!report.incomeDrift) {
        console.log('No significant income drift (or not enough transaction history yet).');
    } else {
        const d = report.incomeDrift;
        console.log(`Declared: Rs.${d.declared_amount.toLocaleString('en-IN')}  ->  Actual avg: Rs.${Math.round(d.actual_average).toLocaleString('en-IN')}  (${d.percent_difference > 0 ? '+' : ''}${d.percent_difference.toFixed(1)}%)`);
    }

    console.log('\n--- Expense drift ---');
    if (report.driftedExpenses.length === 0) {
        console.log('No drifted expense line items (or none are linked to a category yet).');
    } else {
        for (const item of report.driftedExpenses) {
            console.log(`${item.name}: declared Rs.${item.declared_amount.toLocaleString('en-IN')}  ->  actual avg Rs.${Math.round(item.actual_average).toLocaleString('en-IN')}  (${item.percent_difference > 0 ? '+' : ''}${item.percent_difference.toFixed(1)}%)`);
        }
    }

    console.log('');
}

main()
    .catch(err => {
        console.error('Error:', err.message);
        process.exitCode = 1;
    })
    .finally(() => pool.end());
