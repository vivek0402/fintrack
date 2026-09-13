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
         WHERE c.id = $2 AND c.user_id = $1
         GROUP BY c.name`,
        [userId, category_id, exclude_id || null]
    );
    if (!rows.length || rows[0].n < 5) return null;
    const median = parseFloat(rows[0].median);
    if (amount < 3 * median) return null;
    return { kind: 'anomaly', level: 'warn', text: `About ${Math.round(amount / median)}× your typical ${rows[0].name} entry (${inr(median)}).` };
}

function localDate(dateStr) {
    return new Date(`${String(dateStr).slice(0, 10)}T00:00:00`);
}

function ymd(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function detectCard(pool, userId, { type, amount, payment_method, credit_card_id, date }) {
    if (type !== 'expense' || payment_method !== 'Credit Card' || !credit_card_id) return null;
    const card = await fetchCreditCardWithBalance(pool, userId, credit_card_id);
    if (!card) return null;
    const limit = parseFloat(card.credit_limit || 0);
    if (limit <= 0) return null;
    const outstanding = parseFloat(card.current_outstanding_balance || 0);
    const headroom = limit - outstanding - amount;
    const label = `${card.bank_name} ${card.card_name}`;
    if (headroom < 0) {
        return { kind: 'card_over_limit', level: 'warn', text: `This takes ${label} ${inr(-headroom)} over its ${inr(limit)} limit.` };
    }
    let cycle = '';
    if (card.billing_date) {
        const today = localDate(date);
        let close = new Date(today.getFullYear(), today.getMonth(), card.billing_date);
        if (close < today) close = new Date(today.getFullYear(), today.getMonth() + 1, card.billing_date);
        const days = Math.round((close - today) / DAY_MS);
        cycle = ` · statement closes ${days === 0 ? 'today' : `in ${days} day${days === 1 ? '' : 's'}`}`;
    }
    return { kind: 'card_headroom', level: 'info', text: `${inr(headroom)} left on ${label} after this${cycle}.` };
}

async function detectCategoryPace(pool, userId, { type, amount, category_id, date, exclude_id }) {
    if (type !== 'expense' || !category_id) return null;
    const month = String(date).slice(0, 7);
    const [year, monthNum] = month.split('-').map(Number);
    const { rows } = await pool.query(
        `SELECT c.name, b.amount AS budget,
                (SELECT COALESCE(SUM(t.amount), 0) FROM transactions t
                  WHERE t.user_id = $1 AND t.category_id = c.id AND t.type = 'expense'
                    AND to_char(t.date, 'YYYY-MM') = $4
                    AND ($5::uuid IS NULL OR t.id <> $5)
                    AND ${nonSpendingExclusionSQL('t')}) AS spent
         FROM categories c
         LEFT JOIN budgets b ON b.category_id = c.id AND b.user_id = $1 AND b.month = $2 AND b.year = $3
         WHERE c.id = $6 AND c.user_id = $1`,
        [userId, monthNum, year, month, exclude_id || null, category_id]
    );
    if (!rows.length) return null;
    const cat = rows[0];
    const after = parseFloat(cat.spent || 0) + amount;
    if (cat.budget) {
        const budget = parseFloat(cat.budget);
        if (after > budget) {
            return { kind: 'budget_over', level: 'warn', text: `Puts ${cat.name} ${inr(after - budget)} over its ${inr(budget)} budget this month.` };
        }
        return { kind: 'budget_pace', level: 'info', text: `${inr(after)} of ${inr(budget)} ${cat.name} budget after this (${Math.round((after / budget) * 100)}%).` };
    }
    const d = localDate(date);
    const day = d.getDate();
    const lastMonthStart = new Date(d.getFullYear(), d.getMonth() - 1, 1);
    const lastMonthLen = new Date(d.getFullYear(), d.getMonth(), 0).getDate();
    const lastMonthSameDay = new Date(d.getFullYear(), d.getMonth() - 1, Math.min(day, lastMonthLen));
    const { rows: lastRows } = await pool.query(
        `SELECT COALESCE(SUM(amount), 0) AS total FROM transactions
         WHERE user_id = $1 AND category_id = $2 AND type = 'expense' AND date BETWEEN $3 AND $4
           AND ${nonSpendingExclusionSQL('transactions')}`,
        [userId, category_id, ymd(lastMonthStart), ymd(lastMonthSameDay)]
    );
    const lastTotal = parseFloat(lastRows[0]?.total || 0);
    if (lastTotal < 500) return null;
    return { kind: 'month_pace', level: 'info', text: `${cat.name}: ${inr(after)} by the ${ordinal(day)} vs ${inr(lastTotal)} at this point last month.` };
}

async function detectAccountProjection(pool, userId, { type, amount, payment_method, account_id, date, exclude_id }) {
    if (type !== 'expense' || !account_id || payment_method === 'Credit Card') return null;
    const { rows } = await pool.query(
        `SELECT a.name,
                COALESCE(a.starting_balance, 0)
                  + COALESCE(SUM(CASE WHEN t.type = 'income'  THEN t.amount ELSE 0 END), 0)
                  - COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount ELSE 0 END), 0) AS current_balance
         FROM bank_accounts a
         LEFT JOIN transactions t ON t.account_id = a.id AND t.user_id = a.user_id
           AND t.date >= COALESCE(a.balance_as_of, '1970-01-01')
           AND ($3::uuid IS NULL OR t.id <> $3)
         WHERE a.user_id = $1 AND a.id = $2
         GROUP BY a.id`,
        [userId, account_id, exclude_id || null]
    );
    if (!rows.length) return null;
    const after = parseFloat(rows[0].current_balance || 0) - amount;
    const { rows: dueRows } = await pool.query(
        `SELECT COUNT(*)::int AS n, COALESCE(SUM(amount), 0) AS total FROM recurring_transactions
         WHERE user_id = $1 AND is_active = TRUE AND type = 'expense'
           AND next_due_date BETWEEN $2::date AND $2::date + 30`,
        [userId, date]
    );
    const n = dueRows[0]?.n || 0;
    const bills = n > 0 ? ` · ${n} bill${n === 1 ? '' : 's'} (${inr(parseFloat(dueRows[0].total))}) due in the next 30 days` : '';
    if (after < 0) return { kind: 'account_negative', level: 'warn', text: `${rows[0].name} would go to ${inr(after)} after this${bills}.` };
    return { kind: 'account_projection', level: 'info', text: `${rows[0].name} after this: ${inr(after)}${bills}.` };
}

module.exports = {
    PRIORITY, inr, ordinal, istTimeLabel,
    detectDuplicate, detectAnomaly, detectCard, detectCategoryPace, detectAccountProjection,
};
