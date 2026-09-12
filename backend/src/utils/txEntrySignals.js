// Deterministic "as you type" signals for the Add Transaction modal. Each
// detector takes (pool, userId, input) and resolves to a signal or null;
// collectEntrySignals (added in a later task) runs them all and orders by
// PRIORITY.
const { nonSpendingExclusionSQL } = require('./savingsRate');
const { fetchCreditCardWithBalance } = require('./creditCardBalance');

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 86400000;

const PRIORITY = [
    'duplicate', 'anomaly', 'card_over_limit', 'account_negative', 'budget_over',
    'card_headroom', 'budget_pace', 'account_projection', 'goal_impact', 'month_pace',
    'split_hint', 'late_night',
];

function inr(n) {
    const rounded = Math.round(Math.abs(n));
    return `${n < 0 ? '-' : ''}₹${rounded.toLocaleString('en-IN')}`;
}

function ordinal(d) {
    const v = d % 100;
    if (v >= 11 && v <= 13) return `${d}th`;
    return `${d}${['th', 'st', 'nd', 'rd'][d % 10] || 'th'}`;
}

function istTimeLabel(ts) {
    const d = new Date(new Date(ts).getTime() + IST_OFFSET_MS);
    let h = d.getUTCHours();
    const m = d.getUTCMinutes();
    const ampm = h >= 12 ? 'pm' : 'am';
    h = h % 12 || 12;
    return `${h}:${String(m).padStart(2, '0')} ${ampm}`;
}

async function detectDuplicate(pool, userId, { amount, description, date, exclude_id }) {
    const desc = (description || '').trim();
    if (!desc) return null;
    const { rows } = await pool.query(
        `SELECT created_at FROM transactions
         WHERE user_id = $1 AND amount = $2 AND LOWER(description) = LOWER($3) AND date = $4
           AND ($5::uuid IS NULL OR id <> $5)
         ORDER BY created_at DESC LIMIT 1`,
        [userId, amount, desc, date, exclude_id || null]
    );
    if (!rows.length) return null;
    return {
        kind: 'duplicate', level: 'warn',
        text: `Looks like you already added ${inr(amount)} for "${desc}" on this date (${istTimeLabel(rows[0].created_at)}).`,
    };
}

async function detectAnomaly(pool, userId, { type, amount, description, category_id, exclude_id }) {
    if (type !== 'expense') return null;
    const desc = (description || '').trim();
    if (desc) {
        const { rows } = await pool.query(
            `SELECT COUNT(*)::int AS n, percentile_cont(0.5) WITHIN GROUP (ORDER BY amount) AS median
             FROM transactions
             WHERE user_id = $1 AND type = 'expense' AND LOWER(description) = LOWER($2)
               AND ($3::uuid IS NULL OR id <> $3)`,
            [userId, desc, exclude_id || null]
        );
        const n = rows[0]?.n || 0;
        const median = parseFloat(rows[0]?.median);
        if (n >= 3) {
            if (amount >= 3 * median) {
                return { kind: 'anomaly', level: 'warn', text: `Higher than your usual ${inr(median)} for "${desc}" — double-check the amount?` };
            }
            return null;
        }
    }
    if (!category_id) return null;
    const { rows } = await pool.query(
        `SELECT c.name, COUNT(t.id)::int AS n, percentile_cont(0.5) WITHIN GROUP (ORDER BY t.amount) AS median
         FROM categories c
         LEFT JOIN transactions t ON t.category_id = c.id AND t.user_id = $1 AND t.type = 'expense'
           AND ($3::uuid IS NULL OR t.id <> $3)
         WHERE c.id = $2
         GROUP BY c.name`,
        [userId, category_id, exclude_id || null]
    );
    if (!rows.length || rows[0].n < 5) return null;
    const median = parseFloat(rows[0].median);
    if (amount < 3 * median) return null;
    return { kind: 'anomaly', level: 'warn', text: `About ${Math.round(amount / median)}× your typical ${rows[0].name} entry (${inr(median)}).` };
}

module.exports = { PRIORITY, inr, ordinal, istTimeLabel, detectDuplicate, detectAnomaly };
