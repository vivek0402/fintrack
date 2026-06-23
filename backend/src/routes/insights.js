const express = require('express');
const pool = require('../db/pool');
const auth = require('../middleware/auth');
const { aiComplete } = require('../utils/ai');
const { getCached, setCached } = require('../utils/aiCache');
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

// ─── FEATURE: Peer Benchmarking ──────────────────────────────────────
const INCOME_BRACKETS = {
    under_5L:   { label: 'Under ₹5L/year',    max: 41667 },
    five_to_10L:{ label: '₹5L–10L/year',      max: 83333 },
    ten_to_20L: { label: '₹10L–20L/year',     max: 166667 },
    above_20L:  { label: 'Above ₹20L/year',   max: Infinity },
};

const BENCHMARKS = {
    under_5L: {
        food_dining:               { min: 30, max: 35 },
        housing_rent:              { min: 25, max: 35 },
        transport:                 { min: 8,  max: 12 },
        entertainment_subscriptions: { min: 4, max: 7 },
        shopping_clothing:         { min: 5,  max: 8 },
        health_wellness:           { min: 3,  max: 5 },
        education:                 { min: 5,  max: 10 },
        savings_investments:       { min: 10, max: 15 },
    },
    five_to_10L: {
        food_dining:               { min: 25, max: 30 },
        housing_rent:              { min: 20, max: 30 },
        transport:                 { min: 7,  max: 10 },
        entertainment_subscriptions: { min: 5, max: 8 },
        shopping_clothing:         { min: 6,  max: 10 },
        health_wellness:           { min: 3,  max: 6 },
        education:                 { min: 4,  max: 8 },
        savings_investments:       { min: 15, max: 25 },
    },
    ten_to_20L: {
        food_dining:               { min: 20, max: 25 },
        housing_rent:              { min: 15, max: 25 },
        transport:                 { min: 6,  max: 9 },
        entertainment_subscriptions: { min: 5, max: 10 },
        shopping_clothing:         { min: 7,  max: 12 },
        health_wellness:           { min: 3,  max: 7 },
        education:                 { min: 3,  max: 7 },
        savings_investments:       { min: 20, max: 30 },
    },
    above_20L: {
        food_dining:               { min: 15, max: 20 },
        housing_rent:              { min: 15, max: 20 },
        transport:                 { min: 5,  max: 8 },
        entertainment_subscriptions: { min: 6, max: 12 },
        shopping_clothing:         { min: 8,  max: 15 },
        health_wellness:           { min: 4,  max: 8 },
        education:                 { min: 3,  max: 6 },
        savings_investments:       { min: 25, max: 35 },
    },
};

const GROUP_LABELS = {
    food_dining: 'Food & Dining',
    housing_rent: 'Housing & Rent',
    transport: 'Transport',
    entertainment_subscriptions: 'Entertainment & Subscriptions',
    shopping_clothing: 'Shopping & Clothing',
    health_wellness: 'Health & Wellness',
    education: 'Education',
    savings_investments: 'Savings & Investments',
};

// Approximate keyword mapping from category names to benchmark groups
const GROUP_KEYWORDS = {
    food_dining: ['food', 'restaurant', 'dining', 'grocery', 'groceries', 'cafe', 'swiggy', 'zomato'],
    housing_rent: ['rent', 'housing', 'maintenance', 'utilities', 'electricity', 'water', 'gas', 'broadband', 'wifi'],
    transport: ['transport', 'fuel', 'petrol', 'diesel', 'uber', 'ola', 'cab', 'commute', 'parking', 'metro', 'bus', 'train'],
    entertainment_subscriptions: ['entertainment', 'subscription', 'streaming', 'movie', 'ott', 'netflix', 'spotify', 'prime'],
    shopping_clothing: ['shopping', 'clothing', 'apparel', 'fashion', 'accessories'],
    health_wellness: ['health', 'medical', 'wellness', 'fitness', 'gym', 'pharmacy', 'doctor', 'personal care', 'insurance'],
    education: ['education', 'school', 'college', 'tuition', 'course', 'books', 'learning'],
    savings_investments: ['investment', 'savings', 'sip', 'mutual fund', 'stocks', 'gold'],
};

function mapCategoryToGroup(categoryName) {
    const name = (categoryName || '').toLowerCase();
    for (const [group, keywords] of Object.entries(GROUP_KEYWORDS)) {
        if (keywords.some(kw => name.includes(kw))) return group;
    }
    return null;
}

function getIncomeBracket(monthlyIncome) {
    if (monthlyIncome < INCOME_BRACKETS.under_5L.max) return 'under_5L';
    if (monthlyIncome < INCOME_BRACKETS.five_to_10L.max) return 'five_to_10L';
    if (monthlyIncome < INCOME_BRACKETS.ten_to_20L.max) return 'ten_to_20L';
    return 'above_20L';
}

router.get('/peer-benchmarks', async (req, res) => {
    try {
        const userId = req.user.id;

        // Average monthly income, last 3 months
        const incomeRes = await pool.query(
            `SELECT COALESCE(SUM(amount), 0) AS total
             FROM transactions
             WHERE user_id=$1 AND type='income' AND date >= (CURRENT_DATE - INTERVAL '3 months')`,
            [userId]
        );
        const avgMonthlyIncome = fmt(parseFloat(incomeRes.rows[0].total) / 3);
        const incomeBracket = getIncomeBracket(avgMonthlyIncome);

        // Last full calendar month range
        const now = new Date();
        const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const lastMonthStart = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}-01`;
        const thisMonthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

        const [expenseRes, monthIncomeRes] = await Promise.all([
            pool.query(
                `SELECT COALESCE(c.name, 'Uncategorized') AS category_name, COALESCE(SUM(t.amount), 0) AS total
                 FROM transactions t LEFT JOIN categories c ON t.category_id = c.id
                 WHERE t.user_id=$1 AND t.type='expense' AND t.date >= $2 AND t.date < $3
                 GROUP BY category_name`,
                [userId, lastMonthStart, thisMonthStart]
            ),
            pool.query(
                `SELECT COALESCE(SUM(amount), 0) AS total
                 FROM transactions
                 WHERE user_id=$1 AND type='income' AND date >= $2 AND date < $3`,
                [userId, lastMonthStart, thisMonthStart]
            ),
        ]);

        const totalIncomeThatMonth = parseFloat(monthIncomeRes.rows[0].total) || 0;

        // Sum category spend into benchmark groups
        const groupTotals = {};
        for (const key of Object.keys(GROUP_LABELS)) groupTotals[key] = 0;
        let totalExpense = 0;
        for (const row of expenseRes.rows) {
            const amount = parseFloat(row.total) || 0;
            totalExpense += amount;
            const group = mapCategoryToGroup(row.category_name);
            if (group) groupTotals[group] += amount;
        }

        const benchmarkBands = BENCHMARKS[incomeBracket];
        const benchmarkGroups = Object.keys(GROUP_LABELS).map(key => {
            const band = benchmarkBands[key];
            const userPct = totalIncomeThatMonth > 0 ? fmt((groupTotals[key] / totalIncomeThatMonth) * 100) : 0;
            const midpoint = (band.min + band.max) / 2;
            let status;
            if (userPct < band.min) status = 'below_benchmark';
            else if (userPct > band.max) status = 'above_benchmark';
            else status = 'within_benchmark';

            return {
                group: key,
                label: GROUP_LABELS[key],
                user_pct: userPct,
                benchmark_min: band.min,
                benchmark_max: band.max,
                status,
                deviation_pct: fmt(userPct - midpoint),
            };
        });

        // Savings rate comparison
        const savingsRatePct = totalIncomeThatMonth > 0
            ? fmt(((totalIncomeThatMonth - totalExpense) / totalIncomeThatMonth) * 100)
            : 0;
        const savingsBand = benchmarkBands.savings_investments;
        let savingsStatus;
        if (savingsRatePct < savingsBand.min) savingsStatus = 'below_benchmark';
        else if (savingsRatePct > savingsBand.max) savingsStatus = 'above_benchmark';
        else savingsStatus = 'within_benchmark';

        const savingsRateComparison = {
            user_pct: savingsRatePct,
            benchmark_min: savingsBand.min,
            benchmark_max: savingsBand.max,
            status: savingsStatus,
        };

        // Summary: strongest area (most below-benchmark spending) and biggest overspend (most above-benchmark)
        // Savings is excluded here — being "below benchmark" for savings is bad, not strong, and is
        // already covered by savingsRateComparison.
        let strongest = null, biggestOverspend = null;
        for (const g of benchmarkGroups) {
            if (g.group === 'savings_investments') continue;
            if (g.status === 'below_benchmark' && (!strongest || g.deviation_pct < strongest.deviation_pct)) {
                strongest = g;
            }
            if (g.status === 'above_benchmark' && (!biggestOverspend || g.deviation_pct > biggestOverspend.deviation_pct)) {
                biggestOverspend = g;
            }
        }

        let summary;
        if (!strongest && !biggestOverspend) {
            summary = 'Your spending across all categories is well within typical ranges for your income bracket.';
        } else {
            const parts = [];
            if (strongest) parts.push(`your strongest area is ${strongest.label} (${strongest.user_pct}% vs ${strongest.benchmark_min}-${strongest.benchmark_max}% benchmark)`);
            if (biggestOverspend) parts.push(`your biggest overspend is ${biggestOverspend.label} (${biggestOverspend.user_pct}% vs ${biggestOverspend.benchmark_min}-${biggestOverspend.benchmark_max}% benchmark)`);
            summary = `Compared to peers in your income bracket, ${parts.join(', and ')}.`;
        }

        res.json({
            income_bracket: incomeBracket,
            monthly_income: avgMonthlyIncome,
            benchmark_groups: benchmarkGroups,
            savings_rate_comparison: savingsRateComparison,
            summary,
        });
    } catch (err) {
        console.error('[Insights] peer-benchmarks error:', err);
        res.status(500).json({ error: 'Failed to compute peer benchmarks.' });
    }
});

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
         WHERE user_id=$1 AND type='expense' AND date >= (CURRENT_DATE - INTERVAL '3 months')`,
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

async function detectRegretConcentration(userId) {
    const { rows } = await pool.query(
        `SELECT COALESCE(c.name, 'Uncategorized') AS category_name, COUNT(*) AS cnt
         FROM transactions t LEFT JOIN categories c ON t.category_id = c.id
         WHERE t.user_id=$1 AND t.is_regretted=true AND t.date >= (CURRENT_DATE - INTERVAL '3 months')
         GROUP BY category_name ORDER BY cnt DESC`,
        [userId]
    );

    const total = rows.reduce((sum, r) => sum + parseInt(r.cnt), 0);
    let topCategory = null, topPct = 0;
    if (total > 0) {
        topCategory = rows[0].category_name;
        topPct = fmt((parseInt(rows[0].cnt) / total) * 100);
    }
    const detected = total > 0 && topPct > 40;

    return {
        pattern_name: 'category_regret_concentration',
        detected,
        supporting_data: { total_regretted: total, top_category: topCategory, top_category_pct: topPct },
        description: detected
            ? `Most of your regretted purchases are concentrated in ${topCategory} — this is a clear signal of where impulse spending is hurting you most.`
            : 'Your regretted purchases are spread fairly evenly across categories.',
    };
}

async function detectIdleSavingsDespiteDebt(userId) {
    const [{ rows: cardRows }, bankBalance] = await Promise.all([
        pool.query(
            `SELECT COALESCE(SUM(outstanding_balance), 0) AS total FROM credit_cards WHERE user_id=$1`,
            [userId]
        ),
        getBankBalance(userId),
    ]);

    const outstanding = parseFloat(cardRows[0].total) || 0;
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
            detectRegretConcentration(userId),
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
