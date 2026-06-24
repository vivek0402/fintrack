// Phase 1 of docs/GROWTH_BRIEF_10000X.md: compares 7-day and 30-day
// transaction-logging retention between the 'control' and 'treatment'
// onboarding cohorts (see migration 055 + auth.js assignOnboardingVariant).
// Retention here means "logged at least one transaction within N days of
// account creation" -- needs no new schema beyond users.created_at and
// transactions.created_at.
//
// Only users old enough for the full window to have elapsed are counted in
// each window's denominator -- a user who signed up 2 days ago hasn't failed
// 7-day retention yet, they just haven't had the chance to succeed or fail.
//
// Run with: node backend/scripts/retention-report.js

const pool = require('../src/db/pool');

async function retentionByWindow(days) {
    const res = await pool.query(`
        SELECT
            u.onboarding_variant AS cohort,
            COUNT(*) AS eligible,
            COUNT(*) FILTER (
                WHERE EXISTS (
                    SELECT 1 FROM transactions t
                    WHERE t.user_id = u.id
                      AND t.created_at <= u.created_at + INTERVAL '1 day' * $1
                )
            ) AS retained
        FROM users u
        WHERE u.is_verified = true
          AND u.created_at <= NOW() - INTERVAL '1 day' * $1
        GROUP BY u.onboarding_variant
        ORDER BY u.onboarding_variant
    `, [days]);
    return res.rows;
}

function printTable(title, rows) {
    console.log(`\n--- ${title} ---`);
    if (rows.length === 0) {
        console.log('No users old enough yet for this window.');
        return;
    }
    console.log('Cohort      | Eligible | Retained | Retention rate');
    console.log('------------ ---------- ---------- ----------------');
    for (const row of rows) {
        const eligible = parseInt(row.eligible, 10);
        const retained = parseInt(row.retained, 10);
        const rate = eligible > 0 ? ((retained / eligible) * 100).toFixed(1) : '0.0';
        console.log(`${row.cohort.padEnd(12)} ${String(eligible).padEnd(10)} ${String(retained).padEnd(10)} ${rate.padStart(14)}%`);
    }
}

async function main() {
    console.log('\n=== Retention report — control vs. treatment onboarding (Phase 1) ===');

    printTable('7-day retention', await retentionByWindow(7));
    printTable('30-day retention', await retentionByWindow(30));

    console.log('\nSmall cohorts make these rates unreliable -- treat as directional until both sides have 30+ eligible users.\n');
}

main()
    .catch(err => {
        console.error('Error:', err.message);
        process.exitCode = 1;
    })
    .finally(() => pool.end());
