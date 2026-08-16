const express = require('express');
const { rateLimit } = require('express-rate-limit');
const pool = require('../db/pool');
const auth = require('../middleware/auth');
const { aiComplete } = require('../utils/ai');
const { calculateEMI, monthsRemainingForLoan } = require('../utils/amortization');
const { computeDtiBreakdown, computeCreditUtilization } = require('./debt');
const { nonSpendingExclusionSQL } = require('../utils/savingsRate');
const router = express.Router();

router.use(auth);

// A conversation naturally involves many more round-trips than a one-shot AI
// report, so it gets its own, more generous budget instead of sharing the
// global 30/hour AI limiter (which still governs every other /api/ai route).
const agentChatLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => `agent-chat:user:${req.user.id}`,
    message: { error: 'You’ve reached the chat limit for this hour. Please try again later.' },
});

const AGENT_TYPES = ['debt_coach', 'investment_advisor', 'budget_master', 'general'];
const isValidAgentType = (value) => AGENT_TYPES.includes(value);

const fmt = (n) => parseFloat((Number(n) || 0).toFixed(2));
const inr = (n) => `₹${fmt(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

// ─── Data fetchers ─────────────────────────────────────────────────────────

function emiForLoan(loan) {
    if (loan.emi_amount) return parseFloat(loan.emi_amount);
    const monthlyRate = parseFloat(loan.interest_rate_pct) / 12 / 100;
    return calculateEMI(parseFloat(loan.outstanding_balance), monthlyRate, monthsRemainingForLoan(loan));
}

async function fetchDebtCoachData(userId) {
    // DTI and credit-utilization math now live in debt.js (computeDtiBreakdown /
    // computeCreditUtilization) -- the same functions GET /api/debt/dti and
    // GET /api/debt/credit-utilization call. Previously this duplicated that
    // math inline with its own queries, which meant the debt_coach persona and
    // the standalone debt pages could silently disagree on the same numbers.
    const [loansRes, prepaymentsRes, dti, utilization] = await Promise.all([
        pool.query(
            `SELECT * FROM loans WHERE user_id = $1 AND is_active = true ORDER BY interest_rate_pct DESC`,
            [userId]
        ),
        pool.query(
            `SELECT lp.amount, lp.prepayment_date, l.name AS loan_name
             FROM loan_prepayments lp
             JOIN loans l ON lp.loan_id = l.id
             WHERE l.user_id = $1
             ORDER BY lp.prepayment_date DESC LIMIT 3`,
            [userId]
        ),
        computeDtiBreakdown(userId),
        computeCreditUtilization(userId),
    ]);

    const loans = loansRes.rows.map(l => ({
        name: l.name,
        type: l.type,
        outstanding_balance: fmt(l.outstanding_balance),
        interest_rate_pct: fmt(l.interest_rate_pct),
        emi_amount: fmt(emiForLoan(l)),
        tenure_months: l.tenure_months,
    }));

    return {
        loans,
        credit_cards: {
            total_outstanding: utilization.aggregate.total_outstanding,
            total_limit: utilization.aggregate.total_limit,
            overall_utilization_pct: utilization.aggregate.overall_utilization_pct,
        },
        dti: {
            monthly_income: dti.monthly_income,
            monthly_loan_emi: dti.monthly_loan_emi,
            monthly_credit_obligation: dti.monthly_credit_obligation,
            total_monthly_debt_obligation: dti.total_monthly_debt_obligation,
            dti_ratio: dti.dti_ratio,
        },
        recent_prepayments: prepaymentsRes.rows.map(p => ({
            loan_name: p.loan_name,
            amount: fmt(p.amount),
            date: p.prepayment_date,
        })),
    };
}

async function fetchInvestmentAdvisorData(userId) {
    // Five independent queries — none depends on another's result — run in
    // parallel. The fire_targets query keeps its own failure isolation (.catch)
    // since fire_target is allowed to be null on error, same as the original
    // try/catch behavior.
    const [holdingsRes, topHoldingsRes, snapshotsRes, bankRes, fireRes] = await Promise.all([
        pool.query(
            `SELECT name, type, units, purchase_price_per_unit, current_nav_or_price
             FROM investments WHERE user_id = $1`,
            [userId]
        ),
        pool.query(
            `SELECT name, type, units, current_nav_or_price, (units * current_nav_or_price) AS current_value
             FROM investments WHERE user_id = $1
             ORDER BY current_value DESC LIMIT 5`,
            [userId]
        ),
        pool.query(
            `SELECT snapshot_date, net_worth, total_assets, total_liabilities
             FROM net_worth_snapshots WHERE user_id = $1
             ORDER BY snapshot_date DESC LIMIT 4`,
            [userId]
        ),
        pool.query(
            `SELECT COALESCE(SUM(
                COALESCE(a.starting_balance, 0)
                + COALESCE((SELECT SUM(t.amount) FROM transactions t WHERE t.account_id = a.id AND t.type = 'income' AND t.date >= COALESCE(a.balance_as_of, '1970-01-01')), 0)
                - COALESCE((SELECT SUM(t.amount) FROM transactions t WHERE t.account_id = a.id AND t.type = 'expense' AND t.date >= COALESCE(a.balance_as_of, '1970-01-01')), 0)
             ), 0) AS total
             FROM bank_accounts a WHERE a.user_id = $1`,
            [userId]
        ),
        pool.query(
            `SELECT * FROM fire_targets WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
            [userId]
        ).catch(() => ({ rows: [] })),
    ]);

    let total_invested = 0;
    let total_current_value = 0;
    const byType = {};
    for (const h of holdingsRes.rows) {
        const invested = parseFloat(h.units) * parseFloat(h.purchase_price_per_unit);
        const current = parseFloat(h.units) * parseFloat(h.current_nav_or_price);
        total_invested += invested;
        total_current_value += current;
        byType[h.type] = byType[h.type] || { invested: 0, current_value: 0 };
        byType[h.type].invested += invested;
        byType[h.type].current_value += current;
    }
    total_invested = fmt(total_invested);
    total_current_value = fmt(total_current_value);
    const unrealized_gain = fmt(total_current_value - total_invested);
    const by_type_breakdown = Object.entries(byType).map(([type, v]) => ({
        type,
        invested: fmt(v.invested),
        current_value: fmt(v.current_value),
    }));

    const top_holdings = topHoldingsRes.rows.map(r => ({
        name: r.name,
        type: r.type,
        current_value: fmt(r.current_value),
    }));

    const net_worth_snapshots = snapshotsRes.rows.map(r => ({
        date: r.snapshot_date,
        net_worth: fmt(r.net_worth),
        total_assets: fmt(r.total_assets),
        total_liabilities: fmt(r.total_liabilities),
    }));

    let fire_target = null;
    if (fireRes.rows.length > 0) {
        const f = fireRes.rows[0];
        fire_target = {
            corpus_needed: f.corpus_needed != null ? fmt(f.corpus_needed) : null,
            target_date: f.target_date || null,
        };
    }

    const bank_balance = fmt(bankRes.rows[0].total);
    const total_assets = bank_balance + total_current_value;
    const RECOMMENDED_PCT = { bank: 10, mutual_fund: 30, stock: 30, fd: 8.33, ppf: 8.33, nps: 8.34, gold: 5, crypto: 0, other: 0 };
    const asset_allocation = total_assets > 0
        ? [
            { category: 'bank', current_pct: fmt((bank_balance / total_assets) * 100), recommended_pct: RECOMMENDED_PCT.bank },
            ...by_type_breakdown.map(b => ({
                category: b.type,
                current_pct: fmt((b.current_value / total_assets) * 100),
                recommended_pct: RECOMMENDED_PCT[b.type] != null ? RECOMMENDED_PCT[b.type] : 0,
            })),
        ]
        : [];

    return {
        portfolio_summary: { total_invested, total_current_value, unrealized_gain, by_type_breakdown },
        top_holdings,
        net_worth_snapshots,
        fire_target,
        asset_allocation,
    };
}

async function fetchBudgetMasterData(userId) {
    const now = new Date();
    const m = now.getMonth() + 1;
    const y = now.getFullYear();

    // Three independent queries — none depends on another's result — run in parallel.
    const [spendingRes, budgetsRes, savingsRes] = await Promise.all([
        pool.query(
            `SELECT c.name AS category_name,
                    DATE_TRUNC('month', t.date) AS month,
                    COALESCE(SUM(t.amount), 0) AS total
             FROM transactions t
             LEFT JOIN categories c ON t.category_id = c.id
             WHERE t.user_id = $1 AND t.type = 'expense'
               AND t.date >= (CURRENT_DATE - INTERVAL '3 months')
               AND ${nonSpendingExclusionSQL('t')}
             GROUP BY c.name, DATE_TRUNC('month', t.date)
             ORDER BY c.name, month`,
            [userId]
        ),
        pool.query(
            `SELECT b.amount, c.name AS category_name,
                    COALESCE(SUM(t.amount), 0) AS spent
             FROM budgets b
             JOIN categories c ON b.category_id = c.id
             LEFT JOIN transactions t
               ON t.category_id = b.category_id AND t.user_id = b.user_id
               AND t.type = 'expense'
               AND EXTRACT(MONTH FROM t.date) = $2
               AND EXTRACT(YEAR FROM t.date) = $3
             WHERE b.user_id = $1 AND b.month = $2 AND b.year = $3
             GROUP BY b.amount, c.name`,
            [userId, m, y]
        ),
        pool.query(
            `SELECT DATE_TRUNC('month', date) AS month, type, COALESCE(SUM(amount), 0) AS total
             FROM transactions WHERE user_id = $1 AND date >= (CURRENT_DATE - INTERVAL '3 months')
             AND ${nonSpendingExclusionSQL('transactions')}
             GROUP BY DATE_TRUNC('month', date), type
             ORDER BY month`,
            [userId]
        ),
    ]);

    const byCategory = {};
    for (const row of spendingRes.rows) {
        const name = row.category_name || 'Uncategorized';
        byCategory[name] = byCategory[name] || [];
        byCategory[name].push({ month: row.month, amount: fmt(row.total) });
    }
    const spending_by_category = Object.entries(byCategory).map(([category_name, months]) => {
        const sorted = months.sort((a, b) => new Date(a.month) - new Date(b.month));
        const latest = sorted[sorted.length - 1]?.amount || 0;
        const prior = sorted.length > 1 ? sorted[sorted.length - 2].amount : 0;
        const mom_change_pct = prior > 0 ? fmt(((latest - prior) / prior) * 100) : null;
        return { category_name, latest_month_amount: latest, mom_change_pct };
    });

    const budget_adherence = budgetsRes.rows.map(r => ({
        category_name: r.category_name,
        budget_amount: fmt(r.amount),
        spent: fmt(r.spent),
        overage: fmt(parseFloat(r.spent) - parseFloat(r.amount)),
    }));
    const top_overspent_categories = budget_adherence
        .filter(b => b.overage > 0)
        .sort((a, b) => b.overage - a.overage)
        .slice(0, 3);

    const monthMap = {};
    for (const row of savingsRes.rows) {
        const key = row.month.toISOString().slice(0, 7);
        monthMap[key] = monthMap[key] || { income: 0, expense: 0 };
        monthMap[key][row.type] = parseFloat(row.total);
    }
    const savings_rate_last_3_months = Object.entries(monthMap).map(([month, v]) => ({
        month,
        savings_rate_pct: v.income > 0 ? fmt(((v.income - (v.expense || 0)) / v.income) * 100) : null,
    }));

    return {
        spending_by_category,
        budget_adherence,
        top_overspent_categories,
        savings_rate_last_3_months,
    };
}

// ─── System prompt builders ────────────────────────────────────────────────

const COMMON_RULES = `
Behavioral rules:
- Always give specific advice using the actual numbers provided in the context block above — never give generic advice.
- Always quantify the impact in ₹ (Indian Rupees) wherever possible.
- Always end your response with a concrete next action the user can take.
- Keep responses concise (under 200 words) unless the user explicitly asks for detailed analysis.
- If you need more information to give good advice, ask a clarifying question rather than assuming.`;

function buildDebtCoachPrompt(data) {
    const loansText = data.loans.length > 0
        ? data.loans.map(l => `- ${l.name} (${l.type}): outstanding ${inr(l.outstanding_balance)}, interest ${l.interest_rate_pct}% p.a., EMI ${inr(l.emi_amount)}, ${l.tenure_months} months tenure`).join('\n')
        : '- No active loans.';
    const prepaymentsText = data.recent_prepayments.length > 0
        ? data.recent_prepayments.map(p => `- ${inr(p.amount)} towards ${p.loan_name} on ${p.date}`).join('\n')
        : '- None recorded.';

    return `You are Debt Coach, a no-nonsense debt elimination coach. You are direct, motivating, and laser-focused on getting the user to debt freedom as fast as possible.

USER'S FINANCIAL DATA:
Active loans:
${loansText}

Credit cards: total outstanding ${inr(data.credit_cards.total_outstanding)} of ${inr(data.credit_cards.total_limit)} limit (${data.credit_cards.overall_utilization_pct}% utilization).

Debt-to-income: monthly income ${inr(data.dti.monthly_income)}, monthly loan EMIs ${inr(data.dti.monthly_loan_emi)}, monthly credit obligations ${inr(data.dti.monthly_credit_obligation)}, DTI ratio ${data.dti.dti_ratio}%.

Recent prepayments:
${prepaymentsText}
${COMMON_RULES}`;
}

function buildInvestmentAdvisorPrompt(data) {
    const byType = data.portfolio_summary.by_type_breakdown.length > 0
        ? data.portfolio_summary.by_type_breakdown.map(b => `- ${b.type}: invested ${inr(b.invested)}, current value ${inr(b.current_value)}`).join('\n')
        : '- No holdings recorded.';
    const topHoldings = data.top_holdings.length > 0
        ? data.top_holdings.map(h => `- ${h.name} (${h.type}): current value ${inr(h.current_value)}`).join('\n')
        : '- None.';
    const snapshots = data.net_worth_snapshots.length > 0
        ? data.net_worth_snapshots.map(s => `- ${s.date}: net worth ${inr(s.net_worth)}`).join('\n')
        : '- No net worth history yet.';
    const allocation = data.asset_allocation.length > 0
        ? data.asset_allocation.map(a => `- ${a.category}: ${a.current_pct}% (recommended ${a.recommended_pct}%)`).join('\n')
        : '- Not enough data to compute allocation.';
    const fireText = data.fire_target
        ? `Corpus needed: ${data.fire_target.corpus_needed != null ? inr(data.fire_target.corpus_needed) : 'not set'}, target date: ${data.fire_target.target_date || 'not set'}.`
        : 'No FIRE target set yet.';

    return `You are Investment Advisor, a calm, data-driven wealth builder. You focus on long-term compounding and risk-appropriate asset allocation.

USER'S FINANCIAL DATA:
Portfolio summary: total invested ${inr(data.portfolio_summary.total_invested)}, current value ${inr(data.portfolio_summary.total_current_value)}, unrealized gain ${inr(data.portfolio_summary.unrealized_gain)}.
By type:
${byType}

Top holdings by current value:
${topHoldings}

Net worth history (most recent first):
${snapshots}

FIRE target: ${fireText}

Asset allocation (current vs recommended):
${allocation}
${COMMON_RULES}`;
}

function buildBudgetMasterPrompt(data) {
    const spendingText = data.spending_by_category.length > 0
        ? data.spending_by_category.map(c => `- ${c.category_name}: ${inr(c.latest_month_amount)} this month${c.mom_change_pct !== null ? ` (${c.mom_change_pct > 0 ? '+' : ''}${c.mom_change_pct}% vs last month)` : ''}`).join('\n')
        : '- No spending data yet.';
    const adherenceText = data.budget_adherence.length > 0
        ? data.budget_adherence.map(b => `- ${b.category_name}: budget ${inr(b.budget_amount)}, spent ${inr(b.spent)}${b.overage > 0 ? ` (over by ${inr(b.overage)})` : ''}`).join('\n')
        : '- No budgets set for this month.';
    const overspentText = data.top_overspent_categories.length > 0
        ? data.top_overspent_categories.map(c => `- ${c.category_name}: over by ${inr(c.overage)}`).join('\n')
        : '- None — nothing is over budget right now.';
    const savingsText = data.savings_rate_last_3_months.length > 0
        ? data.savings_rate_last_3_months.map(s => `- ${s.month}: ${s.savings_rate_pct !== null ? `${s.savings_rate_pct}%` : 'no income recorded'}`).join('\n')
        : '- Not enough data.';
    return `You are Budget Master, an empathetic behavioral finance coach. You understand that spending is emotional, and you focus on progress, not perfection.

USER'S FINANCIAL DATA:
Spending by category (last 3 months, latest month shown):
${spendingText}

This month's budget adherence:
${adherenceText}

Top overspent categories this month:
${overspentText}

Savings rate (last 3 months):
${savingsText}
${COMMON_RULES}`;
}

// Fetching all 3 domains is ~12 queries; a back-and-forth conversation would
// otherwise re-run all of them on every single turn even though the user's
// underlying financial data rarely changes mid-conversation.
const UNIFIED_DATA_CACHE_TTL_MS = 60 * 1000;
const unifiedDataCache = new Map(); // userId -> { data, expiresAt }

async function fetchUnifiedData(userId) {
    const cached = unifiedDataCache.get(userId);
    if (cached && cached.expiresAt > Date.now()) return cached.data;

    const [debt, investing, budget] = await Promise.all([
        fetchDebtCoachData(userId),
        fetchInvestmentAdvisorData(userId),
        fetchBudgetMasterData(userId),
    ]);
    const data = { debt, investing, budget };
    unifiedDataCache.set(userId, { data, expiresAt: Date.now() + UNIFIED_DATA_CACHE_TTL_MS });
    return data;
}

function buildUnifiedPrompt({ debt, investing, budget }) {
    // Reuse each domain's "USER'S FINANCIAL DATA" block by stripping the persona
    // line and COMMON_RULES suffix off the existing per-agent prompt builders.
    const stripToData = (fullPrompt) =>
        fullPrompt
            .slice(fullPrompt.indexOf('\n') + 1)
            .replace(COMMON_RULES, '')
            .replace(/^USER'S FINANCIAL DATA[^\n]*\n/m, '')
            .trim();

    const debtSection = stripToData(buildDebtCoachPrompt(debt));
    const investingSection = stripToData(buildInvestmentAdvisorPrompt(investing));
    const budgetSection = stripToData(buildBudgetMasterPrompt(budget));

    return `You are Fin, FinTrack's all-in-one AI financial assistant for an Indian personal finance app. You combine the expertise of a no-nonsense debt elimination coach, a calm data-driven investment advisor, and an empathetic behavioral budget coach — all in one conversation. Read the user's question and respond in whichever voice fits the topic; for mixed questions, blend them naturally. Never make the user pick a "mode" — just answer.

USER'S FINANCIAL DATA:

— DEBT —
${debtSection}

— INVESTMENTS —
${investingSection}

— BUDGET & SPENDING —
${budgetSection}
${COMMON_RULES}`;
}

// ─── Routes ─────────────────────────────────────────────────────────────────

router.post('/message', agentChatLimiter, async (req, res) => {
    try {
        const { message, conversation_id } = req.body;

        if (!message)
            return res.status(400).json({ error: 'message is required.' });

        let messages = [];
        let existingConversation = null;

        if (conversation_id) {
            const convRes = await pool.query(
                'SELECT * FROM agent_conversations WHERE id = $1',
                [conversation_id]
            );
            if (convRes.rows.length === 0)
                return res.status(404).json({ error: 'Conversation not found.' });
            if (convRes.rows[0].user_id !== req.user.id)
                return res.status(403).json({ error: 'Forbidden.' });
            existingConversation = convRes.rows[0];
            messages = existingConversation.messages || [];
        }

        const data = await fetchUnifiedData(req.user.id);
        const systemPrompt = buildUnifiedPrompt(data);

        // Cap how much history we send to the model — full transcript still
        // lives in the DB and is returned to the client untouched.
        const CONTEXT_HISTORY_LIMIT = 20;
        const recentMessages = messages.slice(-CONTEXT_HISTORY_LIMIT);

        const aiMessages = [
            { role: 'system', content: systemPrompt },
            ...recentMessages.map(m => ({ role: m.role, content: m.content })),
            { role: 'user', content: message },
        ];

        const responseText = await aiComplete('agent-chat', aiMessages);

        const now = new Date().toISOString();
        const updatedMessages = [
            ...messages,
            { role: 'user', content: message, timestamp: now },
            { role: 'assistant', content: responseText, timestamp: new Date().toISOString() },
        ];

        let resultConversationId;
        if (existingConversation) {
            await pool.query(
                'UPDATE agent_conversations SET messages = $1::jsonb, updated_at = NOW() WHERE id = $2',
                [JSON.stringify(updatedMessages), existingConversation.id]
            );
            resultConversationId = existingConversation.id;
        } else {
            const title = message.trim().slice(0, 60);
            const insertRes = await pool.query(
                `INSERT INTO agent_conversations (user_id, agent_type, title, messages)
                 VALUES ($1, 'general', $2, $3::jsonb) RETURNING id`,
                [req.user.id, title, JSON.stringify(updatedMessages)]
            );
            resultConversationId = insertRes.rows[0].id;
        }

        res.json({
            conversation_id: resultConversationId,
            response: responseText,
            messages: updatedMessages,
        });
    } catch (err) {
        console.error('[Agents]', err.message);
        res.status(500).json({ error: 'Server error.' });
    }
});

router.get('/conversations', async (req, res) => {
    try {
        const { agent_type } = req.query;
        if (agent_type && !isValidAgentType(agent_type))
            return res.status(400).json({ error: 'Invalid agent_type.' });

        let query = `SELECT id, agent_type, title, updated_at, jsonb_array_length(messages) AS message_count
                      FROM agent_conversations WHERE user_id = $1`;
        const params = [req.user.id];
        if (agent_type) {
            query += ' AND agent_type = $2';
            params.push(agent_type);
        }
        query += ' ORDER BY updated_at DESC';

        const result = await pool.query(query, params);
        res.json({ conversations: result.rows });
    } catch (err) {
        console.error('[Agents]', err.message);
        res.status(500).json({ error: 'Server error.' });
    }
});

router.get('/conversations/:id', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM agent_conversations WHERE id = $1',
            [req.params.id]
        );
        if (result.rows.length === 0)
            return res.status(404).json({ error: 'Conversation not found.' });
        if (result.rows[0].user_id !== req.user.id)
            return res.status(403).json({ error: 'Forbidden.' });

        res.json({ conversation: result.rows[0] });
    } catch (err) {
        console.error('[Agents]', err.message);
        res.status(500).json({ error: 'Server error.' });
    }
});

router.delete('/conversations/:id', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT user_id FROM agent_conversations WHERE id = $1',
            [req.params.id]
        );
        if (result.rows.length === 0)
            return res.status(404).json({ error: 'Conversation not found.' });
        if (result.rows[0].user_id !== req.user.id)
            return res.status(403).json({ error: 'Forbidden.' });

        await pool.query('DELETE FROM agent_conversations WHERE id = $1', [req.params.id]);
        res.json({ message: 'Conversation deleted' });
    } catch (err) {
        console.error('[Agents]', err.message);
        res.status(500).json({ error: 'Server error.' });
    }
});

module.exports = router;
