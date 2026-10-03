const express = require('express');
const pool = require('../db/pool');
const auth = require('../middleware/auth');
const { aiComplete } = require('../utils/ai');
const { getCached, setCached } = require('../utils/aiCache');
const { fetchTotalCreditCardOutstanding } = require('../utils/creditCardBalance');
const { nonSpendingExclusionSQL } = require('../utils/savingsRate');
const router = express.Router();

router.use(auth);

const fmt = (n) => parseFloat((Number(n) || 0).toFixed(2));

const BANK_BALANCE_SQL = `SELECT COALESCE(SUM(
    COALESCE(a.starting_balance, 0)
    + COALESCE((SELECT SUM(t.amount) FROM transactions t WHERE t.account_id = a.id AND t.type = 'income' AND t.date >= COALESCE(a.balance_as_of, '1970-01-01')), 0)
    - COALESCE((SELECT SUM(t.amount) FROM transactions t WHERE t.account_id = a.id AND t.type = 'expense' AND t.date >= COALESCE(a.balance_as_of, '1970-01-01')), 0)
 ), 0) AS total
 FROM bank_accounts a WHERE a.user_id = $1`;

async function getBankBalance(userId) {
    const res = await pool.query(BANK_BALANCE_SQL, [userId]);
    return fmt(res.rows[0].total);
}

// ─── FEATURE: Behavioral Finance Patterns ────────────────────────────
const SUBSCRIPTION_KEYWORDS = [
    'netflix', 'spotify', 'amazon prime', 'prime video', 'hotstar', 'disney',
    'youtube premium', 'youtube music', 'linkedin', 'apple music', 'audible',
    'jiosaavn', 'gaana', 'sonyliv', 'zee5', 'crunchyroll', 'icloud', 'google one',
];

async function detectBudgetAnchoring(userId) {
    // Categories with at least one budget in the last 3 months
    const { rows: budgetRows } = await pool.query(
        `SELECT b.category_id, COALESCE(c.name, 'Uncategorized') AS category_name, b.amount, b.month, b.year
         FROM budgets b LEFT JOIN categories c ON b.category_id = c.id
         WHERE b.user_id=$1
           AND make_date(b.year, b.month, 1) >= date_trunc('month', CURRENT_DATE - INTERVAL '3 months')
           AND make_date(b.year, b.month, 1) <= date_trunc('month', CURRENT_DATE)`,
        [userId]
    );

    // One GROUP BY query for all (category, month) spend totals instead of a
    // per-budget-row SUM query in the loop below.
    const { rows: spendRows } = await pool.query(
        `SELECT category_id, EXTRACT(YEAR FROM date)::int AS year, EXTRACT(MONTH FROM date)::int AS month,
                COALESCE(SUM(amount), 0) AS total
         FROM transactions
         WHERE user_id=$1 AND type='expense'
           AND date >= date_trunc('month', CURRENT_DATE - INTERVAL '3 months')
           AND date < date_trunc('month', CURRENT_DATE) + INTERVAL '1 month'
         GROUP BY category_id, year, month`,
        [userId]
    );
    const spendByKey = new Map(spendRows.map(r => [`${r.category_id}-${r.year}-${r.month}`, parseFloat(r.total) || 0]));

    const perCategory = {};
    for (const b of budgetRows) {
        const spent = spendByKey.get(`${b.category_id}-${b.year}-${b.month}`) || 0;
        const pct = parseFloat(b.amount) > 0 ? spent / parseFloat(b.amount) : 0;
        const nearLimit = pct >= 0.85 && pct <= 1.0;

        if (!perCategory[b.category_id]) {
            perCategory[b.category_id] = { category: b.category_name, near_limit_months: 0, total_months: 0 };
        }
        perCategory[b.category_id].total_months += 1;
        if (nearLimit) perCategory[b.category_id].near_limit_months += 1;
    }

    const candidates = Object.values(perCategory).filter(c => c.near_limit_months >= 2);
    const detected = candidates.length >= 2;

    return {
        pattern_name: 'budget_anchoring',
        detected,
        supporting_data: { categories: Object.values(perCategory) },
        description: 'You may be treating your budgets as spending targets rather than limits — consistently spending close to (but not over) your budget in multiple categories.',
    };
}

async function detectPresentBias(userId) {
    const { rows } = await pool.query(
        `SELECT date, amount FROM transactions
         WHERE user_id=$1 AND type='expense' AND date >= (CURRENT_DATE - INTERVAL '3 months')
         AND ${nonSpendingExclusionSQL('transactions')}`,
        [userId]
    );

    let firstHalfTotal = 0, firstHalfDays = 0, secondHalfTotal = 0, secondHalfDays = 0;
    const monthsSeen = {};
    for (const row of rows) {
        const d = new Date(row.date);
        const monthKey = `${d.getFullYear()}-${d.getMonth()}`;
        const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
        if (!monthsSeen[monthKey]) monthsSeen[monthKey] = daysInMonth;

        const day = d.getDate();
        if (day <= 15) firstHalfTotal += parseFloat(row.amount);
        else secondHalfTotal += parseFloat(row.amount);
    }
    for (const daysInMonth of Object.values(monthsSeen)) {
        firstHalfDays += 15;
        secondHalfDays += (daysInMonth - 15);
    }

    const firstHalfAvg = firstHalfDays > 0 ? firstHalfTotal / firstHalfDays : 0;
    const secondHalfAvg = secondHalfDays > 0 ? secondHalfTotal / secondHalfDays : 0;
    const detected = secondHalfAvg > 0 ? firstHalfAvg > secondHalfAvg * 1.3 : firstHalfAvg > 0 && secondHalfAvg === 0;

    return {
        pattern_name: 'present_bias',
        detected,
        supporting_data: {
            first_half_avg_daily: fmt(firstHalfAvg),
            second_half_avg_daily: fmt(secondHalfAvg),
        },
        description: 'You spend more in the first half of the month than the second half — when the next payday feels far away, spending feels less risky.',
    };
}

async function detectSubscriptionBloat(userId) {
    const keywordConditions = SUBSCRIPTION_KEYWORDS.map((_, i) => `t.description ILIKE $${i + 2}`).join(' OR ');
    const { rows } = await pool.query(
        `SELECT t.description, t.amount FROM transactions t
         LEFT JOIN categories c ON t.category_id = c.id
         WHERE t.user_id=$1 AND t.type='expense' AND t.date >= (CURRENT_DATE - INTERVAL '3 months')
           AND (
             (${keywordConditions})
             OR (
               (c.name ILIKE '%subscription%' OR c.name ILIKE '%entertainment%')
               AND t.amount BETWEEN 100 AND 2000
             )
           )`,
        [userId, ...SUBSCRIPTION_KEYWORDS.map(kw => `%${kw}%`)]
    );

    // Group by description + amount, count recurring (appearing 2+ times)
    const groups = {};
    for (const row of rows) {
        const key = `${row.description.trim().toLowerCase()}|${row.amount}`;
        groups[key] = (groups[key] || 0) + 1;
    }
    const recurring = Object.entries(groups).filter(([, count]) => count >= 2);
    const detected = recurring.length > 5;

    return {
        pattern_name: 'subscription_bloat',
        detected,
        supporting_data: { recurring_subscription_count: recurring.length, total_matching_transactions: rows.length },
        description: 'Multiple small subscriptions add up — individually they feel negligible, but together they can be a significant monthly drain.',
    };
}

async function detectIdleSavingsDespiteDebt(userId) {
    const [outstanding, bankBalance] = await Promise.all([
        fetchTotalCreditCardOutstanding(pool, userId),
        getBankBalance(userId),
    ]);

    const detected = outstanding > 0 && bankBalance > outstanding * 2;

    return {
        pattern_name: 'idle_savings_despite_debt',
        detected,
        supporting_data: { credit_card_outstanding: outstanding, bank_balance: bankBalance },
        description: 'You\'re holding cash in savings/checking while carrying a credit card balance — the interest you pay on the card almost certainly outweighs anything that cash is earning.',
    };
}

router.get('/behavioral-patterns', async (req, res) => {
    try {
        const userId = req.user.id;

        if (!req.query.force) {
            const cached = await getCached(pool, userId, 'behavioral_patterns');
            if (cached) return res.json({ ...cached, from_cache: true });
        }

        const patterns = await Promise.all([
            detectBudgetAnchoring(userId),
            detectPresentBias(userId),
            detectSubscriptionBloat(userId),
            detectIdleSavingsDespiteDebt(userId),
        ]);

        const detectedPatterns = patterns.filter(p => p.detected);

        let aiInsight;
        if (detectedPatterns.length === 0) {
            aiInsight = "We didn't detect any concerning behavioral patterns this month — your financial habits look healthy. Keep it up!";
        } else {
            const prompt = `You are a friendly financial behavior coach for an Indian personal finance app.
Below are behavioral patterns detected in a user's financial data. Each pattern includes a description and supporting data.

${detectedPatterns.map(p => `- ${p.pattern_name}: ${p.description}\n  Supporting data: ${JSON.stringify(p.supporting_data)}`).join('\n')}

Identify the SINGLE most impactful pattern from the list above. Explain it to the user in simple, human terms — no financial jargon.
Then give ONE specific, actionable suggestion they can take THIS WEEK to address it.
Keep the response to 3-4 short sentences. No markdown, no headings.`;

            try {
                aiInsight = (await aiComplete('behavioral-insight', [{ role: 'user', content: prompt }])).trim();
            } catch (err) {
                console.error('[Insights] behavioral-insight AI failed:', err.message);
                const top = detectedPatterns[0];
                aiInsight = `Here's something worth noticing: ${top.description} Try keeping an eye on this over the next week.`;
            }
        }

        const result = {
            patterns,
            ai_insight: aiInsight,
            detected_count: detectedPatterns.length,
        };
        await setCached(pool, userId, 'behavioral_patterns', result);
        res.json({ ...result, from_cache: false });
    } catch (err) {
        console.error('[Insights] behavioral-patterns error:', err);
        res.status(500).json({ error: 'Failed to analyze behavioral patterns.' });
    }
});

module.exports = router;
