const express = require('express');
const pool = require('../db/pool');
const auth = require('../middleware/auth');
const { monthsRemainingForLoan } = require('../utils/amortization');
const { getCurrentFY, fyToDateRange, SECTION_80C_LIMIT, computeAdvanceTaxEstimate } = require('./tax');
const { getCached } = require('../utils/aiCache');
const router = express.Router();

router.use(auth);

const fmt = (n) => parseFloat((Number(n) || 0).toFixed(2));
const inr = (n) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;

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

async function getAvgMonthlyExpenses(userId) {
    const res = await pool.query(
        `SELECT COALESCE(SUM(amount), 0) / 3.0 AS avg FROM transactions
         WHERE user_id = $1 AND type = 'expense' AND date >= (CURRENT_DATE - INTERVAL '3 months')`,
        [userId]
    );
    return fmt(res.rows[0].avg);
}

async function getAvgMonthlyIncome(userId) {
    const res = await pool.query(
        `SELECT COALESCE(SUM(amount), 0) / 3.0 AS avg FROM transactions
         WHERE user_id = $1 AND type = 'income' AND date >= (CURRENT_DATE - INTERVAL '3 months')`,
        [userId]
    );
    return fmt(res.rows[0].avg);
}

// ─── Detectors ──────────────────────────────────────────────────────────────

async function detectIdleCash(userId) {
    const [bankBalance, avgExpenses] = await Promise.all([getBankBalance(userId), getAvgMonthlyExpenses(userId)]);
    if (avgExpenses <= 0 || bankBalance <= avgExpenses * 4) return null;

    const idleAmount = fmt(bankBalance - avgExpenses * 3);
    if (idleAmount <= 0) return null;

    return {
        type: 'idle_cash',
        title: `${inr(idleAmount)} sitting idle in savings account`,
        description: `Your bank balance of ${inr(bankBalance)} is well beyond your 3-month expense buffer of ${inr(avgExpenses * 3)}. Moving the surplus to a liquid fund (~7% returns vs ~3.5% savings interest) could earn meaningfully more.`,
        amount_saved: fmt(idleAmount * 0.05),
        priority: idleAmount < 100000 ? 2 : 1,
        action_label: 'Explore liquid funds',
        action_route: '/investments',
        expires_at: null,
    };
}

async function detectCreditCardInterest(userId) {
    const res = await pool.query(
        `SELECT bank_name, card_name, outstanding_balance FROM credit_cards
         WHERE user_id = $1 AND outstanding_balance > 0 ORDER BY outstanding_balance DESC`,
        [userId]
    );
    if (res.rows.length === 0) return null;

    const top = res.rows[0];
    const totalOutstanding = fmt(res.rows.reduce((s, r) => s + parseFloat(r.outstanding_balance), 0));
    const amountSaved = fmt(totalOutstanding * 0.36);

    return {
        type: 'credit_card_interest',
        title: `Credit card debt costing you ${inr(amountSaved)}/year in interest`,
        description: `${top.card_name} (${top.bank_name}) and other cards carry a combined outstanding balance of ${inr(totalOutstanding)}. At ~36% APR, this is one of the most expensive debts you can carry — prioritize paying it off.`,
        amount_saved: amountSaved,
        priority: 1,
        action_label: 'View payoff plan',
        action_route: '/debt',
        expires_at: null,
    };
}

async function detectHighInterestLoan(userId) {
    const res = await pool.query(
        `SELECT * FROM loans WHERE user_id = $1 AND is_active = true AND interest_rate_pct > 12 ORDER BY interest_rate_pct DESC LIMIT 1`,
        [userId]
    );
    if (res.rows.length === 0) return null;

    const loan = res.rows[0];
    const rate = parseFloat(loan.interest_rate_pct);
    const outstanding = parseFloat(loan.outstanding_balance);
    const yearsRemaining = monthsRemainingForLoan(loan) / 12;
    const amountSaved = fmt(outstanding * (rate / 100) * yearsRemaining / 2);

    return {
        type: 'high_interest_loan',
        title: `${loan.name} carries a high ${rate}% interest rate`,
        description: `Your ${loan.name} (outstanding ${inr(outstanding)}) is charging ${rate}% interest. Prepaying this loan or refinancing to a lower rate could save roughly ${inr(amountSaved)} in interest over its remaining tenure.`,
        amount_saved: amountSaved,
        priority: rate > 18 ? 1 : 2,
        action_label: 'View prepayment impact',
        action_route: '/loans',
        expires_at: null,
    };
}

async function detectTax80cGap(userId) {
    const fy = getCurrentFY();
    const { end } = fyToDateRange(fy);

    const res = await pool.query(
        `SELECT COALESCE(SUM(amount), 0) AS total FROM tax_investments
         WHERE user_id = $1 AND financial_year = $2 AND deduction_section = '80C'`,
        [userId, fy]
    );
    const totalClaimed = fmt(res.rows[0].total);
    if (totalClaimed >= SECTION_80C_LIMIT) return null;

    const now = new Date();
    const fyEnd = new Date(end);
    const monthsRemaining = Math.max(0, (fyEnd.getFullYear() - now.getFullYear()) * 12 + (fyEnd.getMonth() - now.getMonth()));
    if (monthsRemaining < 2) return null;

    const gap = fmt(SECTION_80C_LIMIT - totalClaimed);

    const profileRes = await pool.query(
        `SELECT basic_salary_monthly, hra_component_monthly, special_allowance_monthly
         FROM tax_profiles WHERE user_id = $1 AND financial_year = $2`,
        [userId, fy]
    );
    let annualIncome = 0;
    if (profileRes.rows.length > 0) {
        const p = profileRes.rows[0];
        annualIncome = (parseFloat(p.basic_salary_monthly || 0) + parseFloat(p.hra_component_monthly || 0) + parseFloat(p.special_allowance_monthly || 0)) * 12;
    }
    let marginalRate = 5;
    if (annualIncome > 1000000) marginalRate = 30;
    else if (annualIncome > 500000) marginalRate = 20;

    return {
        type: 'tax_80c_gap',
        title: `${inr(gap)} of unused Section 80C deduction this year`,
        description: `You've claimed ${inr(totalClaimed)} of the ₹1,50,000 80C limit for FY ${fy}. Investing the remaining ${inr(gap)} (e.g. PPF, ELSS, EPF) before March 31 could lower your tax bill by an estimated ${inr(gap * marginalRate / 100)} at your ${marginalRate}% slab.`,
        amount_saved: fmt(gap * marginalRate / 100),
        priority: monthsRemaining < 3 ? 1 : 2,
        action_label: 'Add 80C investment',
        action_route: '/tax',
        expires_at: end,
    };
}

async function detectSpendingSpike(userId) {
    const res = await pool.query(
        `SELECT COALESCE(c.name, 'Uncategorized') AS category_name,
                DATE_TRUNC('month', t.date) AS month,
                COALESCE(SUM(t.amount), 0) AS total
         FROM transactions t LEFT JOIN categories c ON t.category_id = c.id
         WHERE t.user_id = $1 AND t.type = 'expense' AND t.date >= (CURRENT_DATE - INTERVAL '4 months')
         GROUP BY category_name, month
         ORDER BY category_name, month`,
        [userId]
    );

    const byCategory = {};
    for (const row of res.rows) {
        byCategory[row.category_name] = byCategory[row.category_name] || [];
        byCategory[row.category_name].push({ month: row.month, total: fmt(row.total) });
    }

    let biggest = null;
    for (const [category, months] of Object.entries(byCategory)) {
        const sorted = months.sort((a, b) => new Date(a.month) - new Date(b.month));
        if (sorted.length < 2) continue;
        const last = sorted[sorted.length - 1].total;
        const priorMonths = sorted.slice(0, -1);
        const avg = priorMonths.reduce((s, m) => s + m.total, 0) / priorMonths.length;
        if (avg <= 0) continue;
        const pctAbove = ((last - avg) / avg) * 100;
        if (pctAbove > 35 && (!biggest || pctAbove > biggest.pctAbove)) {
            biggest = { category, last, avg, pctAbove };
        }
    }
    if (!biggest) return null;

    const spikeAmount = fmt(biggest.last - biggest.avg);
    return {
        type: 'spending_spike',
        title: `${biggest.category} spend is ${fmt(biggest.pctAbove)}% above your 3-month average`,
        description: `Last month you spent ${inr(biggest.last)} on ${biggest.category}, vs a 3-month average of ${inr(biggest.avg)}. If this continues, it adds up to roughly ${inr(spikeAmount * 12)}/year extra.`,
        amount_saved: fmt(spikeAmount * 12),
        priority: 2,
        action_label: 'Review spending',
        action_route: '/transactions',
        expires_at: null,
    };
}

async function detectAllocationGap(userId) {
    const [bankBalance, invRes] = await Promise.all([
        getBankBalance(userId),
        pool.query(`SELECT type, COALESCE(SUM(units * current_nav_or_price), 0) AS total FROM investments WHERE user_id = $1 GROUP BY type`, [userId]),
    ]);

    const invTotals = {};
    for (const row of invRes.rows) invTotals[row.type] = parseFloat(row.total);

    const categories = {
        bank: bankBalance,
        mutual_fund: invTotals.mutual_fund || 0,
        stock: invTotals.stock || 0,
        fd: invTotals.fd || 0,
        ppf: invTotals.ppf || 0,
        nps: invTotals.nps || 0,
        gold: invTotals.gold || 0,
        crypto: invTotals.crypto || 0,
        other: invTotals.other || 0,
    };
    const total = Object.values(categories).reduce((s, v) => s + v, 0);
    if (total <= 0) return null;

    const RECOMMENDED_PCT = { bank: 10, mutual_fund: 30, stock: 30, fd: 8.33, ppf: 8.33, nps: 8.34, gold: 5, crypto: 0, other: 0 };
    const LABELS = { bank: 'Bank balance', mutual_fund: 'Mutual funds', stock: 'Stocks', fd: 'Fixed deposits', ppf: 'PPF', nps: 'NPS', gold: 'Gold', crypto: 'Crypto', other: 'Other' };

    let biggest = null;
    for (const [category, amount] of Object.entries(categories)) {
        const actualPct = fmt((amount / total) * 100);
        const deviation = fmt(actualPct - RECOMMENDED_PCT[category]);
        if (Math.abs(deviation) > 20 && (!biggest || Math.abs(deviation) > Math.abs(biggest.deviation))) {
            biggest = { category, actualPct, deviation, recommended: RECOMMENDED_PCT[category] };
        }
    }
    if (!biggest) return null;

    return {
        type: 'allocation_gap',
        title: `${LABELS[biggest.category]} allocation is ${biggest.actualPct}% vs ${biggest.recommended}% recommended`,
        description: `Your portfolio allocates ${biggest.actualPct}% to ${LABELS[biggest.category].toLowerCase()}, compared to a recommended ${biggest.recommended}%. Rebalancing can reduce concentration risk and improve long-term returns.`,
        amount_saved: null,
        priority: 3,
        action_label: 'View asset allocation',
        action_route: '/wealth-intelligence',
        expires_at: null,
    };
}

async function detectSipUnderinvesting(userId) {
    const [incomeRes, investedRes] = await Promise.all([
        pool.query(
            `SELECT COALESCE(SUM(amount), 0) AS total FROM transactions
             WHERE user_id = $1 AND type = 'income' AND date >= date_trunc('month', CURRENT_DATE)`,
            [userId]
        ),
        pool.query(
            `SELECT COALESCE(SUM(it.units * it.price_per_unit), 0) AS total
             FROM investment_transactions it
             WHERE it.user_id = $1 AND it.transaction_type = 'buy' AND it.transaction_date >= date_trunc('month', CURRENT_DATE)`,
            [userId]
        ),
    ]);

    const income = fmt(incomeRes.rows[0].total);
    const invested = fmt(investedRes.rows[0].total);
    if (income <= 0) return null;

    const ratioPct = fmt((invested / income) * 100);
    if (ratioPct >= 15) return null;

    const targetMonthly = income * 0.15;
    const monthlyRate = 0.12 / 12;
    const months = 120;
    const futureValue = (pmt) => pmt * ((Math.pow(1 + monthlyRate, months) - 1) / monthlyRate);
    const amountSaved = fmt(futureValue(targetMonthly) - futureValue(invested));

    return {
        type: 'sip_underinvesting',
        title: `You're only investing ${ratioPct}% of income — 15% is the recommended minimum`,
        description: `This month you invested ${inr(invested)} out of ${inr(income)} income (${ratioPct}%). Raising your SIP to 15% of income (${inr(targetMonthly)}/month) could grow your corpus by an estimated ${inr(amountSaved)} more over 10 years at 12% CAGR.`,
        amount_saved: amountSaved,
        priority: 2,
        action_label: 'Plan your SIP',
        action_route: '/fire',
        expires_at: null,
    };
}

async function detectEmergencyFundLow(userId) {
    const [bankBalance, avgExpenses] = await Promise.all([getBankBalance(userId), getAvgMonthlyExpenses(userId)]);
    if (avgExpenses <= 0 || bankBalance >= avgExpenses * 3) return null;

    return {
        type: 'emergency_fund_low',
        title: 'Emergency fund below 3 months of expenses',
        description: `Your bank balance of ${inr(bankBalance)} covers less than 3 months of your average monthly expenses (${inr(avgExpenses)}). Building a buffer of at least ${inr(avgExpenses * 3)} protects you from having to borrow during emergencies.`,
        amount_saved: null,
        priority: 1,
        action_label: 'Plan cash flow',
        action_route: '/cash-flow',
        expires_at: null,
    };
}

// ─── Detectors that surface signals from other AI features ──────────────────
// These read each feature's existing ai_cache entry (getCached, no new AI call)
// instead of recomputing anything -- they only fire once the user has actually
// generated that feature's data by visiting its page. Consolidation, not a new
// ranking layer: opportunities.js already does the ranking, this just gives
// these features a way into that feed instead of staying siloed.

async function detectForecastWarning(userId) {
    const cached = await getCached(pool, userId, 'forecast', 24 * 60 * 60 * 1000);
    if (!cached || cached.insufficientData || !cached.totalForecast) return null;

    const now = new Date();
    const budgetRes = await pool.query(
        `SELECT COALESCE(SUM(amount), 0) AS total FROM budgets WHERE user_id = $1 AND month = $2 AND year = $3`,
        [userId, now.getMonth() + 1, now.getFullYear()]
    );
    const totalBudget = fmt(budgetRes.rows[0].total);
    if (totalBudget <= 0) return null;

    const overPct = fmt(((cached.totalForecast - totalBudget) / totalBudget) * 100);
    if (overPct < 15) return null;

    return {
        type: 'forecast_budget_warning',
        title: `On track to overspend your budget by ${overPct}% this month`,
        description: `At your current pace (${inr(cached.avgDaily)}/day), you're forecasted to spend ${inr(cached.totalForecast)} this month — ${overPct}% above your ${inr(totalBudget)} budget.`,
        amount_saved: null,
        priority: overPct > 30 ? 1 : 2,
        action_label: 'View forecast',
        action_route: '/forecast',
        expires_at: new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString(),
    };
}

async function detectPersonalityInsight(userId) {
    const cached = await getCached(pool, userId, 'personality', 30 * 24 * 60 * 60 * 1000);
    if (!cached || !cached.personality_type) return null;

    return {
        type: 'personality_insight',
        title: `Your financial personality: ${cached.personality_type}${cached.personality_emoji ? ' ' + cached.personality_emoji : ''}`,
        description: cached.summary || 'View your full financial personality profile for tailored tips.',
        amount_saved: null,
        priority: 3,
        action_label: 'View personality profile',
        action_route: '/personality',
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    };
}

async function detectAdvanceTaxDue(userId) {
    // Reuses the canonical installment-schedule calculation from tax.js (also
    // used by GET /api/tax/advance-tax and agents.js's tax_planner persona)
    // instead of re-deriving liability/deadlines from the separate AI-generated
    // tax_estimate cache, which would just be a second, less precise estimate
    // of the same thing.
    const fy = getCurrentFY();
    let estimate;
    try {
        estimate = await computeAdvanceTaxEstimate(userId, fy);
    } catch {
        return null;
    }
    if (!estimate.is_applicable) return null;

    const now = new Date();
    const next = estimate.installment_schedule.find(i =>
        i.status === 'due' || i.status === 'overdue' ||
        (i.status === 'upcoming' && (new Date(i.due_date) - now) / (1000 * 60 * 60 * 24) <= 21)
    );
    if (!next) return null;

    const liability = fmt(Math.min(estimate.old_regime_tax, estimate.new_regime_tax));
    const dueDateLabel = new Date(next.due_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

    return {
        type: 'advance_tax_due',
        title: next.status === 'overdue'
            ? `Advance tax installment ${next.installment_number} is overdue`
            : `Advance tax installment due ${dueDateLabel}`,
        description: `Based on an estimated tax liability of ${inr(liability)} for FY ${fy}, your ${next.cumulative_pct_due}% cumulative installment (~${inr(next.installment_amount)}) ${next.status === 'overdue' ? 'was due' : 'is due'} on ${dueDateLabel}. Missing this can attract interest under Section 234C.`,
        amount_saved: null,
        priority: next.status === 'overdue' ? 1 : 2,
        action_label: 'View advance tax schedule',
        action_route: '/tax',
        expires_at: next.due_date,
    };
}

async function detectBehavioralPattern(userId) {
    const cached = await getCached(pool, userId, 'behavioral_patterns', 24 * 60 * 60 * 1000);
    if (!cached || !cached.detected_count) return null;

    const top = (cached.patterns || []).find(p => p.detected);
    if (!top) return null;

    return {
        type: 'behavioral_pattern',
        title: `Spending pattern detected: ${top.pattern_name.replace(/_/g, ' ')}`,
        description: cached.ai_insight || top.description,
        amount_saved: null,
        priority: 2,
        action_label: 'View behavioral patterns',
        action_route: '/analytics',
        expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    };
}

async function detectSalaryIntelligenceInsight(userId) {
    const cached = await getCached(pool, userId, 'salary_intelligence', 31 * 24 * 60 * 60 * 1000);
    if (!cached || !cached.detected || !cached.insight) return null;

    return {
        type: 'salary_intelligence_insight',
        title: `Salary allocation plan ready${cached.salary ? ` for ${inr(cached.salary)}/month` : ''}`,
        description: cached.insight,
        amount_saved: null,
        priority: 3,
        action_label: 'View allocation plan',
        action_route: '/salary-intelligence',
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    };
}

async function detectOpportunities(userId) {
    const results = await Promise.all([
        detectIdleCash(userId),
        detectCreditCardInterest(userId),
        detectHighInterestLoan(userId),
        detectTax80cGap(userId),
        detectSpendingSpike(userId),
        detectAllocationGap(userId),
        detectSipUnderinvesting(userId),
        detectEmergencyFundLow(userId),
        detectForecastWarning(userId),
        detectPersonalityInsight(userId),
        detectAdvanceTaxDue(userId),
        detectBehavioralPattern(userId),
        detectSalaryIntelligenceInsight(userId),
    ]);
    return results.filter(r => r !== null);
}

// ─── Routes ─────────────────────────────────────────────────────────────────

router.post('/detect', async (req, res) => {
    try {
        const detected = await detectOpportunities(req.user.id);

        // Single upsert per opportunity instead of a SELECT-then-INSERT/UPDATE loop —
        // removes the N+1 and the race where two concurrent /detect calls could both
        // pass the existence check and create duplicate active rows of the same type.
        // Backed by the partial unique index idx_opportunities_user_type_active.
        for (const opp of detected) {
            await pool.query(
                `INSERT INTO opportunities (user_id, type, title, description, amount_saved, priority, action_label, action_route, expires_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                 ON CONFLICT (user_id, type) WHERE status = 'active'
                 DO UPDATE SET title=$3, description=$4, amount_saved=$5, priority=$6,
                     action_label=$7, action_route=$8, expires_at=$9, detected_at=NOW()`,
                [req.user.id, opp.type, opp.title, opp.description, opp.amount_saved, opp.priority, opp.action_label, opp.action_route, opp.expires_at]
            );
        }

        const activeRes = await pool.query(
            `SELECT * FROM opportunities WHERE user_id = $1 AND status = 'active' ORDER BY priority ASC, detected_at DESC`,
            [req.user.id]
        );

        res.json({ detected_count: detected.length, opportunities: activeRes.rows });
    } catch (err) {
        console.error('[Opportunities]', err.message);
        res.status(500).json({ error: 'Server error.' });
    }
});

router.get('/', async (req, res) => {
    try {
        const [activeRes, dismissedRes, actedRes] = await Promise.all([
            pool.query(`SELECT * FROM opportunities WHERE user_id = $1 AND status = 'active' ORDER BY priority ASC, detected_at DESC`, [req.user.id]),
            pool.query(`SELECT COUNT(*) FROM opportunities WHERE user_id = $1 AND status = 'dismissed'`, [req.user.id]),
            pool.query(`SELECT COUNT(*) FROM opportunities WHERE user_id = $1 AND status = 'acted_on'`, [req.user.id]),
        ]);

        res.json({
            opportunities: activeRes.rows,
            summary: {
                active_count: activeRes.rows.length,
                dismissed_count: parseInt(dismissedRes.rows[0].count, 10),
                acted_on_count: parseInt(actedRes.rows[0].count, 10),
            },
        });
    } catch (err) {
        console.error('[Opportunities]', err.message);
        res.status(500).json({ error: 'Server error.' });
    }
});

router.patch('/:id/dismiss', async (req, res) => {
    try {
        const existing = await pool.query(`SELECT * FROM opportunities WHERE id = $1`, [req.params.id]);
        if (existing.rows.length === 0) return res.status(404).json({ error: 'Opportunity not found.' });
        if (existing.rows[0].user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden.' });

        const result = await pool.query(
            `UPDATE opportunities SET status='dismissed', dismissed_at=NOW() WHERE id=$1 RETURNING *`,
            [req.params.id]
        );
        res.json(result.rows[0]);
    } catch (err) {
        console.error('[Opportunities]', err.message);
        res.status(500).json({ error: 'Server error.' });
    }
});

router.patch('/:id/acted-on', async (req, res) => {
    try {
        const existing = await pool.query(`SELECT * FROM opportunities WHERE id = $1`, [req.params.id]);
        if (existing.rows.length === 0) return res.status(404).json({ error: 'Opportunity not found.' });
        if (existing.rows[0].user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden.' });

        const result = await pool.query(
            `UPDATE opportunities SET status='acted_on', acted_on_at=NOW() WHERE id=$1 RETURNING *`,
            [req.params.id]
        );
        res.json(result.rows[0]);
    } catch (err) {
        console.error('[Opportunities]', err.message);
        res.status(500).json({ error: 'Server error.' });
    }
});

module.exports = router;
