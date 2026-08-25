const express = require('express');
const pool = require('../db/pool');
const auth = require('../middleware/auth');
const { calculateEMI, monthsRemainingForLoan } = require('../utils/amortization');
const { isValidRiskProfile, isPositiveNumber, isNonNegativeNumber } = require('../utils/validation');
const { simulateFinancialPlan, getFiveYearSummary, calculateEMI: calculateLoanEMI } = require('../services/planningEngine');
const { getFundsForPlan } = require('../services/fundCatalog');
const { aiComplete } = require('../utils/ai');
const { computeDriftReport } = require('../services/behaviorAnalysis');
const { fetchCreditCardsWithBalance } = require('../utils/creditCardBalance');
const { nonSpendingExclusionSQL } = require('../utils/savingsRate');
const router = express.Router();

router.use(auth);

// ─── FINANCIAL PLAN ROUTES (setup form + projection) ──────────────────────
// Backs the "Phase 4" planning setup form: persists income/expenses/goal/loan
// inputs to financial_plans + financial_plan_expenses, and recomputes the
// projection via planningEngine.js on every read (nothing computed is stored).

function serializePlan(plan) {
    return {
        id: plan.id,
        monthly_income: parseFloat(plan.monthly_income),
        risk_profile: plan.risk_profile,
        emergency_fund_target_months: plan.emergency_fund_target_months,
        emergency_fund_current_balance: parseFloat(plan.emergency_fund_current_balance),
        goal_name: plan.goal_name,
        goal_amount: plan.goal_amount !== null ? parseFloat(plan.goal_amount) : null,
        goal_target_months: plan.goal_target_months,
        loan_principal: plan.loan_principal !== null ? parseFloat(plan.loan_principal) : null,
        loan_annual_rate_pct: plan.loan_annual_rate_pct !== null ? parseFloat(plan.loan_annual_rate_pct) : null,
        loan_tenure_months: plan.loan_tenure_months,
        loan_moratorium_months: plan.loan_moratorium_months,
        ai_narrative: plan.ai_narrative,
        ai_narrative_generated_at: plan.ai_narrative_generated_at,
        created_at: plan.created_at,
        updated_at: plan.updated_at,
    };
}

function serializeExpense(expense) {
    return { id: expense.id, name: expense.name, amount: parseFloat(expense.amount), category_id: expense.category_id ?? null };
}

// Shared by GET / and POST /apply-recalculation — both need the full
// plan + projection + narrative payload in identical shape.
function buildFullPlanResponse(plan, expenseRows) {
    const { rows: projection, emergencyFundReachedMonth, goalReachedMonth } =
        simulateFinancialPlan(planToSimulationInputs(plan, expenseRows));
    const recommendedFunds = getFundsForPlan(plan);

    const loan = plan.loan_principal !== null
        ? {
            emi: calculateLoanEMI(parseFloat(plan.loan_principal), parseFloat(plan.loan_annual_rate_pct), plan.loan_tenure_months),
        }
        : null;

    return {
        exists: true,
        plan: serializePlan(plan),
        expenses: expenseRows.map(serializeExpense),
        projection,
        fiveYearSummary: getFiveYearSummary(projection),
        emergencyFundReachedMonth,
        goalReachedMonth,
        staticNarrative: buildStaticNarrative(plan, recommendedFunds, projection),
        // Fund names live only in fundCatalog.js — exposing the resolved list here
        // (rather than role keys) means the frontend never has to re-derive or
        // hardcode a fund name itself.
        recommendedFunds: recommendedFunds.map(f => ({ name: f.name, plan_type: f.planType, platform: f.platform, role: f.role, reason: f.reason })),
        loan,
    };
}

// Builds the simulateFinancialPlan() input object from saved plan + expense rows.
// emergency_fund_target_months is stored as a multiple of expenses (e.g. "6 months"),
// so it's converted to an absolute rupee target here, against current fixed expenses.
function planToSimulationInputs(plan, expenseRows) {
    const fixedExpenses = expenseRows.map(e => ({ name: e.name, amount: parseFloat(e.amount) }));
    const fixedExpenseTotal = fixedExpenses.reduce((sum, e) => sum + e.amount, 0);

    const goal = plan.goal_amount !== null
        ? { name: plan.goal_name, targetAmount: parseFloat(plan.goal_amount), targetMonths: plan.goal_target_months }
        : null;

    const loan = plan.loan_principal !== null
        ? {
            principal: parseFloat(plan.loan_principal),
            annualRatePct: parseFloat(plan.loan_annual_rate_pct),
            tenureMonths: plan.loan_tenure_months,
            moratoriumMonths: plan.loan_moratorium_months || 0,
        }
        : null;

    return {
        monthlyIncome: parseFloat(plan.monthly_income),
        fixedExpenses,
        emergencyFundTarget: plan.emergency_fund_target_months * fixedExpenseTotal,
        emergencyFundCurrent: parseFloat(plan.emergency_fund_current_balance),
        goal,
        loan,
        riskStrategy: plan.risk_profile,
    };
}

// Deterministic, no-AI fallback narrative — used both as the immediate
// "static text" the frontend shows before the AI call resolves, and as the
// fallback when AI generation or JSON parsing fails.
function buildStaticNarrative(plan, recommendedFunds, projection) {
    const month1 = projection[0];
    const last = projection[projection.length - 1];

    const emergencyFund = recommendedFunds.find(f => f.role === 'liquidEmergencyFund');
    const goalFund = recommendedFunds.find(f => f.role === 'goalFund');
    const equityFunds = recommendedFunds.filter(f => f.role === 'broadMarketIndex' || f.role === 'secondaryIndex' || f.role === 'elssTaxSaver');

    const checklist = [
        {
            title: 'Open your emergency fund account',
            description: emergencyFund
                ? `Park your emergency buffer in ${emergencyFund.name} (${emergencyFund.planType}) on ${emergencyFund.platform}.`
                : 'Open a liquid fund account to hold your emergency buffer.',
        },
        {
            title: 'Automate your monthly SIP',
            description: equityFunds.length > 0
                ? `Set up a SIP of ${formatIndianCurrency(month1.sipContribution)}/month into ${equityFunds.map(f => f.name).join(' and ')}.`
                : `Set up a SIP of ${formatIndianCurrency(month1.sipContribution)}/month into a broad-market index fund.`,
        },
    ];
    if (plan.goal_amount !== null && goalFund) {
        checklist.push({
            title: `Fund your goal: ${plan.goal_name}`,
            description: `Direct your goal contribution into ${goalFund.name} on ${goalFund.platform}, kept separate from your emergency fund.`,
        });
    }
    if (plan.loan_principal !== null) {
        checklist.push({
            title: 'Automate your loan EMI',
            description: 'Set up an auto-debit for your EMI so it never competes with this month\'s other allocations.',
        });
    }
    checklist.push({
        title: 'Revisit this plan periodically',
        description: 'Income, expenses, and goals change — update your plan whenever something shifts materially.',
    });

    const allocationRationale = equityFunds.length > 0
        ? `Your ${plan.risk_profile} risk profile directs ${formatIndianCurrency(month1.sipContribution)}/month into equity via ${equityFunds.map(f => f.name).join(' and ')}, while your emergency fund builds in ${emergencyFund ? emergencyFund.name : 'a liquid fund'} until it reaches its target.`
        : `Your ${plan.risk_profile} risk profile currently directs surplus toward your emergency fund in ${emergencyFund ? emergencyFund.name : 'a liquid fund'} before any equity allocation begins.`;

    const fiveYearSummary = last
        ? `By month ${last.month}, your projected net worth is ${formatIndianCurrency(last.netWorth)}, with ${formatIndianCurrency(last.emergencyFundBalance)} in your emergency fund, ${formatIndianCurrency(last.sipBalance)} in SIP investments${plan.goal_amount !== null ? `, and ${formatIndianCurrency(last.goalBalance)} toward your goal` : ''}.`
        : 'Five-year projection unavailable.';

    return { checklist, allocation_rationale: allocationRationale, five_year_summary: fiveYearSummary };
}

router.get('/', async (req, res) => {
    try {
        const planRes = await pool.query(
            'SELECT * FROM financial_plans WHERE user_id = $1',
            [req.user.id]
        );

        if (planRes.rows.length === 0) {
            return res.json({ exists: false });
        }

        const plan = planRes.rows[0];
        const expensesRes = await pool.query(
            'SELECT id, name, amount, category_id FROM financial_plan_expenses WHERE plan_id = $1 ORDER BY created_at ASC',
            [plan.id]
        );

        res.json(buildFullPlanResponse(plan, expensesRes.rows));
    } catch (err) {
        console.error('[Planning]', err.message);
        res.status(500).json({ error: 'Server error.' });
    }
});

router.post('/', async (req, res) => {
    try {
        const {
            monthly_income,
            risk_profile = 'balanced',
            emergency_fund_target_months = 6,
            emergency_fund_current_balance = 0,
            expenses = [],
            goal_name = null,
            goal_amount = null,
            goal_target_months = null,
            loan_principal = null,
            loan_annual_rate_pct = null,
            loan_tenure_months = null,
            loan_moratorium_months = 0,
        } = req.body || {};

        if (!isPositiveNumber(monthly_income)) {
            return res.status(400).json({ error: 'monthly_income is required and must be a positive number.' });
        }
        if (!isValidRiskProfile(risk_profile)) {
            return res.status(400).json({ error: 'risk_profile must be one of: safety, balanced, growth.' });
        }
        if (!Number.isInteger(emergency_fund_target_months) || emergency_fund_target_months <= 0) {
            return res.status(400).json({ error: 'emergency_fund_target_months must be a positive integer.' });
        }
        if (!isNonNegativeNumber(emergency_fund_current_balance)) {
            return res.status(400).json({ error: 'emergency_fund_current_balance must be zero or greater.' });
        }
        if (!Array.isArray(expenses)) {
            return res.status(400).json({ error: 'expenses must be an array.' });
        }
        for (const expense of expenses) {
            if (!expense || typeof expense.name !== 'string' || !expense.name.trim()) {
                return res.status(400).json({ error: 'Each expense must have a non-empty name.' });
            }
            if (!isNonNegativeNumber(expense.amount)) {
                return res.status(400).json({ error: `Expense "${expense.name}" must have an amount of zero or greater.` });
            }
            if (expense.category_id !== undefined && expense.category_id !== null && typeof expense.category_id !== 'string') {
                return res.status(400).json({ error: `Expense "${expense.name}" has an invalid category_id.` });
            }
        }

        const hasLoan = loan_principal !== null && loan_principal !== undefined;
        if (hasLoan) {
            if (!isPositiveNumber(loan_principal)) {
                return res.status(400).json({ error: 'loan_principal must be a positive number.' });
            }
            if (!isNonNegativeNumber(loan_annual_rate_pct)) {
                return res.status(400).json({ error: 'loan_annual_rate_pct must be zero or greater.' });
            }
            if (!Number.isInteger(loan_tenure_months) || loan_tenure_months <= 0) {
                return res.status(400).json({ error: 'loan_tenure_months must be a positive integer.' });
            }
            if (!Number.isInteger(loan_moratorium_months) || loan_moratorium_months < 0) {
                return res.status(400).json({ error: 'loan_moratorium_months must be a non-negative integer.' });
            }
            if (loan_tenure_months <= loan_moratorium_months) {
                return res.status(400).json({ error: 'loan_tenure_months must be greater than loan_moratorium_months.' });
            }
        }

        const hasGoal = goal_amount !== null && goal_amount !== undefined;
        if (hasGoal) {
            if (typeof goal_name !== 'string' || !goal_name.trim()) {
                return res.status(400).json({ error: 'goal_name is required when goal_amount is set.' });
            }
            if (!isPositiveNumber(goal_amount)) {
                return res.status(400).json({ error: 'goal_amount must be a positive number.' });
            }
            if (!Number.isInteger(goal_target_months) || goal_target_months <= 0) {
                return res.status(400).json({ error: 'goal_target_months must be a positive integer.' });
            }
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const planRes = await client.query(
                `INSERT INTO financial_plans (
                    user_id, monthly_income, risk_profile,
                    emergency_fund_target_months, emergency_fund_current_balance,
                    goal_name, goal_amount, goal_target_months,
                    loan_principal, loan_annual_rate_pct, loan_tenure_months, loan_moratorium_months
                ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
                ON CONFLICT (user_id) DO UPDATE SET
                    monthly_income = EXCLUDED.monthly_income,
                    risk_profile = EXCLUDED.risk_profile,
                    emergency_fund_target_months = EXCLUDED.emergency_fund_target_months,
                    emergency_fund_current_balance = EXCLUDED.emergency_fund_current_balance,
                    goal_name = EXCLUDED.goal_name,
                    goal_amount = EXCLUDED.goal_amount,
                    goal_target_months = EXCLUDED.goal_target_months,
                    loan_principal = EXCLUDED.loan_principal,
                    loan_annual_rate_pct = EXCLUDED.loan_annual_rate_pct,
                    loan_tenure_months = EXCLUDED.loan_tenure_months,
                    loan_moratorium_months = EXCLUDED.loan_moratorium_months,
                    updated_at = NOW()
                RETURNING *`,
                [
                    req.user.id, monthly_income, risk_profile,
                    emergency_fund_target_months, emergency_fund_current_balance,
                    hasGoal ? goal_name : null, hasGoal ? goal_amount : null, hasGoal ? goal_target_months : null,
                    hasLoan ? loan_principal : null, hasLoan ? loan_annual_rate_pct : null,
                    hasLoan ? loan_tenure_months : null, hasLoan ? loan_moratorium_months : 0,
                ]
            );
            const plan = planRes.rows[0];

            await client.query('DELETE FROM financial_plan_expenses WHERE plan_id = $1', [plan.id]);

            let insertedExpenses = [];
            if (expenses.length > 0) {
                const inserted = await client.query(
                    `INSERT INTO financial_plan_expenses (plan_id, name, amount, category_id)
                     SELECT $1, e.name, e.amount, e.category_id
                     FROM unnest($2::text[], $3::numeric[], $4::uuid[]) AS e(name, amount, category_id)
                     RETURNING id, name, amount, category_id`,
                    [plan.id, expenses.map(e => e.name), expenses.map(e => e.amount), expenses.map(e => e.category_id || null)]
                );
                insertedExpenses = inserted.rows;
            }

            await client.query('COMMIT');

            res.json({
                plan: serializePlan(plan),
                expenses: insertedExpenses.map(serializeExpense),
            });
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    } catch (err) {
        console.error('[Planning]', err.message);
        res.status(500).json({ error: 'Server error.' });
    }
});

router.delete('/', async (req, res) => {
    try {
        const result = await pool.query(
            'DELETE FROM financial_plans WHERE user_id = $1 RETURNING id',
            [req.user.id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'No financial plan found.' });
        }
        res.json({ message: 'Financial plan deleted.' });
    } catch (err) {
        console.error('[Planning]', err.message);
        res.status(500).json({ error: 'Server error.' });
    }
});

async function loadPlanAndExpensesForUser(userId) {
    const planRes = await pool.query('SELECT * FROM financial_plans WHERE user_id = $1', [userId]);
    if (planRes.rows.length === 0) return null;
    const plan = planRes.rows[0];
    const expensesRes = await pool.query(
        'SELECT id, name, amount, category_id FROM financial_plan_expenses WHERE plan_id = $1 ORDER BY created_at ASC',
        [plan.id]
    );
    return { plan, expenseRows: expensesRes.rows };
}

// POST /api/planning/recalculate — read-only preview. Compares declared plan
// numbers against actual transaction history and returns the comparison;
// nothing is written to the database here.
router.post('/recalculate', async (req, res) => {
    try {
        const loaded = await loadPlanAndExpensesForUser(req.user.id);
        if (!loaded) {
            return res.status(404).json({ error: 'No financial plan found.' });
        }
        const { plan, expenseRows } = loaded;

        const report = await computeDriftReport(pool.query.bind(pool), req.user.id, plan, expenseRows);

        res.json({
            driftedExpenses: report.driftedExpenses,
            incomeDrift: report.incomeDrift,
            hasDrift: report.driftedExpenses.length > 0 || report.incomeDrift !== null,
        });
    } catch (err) {
        console.error('[Planning]', err.message);
        res.status(500).json({ error: 'Server error.' });
    }
});

// POST /api/planning/apply-recalculation — recomputes the drift report fresh
// server-side (never trusts a client-submitted payload for what to change),
// applies the actual-based values, and returns the refreshed plan.
router.post('/apply-recalculation', async (req, res) => {
    try {
        const loaded = await loadPlanAndExpensesForUser(req.user.id);
        if (!loaded) {
            return res.status(404).json({ error: 'No financial plan found.' });
        }
        const { plan, expenseRows } = loaded;

        const report = await computeDriftReport(pool.query.bind(pool), req.user.id, plan, expenseRows);

        if (report.driftedExpenses.length === 0 && report.incomeDrift === null) {
            return res.json(buildFullPlanResponse(plan, expenseRows));
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            for (const item of report.driftedExpenses) {
                await client.query(
                    'UPDATE financial_plan_expenses SET amount = $1 WHERE id = $2 AND plan_id = $3',
                    [item.actual_average, item.id, plan.id]
                );
            }

            let updatedPlan = plan;
            if (report.incomeDrift) {
                const updated = await client.query(
                    'UPDATE financial_plans SET monthly_income = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
                    [report.incomeDrift.actual_average, plan.id]
                );
                updatedPlan = updated.rows[0];
            }

            await client.query('COMMIT');

            const refreshedExpensesRes = await pool.query(
                'SELECT id, name, amount, category_id FROM financial_plan_expenses WHERE plan_id = $1 ORDER BY created_at ASC',
                [updatedPlan.id]
            );

            res.json(buildFullPlanResponse(updatedPlan, refreshedExpensesRes.rows));
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    } catch (err) {
        console.error('[Planning]', err.message);
        res.status(500).json({ error: 'Server error.' });
    }
});

const NARRATIVE_CACHE_MS = 24 * 60 * 60 * 1000; // 24 hours

const NARRATIVE_SYSTEM_PROMPT = `You are a financial planning assistant generating narrative text for an Indian personal finance app.
You will be given a fixed set of already-computed numbers and a fixed list of mutual funds.
Rules you must follow exactly:
- Only use the numbers given to you below. Never invent, estimate, or recalculate any figure yourself.
- Only mention fund names that appear in the supplied fund list. Never mention any other fund.
- Return STRICTLY valid JSON and nothing else — no markdown code fences, no commentary, no text outside the JSON object.
- The JSON object must contain exactly these three fields:
  "checklist": an array of 3 to 5 objects, each with a "title" (a few words) and a one-sentence "description",
  "allocation_rationale": one paragraph explaining why the portfolio is allocated this way, which may reference the specific supplied fund names,
  "five_year_summary": one paragraph in plain language summarizing the five-year trajectory.`;

// POST /api/planning/narrative — generates (or returns the cached) AI narrative
// for the user's plan. Reuses the shared aiComplete() router in utils/ai.js,
// which already has Groq -> Cerebras -> Gemini -> NIM failover, an 8s
// per-provider timeout, and markdown-fence/think-tag stripping built in.
router.post('/narrative', async (req, res) => {
    try {
        const planRes = await pool.query('SELECT * FROM financial_plans WHERE user_id = $1', [req.user.id]);
        if (planRes.rows.length === 0) {
            return res.status(404).json({ error: 'No financial plan found.' });
        }
        const plan = planRes.rows[0];

        const isFresh = plan.ai_narrative && plan.ai_narrative_generated_at &&
            (Date.now() - new Date(plan.ai_narrative_generated_at).getTime() < NARRATIVE_CACHE_MS);

        if (isFresh) {
            return res.json({ narrative: plan.ai_narrative, cached: true });
        }

        const expensesRes = await pool.query(
            'SELECT id, name, amount FROM financial_plan_expenses WHERE plan_id = $1 ORDER BY created_at ASC',
            [plan.id]
        );
        const expenseRows = expensesRes.rows;
        const inputs = planToSimulationInputs(plan, expenseRows);
        const { rows: projection } = simulateFinancialPlan(inputs);
        const recommendedFunds = getFundsForPlan(plan);
        const staticNarrative = buildStaticNarrative(plan, recommendedFunds, projection);

        const month1 = projection[0];
        const fixedExpenseTotal = expenseRows.reduce((sum, e) => sum + parseFloat(e.amount), 0);

        const context = {
            monthly_income: parseFloat(plan.monthly_income),
            total_fixed_expenses: fixedExpenseTotal,
            emergency_fund_target: inputs.emergencyFundTarget,
            emergency_fund_current_balance: parseFloat(plan.emergency_fund_current_balance),
            risk_profile: plan.risk_profile,
            current_monthly_sip: month1.sipContribution,
            goal: plan.goal_amount !== null
                ? { name: plan.goal_name, amount: parseFloat(plan.goal_amount), months_remaining: plan.goal_target_months }
                : null,
            loan_emi: plan.loan_principal !== null
                ? calculateLoanEMI(parseFloat(plan.loan_principal), parseFloat(plan.loan_annual_rate_pct), plan.loan_tenure_months)
                : null,
            recommended_funds: recommendedFunds.map(f => ({ name: f.name, plan_type: f.planType, platform: f.platform, role: f.role })),
        };

        const userPrompt = `Here is this user's financial plan data:\n${JSON.stringify(context, null, 2)}\n\nGenerate the JSON object described in your instructions using only this data.`;

        let narrative;
        try {
            const raw = await aiComplete('planning-narrative', [
                { role: 'system', content: NARRATIVE_SYSTEM_PROMPT },
                { role: 'user', content: userPrompt },
            ]);
            // aiComplete() already strips ```json fences via its normalize() step,
            // but strip again defensively in case a provider wraps output in a
            // fence variant that step doesn't catch (e.g. ```javascript).
            const cleaned = raw.replace(/```[a-z]*\n?/gi, '').replace(/```\n?/g, '').trim();
            const parsed = JSON.parse(cleaned);
            if (
                !Array.isArray(parsed.checklist) ||
                typeof parsed.allocation_rationale !== 'string' ||
                typeof parsed.five_year_summary !== 'string'
            ) {
                throw new Error('AI response missing one or more required fields.');
            }
            narrative = parsed;
        } catch (err) {
            console.error('[Planning] narrative generation failed, using static fallback:', err.message);
            narrative = staticNarrative;
        }

        await pool.query(
            'UPDATE financial_plans SET ai_narrative = $1::jsonb, ai_narrative_generated_at = NOW(), updated_at = NOW() WHERE id = $2',
            [JSON.stringify(narrative), plan.id]
        );

        res.json({ narrative, cached: false });
    } catch (err) {
        console.error('[Planning]', err.message);
        res.status(500).json({ error: 'Server error.' });
    }
});

// Core math primitive: month-by-month compound growth.
// Returns an array where index i (0-based) is the portfolio value at the end of month i+1.
// Resolves an EMI for a loan row, computing it if not stored.
function emiForLoan(loan) {
    if (loan.emi_amount) return parseFloat(loan.emi_amount);
    const monthlyRate = parseFloat(loan.interest_rate_pct) / 12 / 100;
    return calculateEMI(parseFloat(loan.outstanding_balance), monthlyRate, monthsRemainingForLoan(loan));
}

// Returns [start, end) date strings (YYYY-MM-DD) covering the last `n` full calendar months
// (i.e. excluding the current, in-progress month).
function lastNFullMonthsRange(n) {
    const now = new Date();
    const end = new Date(now.getFullYear(), now.getMonth(), 1);
    const start = new Date(now.getFullYear(), now.getMonth() - n, 1);
    return {
        start: start.toISOString().split('T')[0],
        end: end.toISOString().split('T')[0],
    };
}

function addMonthsToDate(date, months) {
    const d = new Date(date);
    d.setMonth(d.getMonth() + months);
    return d.toISOString().split('T')[0];
}

function classifyCashflowMonth(net_cashflow, income) {
    if (income <= 0) return net_cashflow >= 0 ? 'healthy' : 'at_risk';
    const ratio = net_cashflow / income;
    if (ratio > 0.2) return 'surplus';
    if (ratio >= 0) return 'healthy';
    if (ratio >= -0.1) return 'tight';
    return 'at_risk';
}

router.get('/cashflow', async (req, res) => {
    try {
        const { start, end } = lastNFullMonthsRange(3);

        const [incomeRes, expenseByCategoryRes, loansRes, recurringRes] = await Promise.all([
            pool.query(
                `SELECT COALESCE(SUM(amount), 0) AS total FROM transactions
                 WHERE user_id = $1 AND type = 'income' AND date >= $2 AND date < $3
                 AND ${nonSpendingExclusionSQL('transactions')}`,
                [req.user.id, start, end]
            ),
            pool.query(
                `SELECT c.name AS category, COALESCE(SUM(t.amount), 0) AS total
                 FROM transactions t LEFT JOIN categories c ON t.category_id = c.id
                 WHERE t.user_id = $1 AND t.type = 'expense' AND t.date >= $2 AND t.date < $3
                 AND ${nonSpendingExclusionSQL('t')}
                 GROUP BY c.name`,
                [req.user.id, start, end]
            ),
            pool.query(`SELECT * FROM loans WHERE user_id = $1 AND is_active = true`, [req.user.id]),
            pool.query(`SELECT * FROM recurring_transactions WHERE user_id = $1 AND is_active = true AND type = 'expense'`, [req.user.id]),
        ]);

        const average_monthly_income = parseFloat(incomeRes.rows[0].total) / 3;

        const average_monthly_expenses_by_category = {};
        let average_monthly_expenses = 0;
        for (const row of expenseByCategoryRes.rows) {
            const avg = parseFloat(row.total) / 3;
            average_monthly_expenses_by_category[row.category || 'Uncategorized'] = parseFloat(avg.toFixed(2));
            average_monthly_expenses += avg;
        }

        const loan_breakdown = loansRes.rows.map(loan => ({
            id: loan.id,
            name: loan.name,
            emi: parseFloat(emiForLoan(loan).toFixed(2)),
        }));
        const fixed_monthly_outflows = loan_breakdown.reduce((sum, loan) => sum + loan.emi, 0);

        const FREQ_TO_MONTHLY = { daily: 30.44, weekly: 4.345, monthly: 1 };
        const recurring_outflows = recurringRes.rows.reduce((sum, r) => {
            const multiplier = FREQ_TO_MONTHLY[r.frequency] || 1;
            return sum + parseFloat(r.amount) * multiplier;
        }, 0);

        const net_monthly_cashflow = average_monthly_income - average_monthly_expenses - fixed_monthly_outflows - recurring_outflows;

        const months = [];
        let running_balance = 0;
        let months_at_risk = 0;
        let months_surplus = 0;
        const now = new Date();

        for (let i = 1; i <= 12; i++) {
            const monthDate = new Date(now.getFullYear(), now.getMonth() + i, 1);
            const label = monthDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

            const fixed_outflows = fixed_monthly_outflows + recurring_outflows;
            const net_cashflow = net_monthly_cashflow;
            running_balance += net_cashflow;

            const status = classifyCashflowMonth(net_cashflow, average_monthly_income);
            if (status === 'at_risk') months_at_risk++;
            if (status === 'surplus') months_surplus++;

            months.push({
                month: label,
                projected_income: parseFloat(average_monthly_income.toFixed(2)),
                projected_expenses: parseFloat(average_monthly_expenses.toFixed(2)),
                fixed_outflows: parseFloat(fixed_outflows.toFixed(2)),
                net_cashflow: parseFloat(net_cashflow.toFixed(2)),
                running_balance: parseFloat(running_balance.toFixed(2)),
                status,
            });
        }

        const summary = {
            average_monthly_surplus: parseFloat(net_monthly_cashflow.toFixed(2)),
            total_projected_annual_income: parseFloat((average_monthly_income * 12).toFixed(2)),
            total_projected_annual_expenses: parseFloat(((average_monthly_expenses + fixed_monthly_outflows + recurring_outflows) * 12).toFixed(2)),
            months_at_risk,
            months_surplus,
        };

        res.json({
            months,
            summary,
            average_monthly_income: parseFloat(average_monthly_income.toFixed(2)),
            average_monthly_expenses: parseFloat(average_monthly_expenses.toFixed(2)),
            average_monthly_expenses_by_category,
            fixed_monthly_outflows: parseFloat(fixed_monthly_outflows.toFixed(2)),
            recurring_outflows: parseFloat(recurring_outflows.toFixed(2)),
            loan_breakdown,
        });
    } catch (err) {
        console.error('[Planning]', err.message);
        res.status(500).json({ error: 'Server error.' });
    }
});

// Formats a rupee amount using Indian Lakh/Crore shorthand, e.g. 3520000 -> "₹35.2L".
function formatIndianCurrency(value) {
    const abs = Math.abs(value);
    let formatted;
    if (abs >= 1e7) formatted = `${(value / 1e7).toFixed(2)}Cr`;
    else if (abs >= 1e5) formatted = `${(value / 1e5).toFixed(1)}L`;
    else formatted = value.toLocaleString('en-IN', { maximumFractionDigits: 0 });
    return `₹${formatted}`;
}

module.exports = router;
