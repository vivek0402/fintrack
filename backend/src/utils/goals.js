const pool = require('../db/pool');
const { notifyOnce } = require('./fcm');

// Atomic read-modify-write in SQL to prevent lost-update race conditions.
// `client` may be the shared pool or a transaction client -- callers linking
// a goal contribution to a transaction (transactions.js) run this inside
// their own BEGIN/COMMIT alongside the transaction insert/update/delete, so
// both succeed or both roll back together.
async function applyGoalContribution(client, userId, goalId, delta) {
    const result = await client.query(
        `UPDATE savings_goals
         SET saved_amount = GREATEST(0, saved_amount + $1), updated_at = NOW()
         WHERE id = $2 AND user_id = $3 RETURNING *`,
        [delta, goalId, userId]
    );
    return result.rows[0] || null;
}

// Fire-and-forget milestone checks, split out from applyGoalContribution so
// callers can defer firing them until after their own transaction commits --
// the total-savings check queries across all goals via the shared pool, so
// running it before commit could read stale (pre-update) data.
function fireGoalMilestoneChecks(userId, goal, delta) {
    if (!goal) return;

    // Per-goal 50%/100% milestone
    setImmediate(async () => {
        try {
            const pct = goal.target_amount > 0
                ? Math.round((goal.saved_amount / goal.target_amount) * 100)
                : 0;
            if (pct < 50) return;

            const milestone = pct >= 100 ? 100 : 50;
            const alertKey = `goal_milestone:${goal.id}:${milestone}`;
            await notifyOnce(userId, alertKey, {
                title: milestone === 100 ? 'Goal Reached! 🎯' : 'Halfway There! 🏃',
                body: milestone === 100
                    ? `You've fully funded "${goal.name}"! That's incredible — you actually did it! 🎉`
                    : `You're halfway to your "${goal.name}" goal! You're doing so well — keep it up! 💪`,
                data: { type: 'goal_milestone', goal_id: String(goal.id) },
            });
        } catch { /* silent */ }
    });

    // Total savings milestone (₹10K, ₹25K, ₹50K, ₹1L, ₹2.5L, ₹5L, ₹10L)
    setImmediate(async () => {
        try {
            const { rows } = await pool.query(
                `SELECT COALESCE(SUM(saved_amount),0) AS total FROM savings_goals WHERE user_id=$1`,
                [userId]
            );
            const total = parseFloat(rows[0]?.total || 0);
            const milestones = [10000, 25000, 50000, 100000, 250000, 500000, 1000000];
            const crossed = milestones.find(m => total >= m && (total - delta) < m);
            if (!crossed) return;

            const alertKey = `savings_total:${crossed}`;
            const label = crossed >= 100000
                ? `₹${(crossed / 100000).toLocaleString('en-IN')}L`
                : `₹${crossed.toLocaleString('en-IN')}`;
            await notifyOnce(userId, alertKey, {
                title: 'Savings Milestone! 🎉',
                body: `Your total savings just crossed ${label}! That's a massive achievement — you should be so proud of yourself! 🌟`,
                data: { type: 'savings_milestone', milestone: String(crossed) },
            });
        } catch { }
    });
}

module.exports = { applyGoalContribution, fireGoalMilestoneChecks };
