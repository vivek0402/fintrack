const express = require('express');
const pool = require('../db/pool');
const auth = require('../middleware/auth');
const { calculateEMI, monthsRemainingForLoan } = require('../utils/amortization');
const { isValidScenarioType, isValidRiskProfile, isPositiveNumber, isNonNegativeNumber } = require('../utils/validation');
const { simulateFinancialPlan, getFiveYearSummary, calculateEMI: calculateLoanEMI } = require('../services/planningEngine');
const { getFundsForPlan } = require('../services/fundCatalog');
const { aiComplete } = require('../utils/ai');
const { computeDriftReport } = require('../services/behaviorAnalysis');
const { fetchCreditCardsWithBalance, fetchTotalCreditCardOutstanding } = require('../utils/creditCardBalance');
const router = express.Router();

router.use(auth);

const MAX_SIM_MONTHS = 1200; // 100 years safety cap

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
function simulateGrowth(starting_principal, monthly_contribution, annual_return_pct, months) {
    const monthlyRate = annual_return_pct / 100 / 12;
    const series = [];
    let value = starting_principal;
    for (let m = 0; m < months; m++) {
        value = value * (1 + monthlyRate) + monthly_contribution;
        series.push(value);
    }
    return series;
}

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

async function computeCurrentNetWorth(userId) {
    const snapRes = await pool.query(
        `SELECT net_worth FROM net_worth_snapshots WHERE user_id = $1 ORDER BY snapshot_date DESC LIMIT 1`,
        [userId]
    );
    if (snapRes.rows.length > 0) {
        return parseFloat(snapRes.rows[0].net_worth);
    }

    const [bankRes, investRes, total_credit_outstanding, loanRes] = await Promise.all([
        pool.query(
            `SELECT COALESCE(SUM(
                COALESCE(a.starting_balance, 0)
                + COALESCE((SELECT SUM(t.amount) FROM transactions t WHERE t.account_id = a.id AND t.type = 'income' AND t.date >= COALESCE(a.balance_as_of, '1970-01-01')), 0)
                - COALESCE((SELECT SUM(t.amount) FROM transactions t WHERE t.account_id = a.id AND t.type = 'expense' AND t.date >= COALESCE(a.balance_as_of, '1970-01-01')), 0)
             ), 0) AS total
             FROM bank_accounts a WHERE a.user_id = $1`,
            [userId]
        ),
        pool.query(`SELECT COALESCE(SUM(units * current_nav_or_price), 0) AS total FROM investments WHERE user_id = $1`, [userId]),
        fetchTotalCreditCardOutstanding(pool, userId),
        pool.query(`SELECT COALESCE(SUM(outstanding_balance), 0) AS total FROM loans WHERE user_id = $1 AND is_active = true`, [userId]),
    ]);

    const total_assets = parseFloat(bankRes.rows[0].total) + parseFloat(investRes.rows[0].total);
    const total_liabilities = total_credit_outstanding + parseFloat(loanRes.rows[0].total);
    return total_assets - total_liabilities;
}

async function computeAverageMonthlyIncomeAndExpenses(userId) {
    const { start, end } = lastNFullMonthsRange(3);
    const result = await pool.query(
        `SELECT type, COALESCE(SUM(amount), 0) AS total FROM transactions
         WHERE user_id = $1 AND date >= $2 AND date < $3
         GROUP BY type`,
        [userId, start, end]
    );

    let income = 0, expenses = 0;
    for (const row of result.rows) {
        if (row.type === 'income') income = parseFloat(row.total);
        if (row.type === 'expense') expenses = parseFloat(row.total);
    }
    return { avg_income: income / 3, avg_expenses: expenses / 3 };
}

// month-count where series[i] first reaches or exceeds target. Returns null if never reached within series.
function monthsToReach(series, target) {
    for (let i = 0; i < series.length; i++) {
        if (series[i] >= target) return i + 1;
    }
    return null;
}

function addMonthsToDate(date, months) {
    const d = new Date(date);
    d.setMonth(d.getMonth() + months);
    return d.toISOString().split('T')[0];
}

router.post('/fire', async (req, res) => {
    try {
        const {
            monthly_expenses: bodyMonthlyExpenses,
            expected_annual_return_pct = 12,
            inflation_pct = 6,
            swr_pct = 4,
            extra_monthly_savings = 0,
        } = req.body || {};

        const { avg_income, avg_expenses } = await computeAverageMonthlyIncomeAndExpenses(req.user.id);

        const monthly_expenses = bodyMonthlyExpenses !== undefined && bodyMonthlyExpenses !== null
            ? parseFloat(bodyMonthlyExpenses)
            : avg_expenses;

        const current_net_worth = await computeCurrentNetWorth(req.user.id);

        const current_monthly_savings = avg_income - avg_expenses;
        const total_monthly_savings = current_monthly_savings + parseFloat(extra_monthly_savings);

        // Inflation-adjusted (real) annual return.
        const real_annual_return_pct = ((1 + expected_annual_return_pct / 100) / (1 + inflation_pct / 100) - 1) * 100;

        const annual_expenses = monthly_expenses * 12;
        const corpus_needed_real = annual_expenses / (swr_pct / 100);

        // Base scenario.
        const baseSeries = simulateGrowth(current_net_worth, total_monthly_savings, real_annual_return_pct, MAX_SIM_MONTHS);
        const baseMonths = monthsToReach(baseSeries, corpus_needed_real);

        // Step-up 10% scenario: monthly savings increase by 10% at the start of each year.
        function simulateStepUp(startingContribution) {
            const monthlyRate = real_annual_return_pct / 100 / 12;
            let value = current_net_worth;
            let contribution = startingContribution;
            for (let m = 1; m <= MAX_SIM_MONTHS; m++) {
                value = value * (1 + monthlyRate) + contribution;
                if (value >= corpus_needed_real) return m;
                if (m % 12 === 0) contribution *= 1.1;
            }
            return null;
        }
        const stepUpMonths = simulateStepUp(total_monthly_savings);

        // Extra ₹10,000/month scenario.
        const extraSeries = simulateGrowth(current_net_worth, total_monthly_savings + 10000, real_annual_return_pct, MAX_SIM_MONTHS);
        const extraMonths = monthsToReach(extraSeries, corpus_needed_real);

        function toYearsMonths(months) {
            if (months === null) return { years: null, months: null, total_months: null };
            return { years: Math.floor(months / 12), months: months % 12, total_months: months };
        }

        const years_to_fire = {
            base: toYearsMonths(baseMonths),
            step_up_10pct: toYearsMonths(stepUpMonths),
            extra_10k: toYearsMonths(extraMonths),
        };

        const fire_date = baseMonths !== null ? addMonthsToDate(new Date(), baseMonths) : null;

        const corpus_needed_nominal = baseMonths !== null
            ? corpus_needed_real * Math.pow(1 + inflation_pct / 100, baseMonths / 12)
            : null;

        // Savings targets: monthly savings (PMT) needed to FIRE in exactly N years.
        const monthlyRealRate = real_annual_return_pct / 100 / 12;
        function savingsTargetForYears(years) {
            const n = years * 12;
            const growthFactor = Math.pow(1 + monthlyRealRate, n);
            let pmt;
            if (monthlyRealRate === 0) {
                pmt = (corpus_needed_real - current_net_worth) / n;
            } else {
                pmt = (corpus_needed_real - current_net_worth * growthFactor) * monthlyRealRate / (growthFactor - 1);
            }
            return Math.max(0, parseFloat(pmt.toFixed(2)));
        }

        const savings_targets = {
            target_10yr: savingsTargetForYears(10),
            target_15yr: savingsTargetForYears(15),
            target_20yr: savingsTargetForYears(20),
        };

        // Portfolio growth projection (real terms), one entry per year.
        const projectionYears = (baseMonths !== null ? Math.ceil(baseMonths / 12) : 30) + 5;
        const portfolio_projection = [];
        for (let year = 1; year <= projectionYears; year++) {
            const idx = year * 12 - 1;
            const value = idx < baseSeries.length ? baseSeries[idx] : null;
            portfolio_projection.push({
                year,
                portfolio_value: value !== null ? parseFloat(value.toFixed(2)) : null,
            });
        }

        res.json({
            corpus_needed_real: parseFloat(corpus_needed_real.toFixed(2)),
            corpus_needed_nominal: corpus_needed_nominal !== null ? parseFloat(corpus_needed_nominal.toFixed(2)) : null,
            current_net_worth: parseFloat(current_net_worth.toFixed(2)),
            monthly_expenses: parseFloat(monthly_expenses.toFixed(2)),
            monthly_savings: parseFloat(total_monthly_savings.toFixed(2)),
            real_annual_return_pct: parseFloat(real_annual_return_pct.toFixed(3)),
            years_to_fire,
            fire_date,
            savings_targets,
            portfolio_projection,
        });
    } catch (err) {
        console.error('[Planning]', err.message);
        res.status(500).json({ error: 'Server error.' });
    }
});

router.post('/sip', async (req, res) => {
    try {
        const { mode, expected_annual_return_pct = 12, target_years } = req.body || {};

        if (mode !== 'goal_based' && mode !== 'growth_based') {
            return res.status(400).json({ error: "mode must be 'goal_based' or 'growth_based'." });
        }
        if (!target_years || target_years <= 0) {
            return res.status(400).json({ error: 'target_years is required and must be greater than 0.' });
        }

        const monthlyRate = expected_annual_return_pct / 100 / 12;
        const n = Math.round(target_years * 12);
        const growthFactor = Math.pow(1 + monthlyRate, n);

        const buildProjection = (sipAmount) => {
            const series = simulateGrowth(0, sipAmount, expected_annual_return_pct, n);
            const projection = [];
            for (let year = 1; year <= target_years; year++) {
                const idx = year * 12 - 1;
                const value = idx < series.length ? series[idx] : series[series.length - 1];
                projection.push({ year, portfolio_value: parseFloat(value.toFixed(2)) });
            }
            return projection;
        };

        if (mode === 'goal_based') {
            const { goal_amount } = req.body || {};
            if (!goal_amount || goal_amount <= 0) {
                return res.status(400).json({ error: 'goal_amount is required and must be greater than 0.' });
            }

            // Standard PMT formula for future value of an ordinary annuity.
            const sip_amount = monthlyRate === 0
                ? goal_amount / n
                : (goal_amount * monthlyRate) / (growthFactor - 1);

            // Step-up SIP (10% annual increase): binary search for starting amount.
            function stepUpCorpus(startSip) {
                let value = 0;
                let sip = startSip;
                for (let m = 1; m <= n; m++) {
                    value = value * (1 + monthlyRate) + sip;
                    if (m % 12 === 0) sip *= 1.1;
                }
                return value;
            }
            let lo = 0, hi = sip_amount;
            for (let i = 0; i < 100; i++) {
                const mid = (lo + hi) / 2;
                if (stepUpCorpus(mid) < goal_amount) lo = mid; else hi = mid;
            }
            const step_up_sip = parseFloat(((lo + hi) / 2).toFixed(2));

            // Lumpsum needed today: present value of the goal.
            const lumpsum_alternative = monthlyRate === 0
                ? goal_amount
                : goal_amount / growthFactor;

            const total_invested = sip_amount * n;
            const total_returns = goal_amount - total_invested;
            const wealth_ratio = parseFloat((goal_amount / total_invested).toFixed(2));

            res.json({
                mode,
                sip_amount: parseFloat(sip_amount.toFixed(2)),
                lumpsum_alternative: parseFloat(lumpsum_alternative.toFixed(2)),
                step_up_sip,
                total_invested: parseFloat(total_invested.toFixed(2)),
                total_returns: parseFloat(total_returns.toFixed(2)),
                wealth_ratio,
                projection: buildProjection(sip_amount),
            });
        } else {
            const { monthly_sip } = req.body || {};
            if (!monthly_sip || monthly_sip <= 0) {
                return res.status(400).json({ error: 'monthly_sip is required and must be greater than 0.' });
            }

            const corpus = monthlyRate === 0
                ? monthly_sip * n
                : monthly_sip * ((growthFactor - 1) / monthlyRate);

            const total_invested = monthly_sip * n;
            const total_returns = corpus - total_invested;
            const wealth_ratio = parseFloat((corpus / total_invested).toFixed(2));

            res.json({
                mode,
                corpus: parseFloat(corpus.toFixed(2)),
                total_invested: parseFloat(total_invested.toFixed(2)),
                total_returns: parseFloat(total_returns.toFixed(2)),
                wealth_ratio,
                projection: buildProjection(monthly_sip),
            });
        }
    } catch (err) {
        console.error('[Planning]', err.message);
        res.status(500).json({ error: 'Server error.' });
    }
});

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
                 AND NOT (COALESCE(tags, '{}') && ARRAY['transfer','credit_card_payment']::text[])`,
                [req.user.id, start, end]
            ),
            pool.query(
                `SELECT c.name AS category, COALESCE(SUM(t.amount), 0) AS total
                 FROM transactions t LEFT JOIN categories c ON t.category_id = c.id
                 WHERE t.user_id = $1 AND t.type = 'expense' AND t.date >= $2 AND t.date < $3
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

function classifyDti(pct) {
    if (pct < 20) return 'excellent';
    if (pct <= 35) return 'good';
    if (pct <= 50) return 'moderate';
    return 'risky';
}

// Formats a rupee amount using Indian Lakh/Crore shorthand, e.g. 3520000 -> "₹35.2L".
function formatIndianCurrency(value) {
    const abs = Math.abs(value);
    let formatted;
    if (abs >= 1e7) formatted = `${(value / 1e7).toFixed(2)}Cr`;
    else if (abs >= 1e5) formatted = `${(value / 1e5).toFixed(1)}L`;
    else formatted = value.toLocaleString('en-IN', { maximumFractionDigits: 0 });
    return `₹${formatted}`;
}

router.get('/scenarios', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, title, type, inputs_json, result_json, created_at, updated_at
             FROM scenarios WHERE user_id = $1 ORDER BY updated_at DESC`,
            [req.user.id]
        );
        res.json({ scenarios: result.rows });
    } catch (err) {
        console.error('[Planning]', err.message);
        res.status(500).json({ error: 'Server error.' });
    }
});

router.get('/scenarios/:id', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM scenarios WHERE id = $1', [req.params.id]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'Scenario not found.' });
        if (result.rows[0].user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden.' });
        res.json({ scenario: result.rows[0] });
    } catch (err) {
        console.error('[Planning]', err.message);
        res.status(500).json({ error: 'Server error.' });
    }
});

router.post('/scenarios', async (req, res) => {
    try {
        const { title, type, inputs_json, result_json } = req.body || {};
        if (!title || !type || !inputs_json) {
            return res.status(400).json({ error: 'title, type, and inputs_json are required.' });
        }
        if (!isValidScenarioType(type)) {
            return res.status(400).json({ error: 'type must be one of: investment_growth, loan_impact, expense_reduction, income_change.' });
        }
        if (typeof inputs_json !== 'object' || Array.isArray(inputs_json) || Object.keys(inputs_json).length === 0) {
            return res.status(400).json({ error: 'inputs_json must be a non-empty object.' });
        }

        const result = await pool.query(
            `INSERT INTO scenarios (user_id, title, type, inputs_json, result_json)
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [req.user.id, title, type, inputs_json, result_json || null]
        );
        res.status(201).json({ scenario: result.rows[0] });
    } catch (err) {
        console.error('[Planning]', err.message);
        res.status(500).json({ error: 'Server error.' });
    }
});

router.patch('/scenarios/:id', async (req, res) => {
    try {
        const existing = await pool.query('SELECT * FROM scenarios WHERE id = $1', [req.params.id]);
        if (existing.rows.length === 0) return res.status(404).json({ error: 'Scenario not found.' });
        if (existing.rows[0].user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden.' });

        const current = existing.rows[0];
        const { title, inputs_json, result_json } = req.body || {};

        if (inputs_json !== undefined && (typeof inputs_json !== 'object' || Array.isArray(inputs_json) || Object.keys(inputs_json).length === 0)) {
            return res.status(400).json({ error: 'inputs_json must be a non-empty object.' });
        }

        const result = await pool.query(
            `UPDATE scenarios SET
                title = $1,
                inputs_json = $2,
                result_json = $3,
                updated_at = NOW()
             WHERE id = $4 RETURNING *`,
            [
                title !== undefined ? title : current.title,
                inputs_json !== undefined ? inputs_json : current.inputs_json,
                result_json !== undefined ? result_json : current.result_json,
                req.params.id,
            ]
        );
        res.json({ scenario: result.rows[0] });
    } catch (err) {
        console.error('[Planning]', err.message);
        res.status(500).json({ error: 'Server error.' });
    }
});

router.delete('/scenarios/:id', async (req, res) => {
    try {
        const existing = await pool.query('SELECT user_id FROM scenarios WHERE id = $1', [req.params.id]);
        if (existing.rows.length === 0) return res.status(404).json({ error: 'Scenario not found.' });
        if (existing.rows[0].user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden.' });

        await pool.query('DELETE FROM scenarios WHERE id = $1', [req.params.id]);
        res.json({ message: 'Scenario deleted' });
    } catch (err) {
        console.error('[Planning]', err.message);
        res.status(500).json({ error: 'Server error.' });
    }
});

function buildYearlyProjection(series, years) {
    const projection = [];
    for (let year = 1; year <= years; year++) {
        const idx = year * 12 - 1;
        const value = idx < series.length ? series[idx] : series[series.length - 1];
        projection.push({ year, portfolio_value: parseFloat(value.toFixed(2)) });
    }
    return projection;
}

async function simulateInvestmentGrowth(req, inputs) {
    const { monthly_amount, annual_return_pct, years, initial_lumpsum = 0 } = inputs;

    if (!Number.isFinite(monthly_amount) || monthly_amount < 0)
        return { error: 'monthly_amount is required and must be a non-negative number.' };
    if (!Number.isFinite(annual_return_pct) || annual_return_pct <= 0 || annual_return_pct > 50)
        return { error: 'annual_return_pct is required and must be between 0 and 50.' };
    if (!Number.isFinite(years) || years < 1 || years > 40)
        return { error: 'years is required and must be between 1 and 40.' };

    const months = years * 12;
    const series = simulateGrowth(initial_lumpsum, monthly_amount, annual_return_pct, months);
    const corpus_at_end = series[series.length - 1];
    const total_invested = initial_lumpsum + monthly_amount * months;
    const total_returns = corpus_at_end - total_invested;
    const wealth_ratio = total_invested > 0 ? parseFloat((corpus_at_end / total_invested).toFixed(2)) : null;
    const projection = buildYearlyProjection(series, years);

    const summary_text = `Investing ₹${monthly_amount.toLocaleString('en-IN')}/month at ${annual_return_pct}% for ${years} years grows to ${formatIndianCurrency(corpus_at_end)}.`;

    return {
        corpus_at_end: parseFloat(corpus_at_end.toFixed(2)),
        total_invested: parseFloat(total_invested.toFixed(2)),
        total_returns: parseFloat(total_returns.toFixed(2)),
        wealth_ratio,
        projection,
        summary_text,
    };
}

async function simulateLoanImpact(req, inputs) {
    const { loan_amount, interest_rate_pct, tenure_months } = inputs;

    if (!Number.isFinite(loan_amount) || loan_amount <= 0)
        return { error: 'loan_amount is required and must be greater than 0.' };
    if (!Number.isFinite(interest_rate_pct) || interest_rate_pct <= 0 || interest_rate_pct > 50)
        return { error: 'interest_rate_pct is required and must be between 0 and 50.' };
    if (!Number.isFinite(tenure_months) || tenure_months <= 0 || tenure_months > 480)
        return { error: 'tenure_months is required and must be between 1 and 480.' };

    const monthlyRate = interest_rate_pct / 12 / 100;
    const emi_amount = calculateEMI(loan_amount, monthlyRate, tenure_months);
    const total_payable = emi_amount * tenure_months;
    const total_interest = total_payable - loan_amount;

    const now = new Date();
    const firstOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);

    const [incomeRes, loansRes, cards] = await Promise.all([
        pool.query(
            `SELECT COALESCE(SUM(amount), 0) AS total FROM transactions
             WHERE user_id = $1 AND type = 'income' AND date >= $2 AND date < $3
             AND NOT (COALESCE(tags, '{}') && ARRAY['transfer','credit_card_payment']::text[])`,
            [req.user.id, threeMonthsAgo.toISOString().split('T')[0], firstOfThisMonth.toISOString().split('T')[0]]
        ),
        pool.query('SELECT * FROM loans WHERE user_id = $1 AND is_active = true', [req.user.id]),
        fetchCreditCardsWithBalance(pool, req.user.id),
    ]);

    const monthly_income = parseFloat(incomeRes.rows[0].total) / 3;
    const monthly_loan_emi = loansRes.rows.reduce((sum, loan) => sum + emiForLoan(loan), 0);
    const monthly_credit_obligation = cards.reduce((sum, card) => sum + parseFloat(card.current_outstanding_balance) * 0.05, 0);
    const current_total_obligation = monthly_loan_emi + monthly_credit_obligation;

    const current_dti_pct = monthly_income > 0 ? parseFloat(((current_total_obligation / monthly_income) * 100).toFixed(1)) : 0;
    const new_dti_pct = monthly_income > 0 ? parseFloat((((current_total_obligation + emi_amount) / monthly_income) * 100).toFixed(1)) : 0;

    const current_status = classifyDti(current_dti_pct);
    const new_status = classifyDti(new_dti_pct);
    const dti_status_change = `${current_status} → ${new_status}`;

    const payoff_date = addMonthsToDate(now, tenure_months);

    const summary_text = `A ${formatIndianCurrency(loan_amount)} loan at ${interest_rate_pct}% over ${tenure_months} months adds an EMI of ${formatIndianCurrency(emi_amount)}, moving your DTI from ${current_dti_pct}% (${current_status}) to ${new_dti_pct}% (${new_status}).`;

    return {
        emi_amount: parseFloat(emi_amount.toFixed(2)),
        total_interest: parseFloat(total_interest.toFixed(2)),
        total_payable: parseFloat(total_payable.toFixed(2)),
        current_dti_pct,
        new_dti_pct,
        dti_status_change,
        payoff_date,
        summary_text,
    };
}

async function simulateExpenseReduction(req, inputs) {
    const {
        monthly_reduction_amount,
        redirect_to_investment = true,
        investment_return_pct = 12,
        years = 10,
    } = inputs;

    if (!Number.isFinite(monthly_reduction_amount) || monthly_reduction_amount <= 0)
        return { error: 'monthly_reduction_amount is required and must be greater than 0.' };
    if (!Number.isFinite(investment_return_pct) || investment_return_pct <= 0 || investment_return_pct > 50)
        return { error: 'investment_return_pct must be between 0 and 50.' };
    if (!Number.isFinite(years) || years < 1 || years > 40)
        return { error: 'years must be between 1 and 40.' };

    const monthly_savings = monthly_reduction_amount;
    const annual_savings = monthly_savings * 12;

    const result = {
        monthly_savings: parseFloat(monthly_savings.toFixed(2)),
        annual_savings: parseFloat(annual_savings.toFixed(2)),
    };

    if (redirect_to_investment) {
        const months = years * 12;
        const series = simulateGrowth(0, monthly_reduction_amount, investment_return_pct, months);
        const corpus_if_invested = series[series.length - 1];
        const total_invested = monthly_reduction_amount * months;
        const total_returns = corpus_if_invested - total_invested;

        result.corpus_if_invested = parseFloat(corpus_if_invested.toFixed(2));
        result.total_invested = parseFloat(total_invested.toFixed(2));
        result.total_returns = parseFloat(total_returns.toFixed(2));
        result.projection = buildYearlyProjection(series, years);
        result.summary_text = `Cutting ₹${monthly_reduction_amount.toLocaleString('en-IN')}/month and investing it at ${investment_return_pct}% for ${years} years grows to ${formatIndianCurrency(corpus_if_invested)}.`;
    } else {
        result.summary_text = `Cutting ₹${monthly_reduction_amount.toLocaleString('en-IN')}/month saves ${formatIndianCurrency(annual_savings)} per year.`;
    }

    return result;
}

async function simulateIncomeChange(req, inputs) {
    const {
        monthly_income_increase,
        effective_from_months = 0,
        savings_rate_of_increase_pct = 50,
        investment_return_pct = 12,
        years = 10,
    } = inputs;

    if (!Number.isFinite(monthly_income_increase) || monthly_income_increase <= 0)
        return { error: 'monthly_income_increase is required and must be greater than 0.' };
    if (!Number.isInteger(effective_from_months) || effective_from_months < 0)
        return { error: 'effective_from_months must be a non-negative integer.' };
    if (!Number.isFinite(savings_rate_of_increase_pct) || savings_rate_of_increase_pct < 0 || savings_rate_of_increase_pct > 100)
        return { error: 'savings_rate_of_increase_pct must be between 0 and 100.' };
    if (!Number.isFinite(investment_return_pct) || investment_return_pct <= 0 || investment_return_pct > 50)
        return { error: 'investment_return_pct must be between 0 and 50.' };
    if (!Number.isFinite(years) || years < 1 || years > 40)
        return { error: 'years must be between 1 and 40.' };

    const monthly_additional_savings = monthly_income_increase * (savings_rate_of_increase_pct / 100);
    const totalMonths = years * 12;
    const monthlyRate = investment_return_pct / 100 / 12;

    const series = [];
    let value = 0;
    for (let m = 1; m <= totalMonths; m++) {
        const contribution = m > effective_from_months ? monthly_additional_savings : 0;
        value = value * (1 + monthlyRate) + contribution;
        series.push(value);
    }

    const corpus_from_savings = series[series.length - 1];
    const contributingMonths = Math.max(0, totalMonths - effective_from_months);
    const total_invested = monthly_additional_savings * contributingMonths;
    const total_returns = corpus_from_savings - total_invested;
    const projection = buildYearlyProjection(series, years);

    const summary_text = `A ₹${monthly_income_increase.toLocaleString('en-IN')}/month income increase, with ${savings_rate_of_increase_pct}% invested at ${investment_return_pct}% starting in month ${effective_from_months + 1}, grows to ${formatIndianCurrency(corpus_from_savings)} over ${years} years.`;

    return {
        monthly_additional_savings: parseFloat(monthly_additional_savings.toFixed(2)),
        corpus_from_savings: parseFloat(corpus_from_savings.toFixed(2)),
        total_invested: parseFloat(total_invested.toFixed(2)),
        total_returns: parseFloat(total_returns.toFixed(2)),
        projection,
        summary_text,
    };
}

router.post('/scenarios/simulate', async (req, res) => {
    try {
        const { type, inputs } = req.body || {};
        if (!isValidScenarioType(type)) {
            return res.status(400).json({ error: 'type must be one of: investment_growth, loan_impact, expense_reduction, income_change.' });
        }
        if (!inputs || typeof inputs !== 'object' || Array.isArray(inputs)) {
            return res.status(400).json({ error: 'inputs is required and must be an object.' });
        }

        let result;
        switch (type) {
            case 'investment_growth':
                result = await simulateInvestmentGrowth(req, inputs);
                break;
            case 'loan_impact':
                result = await simulateLoanImpact(req, inputs);
                break;
            case 'expense_reduction':
                result = await simulateExpenseReduction(req, inputs);
                break;
            case 'income_change':
                result = await simulateIncomeChange(req, inputs);
                break;
        }

        if (result.error) return res.status(400).json({ error: result.error });

        res.json({ type, inputs, result });
    } catch (err) {
        console.error('[Planning]', err.message);
        res.status(500).json({ error: 'Server error.' });
    }
});

module.exports = router;
