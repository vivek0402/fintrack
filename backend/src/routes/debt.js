const express = require('express');
const pool = require('../db/pool');
const auth = require('../middleware/auth');
const { isPositiveNumber } = require('../utils/validation');
const { calculateEMI, generateAmortization, monthsRemainingForLoan } = require('../utils/amortization');
const { fetchCreditCardsWithBalance, fetchCreditCardsWithCycleBreakdown } = require('../utils/creditCardBalance');
const router = express.Router();

router.use(auth);

const MAX_SIM_MONTHS = 1200; // 100 years safety cap

// Resolves an EMI for a loan row, computing it if not stored.
function emiForLoan(loan) {
    if (loan.emi_amount) return parseFloat(loan.emi_amount);
    const monthlyRate = parseFloat(loan.interest_rate_pct) / 12 / 100;
    return calculateEMI(parseFloat(loan.outstanding_balance), monthlyRate, monthsRemainingForLoan(loan));
}

// Month-by-month cascade simulation: pays minimum EMI on every loan, throws
// extraPayment plus any freed-up EMIs at the loan that's first in `order`.
function simulateCascade(loans, extraPayment, order) {
    const sim = order.map(l => ({
        id: l.id,
        name: l.name,
        balance: l.balance,
        monthlyRate: l.monthlyRate,
        emi: l.emi,
        paid: false,
    }));

    let month = 0;
    let totalInterest = 0;
    const payoff_sequence = [];

    while (sim.some(l => l.balance > 0) && month < MAX_SIM_MONTHS) {
        month++;
        const freedUp = sim.filter(l => l.paid).reduce((s, l) => s + l.emi, 0);
        const availableExtra = extraPayment + freedUp;
        const targetIdx = sim.findIndex(l => l.balance > 0);

        for (let i = 0; i < sim.length; i++) {
            const l = sim[i];
            if (l.balance <= 0) continue;
            const interest = l.balance * l.monthlyRate;
            totalInterest += interest;
            let payment = l.emi;
            if (i === targetIdx) payment += availableExtra;
            let principal = payment - interest;
            if (principal > l.balance) principal = l.balance;
            l.balance -= principal;
            if (l.balance <= 0.005) {
                l.balance = 0;
                if (!l.paid) {
                    l.paid = true;
                    payoff_sequence.push({ loan_id: l.id, name: l.name, payoff_month: month });
                }
            }
        }
    }

    return {
        months: month,
        total_interest: parseFloat(totalInterest.toFixed(2)),
        payoff_sequence,
    };
}

router.get('/payoff-optimizer', async (req, res) => {
    try {
        const extra_monthly_payment = req.query.extra_monthly_payment
            ? parseFloat(req.query.extra_monthly_payment)
            : 0;

        const result = await pool.query(
            'SELECT * FROM loans WHERE user_id = $1 AND is_active = true',
            [req.user.id]
        );

        if (result.rows.length === 0) {
            return res.json({
                loans: [],
                message: 'No active loans found. Add a loan to use the payoff optimizer.',
            });
        }

        const loans = result.rows.map(loan => ({
            id: loan.id,
            name: loan.name,
            balance: parseFloat(loan.outstanding_balance),
            interest_rate_pct: parseFloat(loan.interest_rate_pct),
            monthlyRate: parseFloat(loan.interest_rate_pct) / 12 / 100,
            emi: emiForLoan(loan),
        }));

        // Baseline: minimum EMIs only, no cascading of freed-up payments.
        let baseline_total_interest = 0;
        let baseline_months = 0;
        for (const loan of loans) {
            const r = generateAmortization({
                outstanding_balance: loan.balance,
                interest_rate_pct: loan.interest_rate_pct,
                tenure_months_remaining: Math.max(Math.ceil(loan.balance / loan.emi) + 1, 1),
                emi_amount: loan.emi,
            });
            if (r.invalid) continue;
            baseline_total_interest += r.summary.total_interest;
            baseline_months = Math.max(baseline_months, r.summary.total_months);
        }
        baseline_total_interest = parseFloat(baseline_total_interest.toFixed(2));

        const avalancheOrder = [...loans].sort((a, b) => b.interest_rate_pct - a.interest_rate_pct);
        const snowballOrder = [...loans].sort((a, b) => a.balance - b.balance);

        const avalanche = simulateCascade(loans, extra_monthly_payment, avalancheOrder);
        const snowball = simulateCascade(loans, extra_monthly_payment, snowballOrder);

        const avalanche_interest_saved = parseFloat((baseline_total_interest - avalanche.total_interest).toFixed(2));
        const snowball_interest_saved = parseFloat((baseline_total_interest - snowball.total_interest).toFixed(2));

        let recommendation;
        if (avalanche.total_interest < snowball.total_interest) {
            const diff = parseFloat((snowball.total_interest - avalanche.total_interest).toFixed(2));
            recommendation = `The avalanche method (highest interest rate first) saves you ₹${diff.toLocaleString('en-IN', { maximumFractionDigits: 0 })} more in interest than the snowball method.`;
        } else if (snowball.total_interest < avalanche.total_interest) {
            const diff = parseFloat((avalanche.total_interest - snowball.total_interest).toFixed(2));
            recommendation = `The snowball method (smallest balance first) saves you ₹${diff.toLocaleString('en-IN', { maximumFractionDigits: 0 })} more in interest than the avalanche method.`;
        } else {
            recommendation = 'Both strategies result in the same total interest for your current loans.';
        }

        res.json({
            baseline: {
                months: baseline_months,
                total_interest: baseline_total_interest,
            },
            avalanche: {
                months: avalanche.months,
                total_interest: avalanche.total_interest,
                interest_saved: avalanche_interest_saved,
                payoff_sequence: avalanche.payoff_sequence,
            },
            snowball: {
                months: snowball.months,
                total_interest: snowball.total_interest,
                interest_saved: snowball_interest_saved,
                payoff_sequence: snowball.payoff_sequence,
            },
            recommendation,
        });
    } catch (err) {
        console.error('[Debt]', err.message);
        res.status(500).json({ error: 'Server error.' });
    }
});

router.get('/prepayment-impact', async (req, res) => {
    try {
        const { loan_id, prepayment_amount } = req.query;
        if (!loan_id || prepayment_amount === undefined)
            return res.status(400).json({ error: 'loan_id and prepayment_amount are required.' });
        if (!isPositiveNumber(prepayment_amount))
            return res.status(400).json({ error: 'prepayment_amount must be greater than 0.' });

        const loanRes = await pool.query('SELECT * FROM loans WHERE id = $1', [loan_id]);
        if (loanRes.rows.length === 0)
            return res.status(404).json({ error: 'Loan not found.' });
        if (loanRes.rows[0].user_id !== req.user.id)
            return res.status(403).json({ error: 'Forbidden.' });

        const loan = loanRes.rows[0];
        const prepaymentsRes = await pool.query(
            'SELECT amount, prepayment_date AS date FROM loan_prepayments WHERE loan_id = $1',
            [loan_id]
        );
        const existingPrepayments = prepaymentsRes.rows.map(p => ({ date: p.date, amount: parseFloat(p.amount) }));

        const outstanding = parseFloat(loan.outstanding_balance);
        const interestRate = parseFloat(loan.interest_rate_pct);
        const tenureRemaining = monthsRemainingForLoan(loan);
        const emi = loan.emi_amount ? parseFloat(loan.emi_amount) : null;

        const before = generateAmortization({
            outstanding_balance: outstanding,
            interest_rate_pct: interestRate,
            tenure_months_remaining: tenureRemaining,
            emi_amount: emi,
            prepayments: existingPrepayments,
        });
        if (before.invalid)
            return res.status(400).json({ error: before.error });

        const today = new Date().toISOString().split('T')[0];
        const after = generateAmortization({
            outstanding_balance: outstanding,
            interest_rate_pct: interestRate,
            tenure_months_remaining: tenureRemaining,
            emi_amount: emi,
            prepayments: [...existingPrepayments, { date: today, amount: parseFloat(prepayment_amount) }],
        });
        if (after.invalid)
            return res.status(400).json({ error: after.error });

        const months_saved = before.summary.total_months - after.summary.total_months;
        const interest_saved = parseFloat((before.summary.total_interest - after.summary.total_interest).toFixed(2));

        const penalty_pct = parseFloat(loan.prepayment_penalty_pct || 0);
        const penalty_amount = penalty_pct > 0
            ? parseFloat((parseFloat(prepayment_amount) * (penalty_pct / 100)).toFixed(2))
            : 0;
        const net_savings = parseFloat((interest_saved - penalty_amount).toFixed(2));

        let recommendation;
        if (penalty_amount > 0) {
            recommendation = `The prepayment penalty of ₹${penalty_amount.toLocaleString('en-IN', { maximumFractionDigits: 0 })} reduces your net savings to ₹${net_savings.toLocaleString('en-IN', { maximumFractionDigits: 0 })}.`;
        } else {
            recommendation = `This prepayment saves you ₹${interest_saved.toLocaleString('en-IN', { maximumFractionDigits: 0 })} in interest over ${months_saved} month${months_saved !== 1 ? 's' : ''}.`;
        }

        res.json({
            months_saved,
            interest_saved,
            penalty_amount,
            net_savings,
            old_payoff_date: before.summary.payoff_date,
            new_payoff_date: after.summary.payoff_date,
            recommendation,
        });
    } catch (err) {
        console.error('[Debt]', err.message);
        res.status(500).json({ error: 'Server error.' });
    }
});

function classifyUtilization(pct) {
    if (pct < 30) return 'optimal';
    if (pct < 50) return 'moderate';
    if (pct < 75) return 'high';
    return 'critical';
}

// Canonical credit-utilization calculation -- also used by agents.js's
// debt_coach persona (fetchDebtCoachData) so the two surfaces can't drift
// into reporting different utilization numbers for the same cards.
async function computeCreditUtilization(userId) {
    const cards = await fetchCreditCardsWithBalance(pool, userId);

    const per_card = cards.map(card => {
        const outstanding = parseFloat(card.current_outstanding_balance);
        const limit = parseFloat(card.credit_limit);
        const utilization_pct = limit > 0 ? parseFloat(((outstanding / limit) * 100).toFixed(1)) : 0;
        return {
            id: card.id,
            name: card.card_name,
            bank_name: card.bank_name,
            last4: card.last_four,
            outstanding_balance: outstanding,
            credit_limit: limit,
            utilization_pct,
            status: classifyUtilization(utilization_pct),
        };
    });

    const total_outstanding = parseFloat(per_card.reduce((s, c) => s + c.outstanding_balance, 0).toFixed(2));
    const total_limit = parseFloat(per_card.reduce((s, c) => s + c.credit_limit, 0).toFixed(2));
    const overall_utilization_pct = total_limit > 0
        ? parseFloat(((total_outstanding / total_limit) * 100).toFixed(1))
        : 0;
    const status = classifyUtilization(overall_utilization_pct);

    let recommendation = null;
    if (overall_utilization_pct > 30) {
        const worstCard = [...per_card].sort((a, b) => b.utilization_pct - a.utilization_pct)[0];
        if (worstCard) {
            const targetBalance = worstCard.credit_limit * 0.3;
            const paydownAmount = parseFloat((worstCard.outstanding_balance - targetBalance).toFixed(2));
            if (paydownAmount > 0) {
                recommendation = `Paying down your ${worstCard.name} by ₹${paydownAmount.toLocaleString('en-IN', { maximumFractionDigits: 0 })} would bring its utilization below 30%.`;
            }
        }
    }

    return {
        per_card,
        aggregate: { total_outstanding, total_limit, overall_utilization_pct, status },
        recommendation,
    };
}

router.get('/credit-utilization', async (req, res) => {
    try {
        res.json(await computeCreditUtilization(req.user.id));
    } catch (err) {
        console.error('[Debt]', err.message);
        res.status(500).json({ error: 'Server error.' });
    }
});

function classifyDti(pct) {
    if (pct < 20) return 'excellent';
    if (pct <= 35) return 'good';
    if (pct <= 50) return 'moderate';
    return 'risky';
}

// Canonical DTI calculation -- also used by agents.js's debt_coach persona.
// Same 3-month trailing income window as before this was extracted.
// Minimum payment is 5% of the card's statement balance (what's actually
// billed as of the last cycle close) when a billing_date is set, so it
// doesn't count today's unbilled swipes; cards with no billing_date fall
// back to 5% of current_outstanding_balance, unchanged from before.
async function computeDtiBreakdown(userId) {
    const now = new Date();
    const firstOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);

    const [incomeRes, loansRes, cards] = await Promise.all([
        pool.query(
            `SELECT COALESCE(SUM(amount), 0) AS total FROM transactions
             WHERE user_id = $1 AND type = 'income' AND date >= $2 AND date < $3
             AND NOT (COALESCE(tags, '{}') && ARRAY['transfer','credit_card_payment']::text[])`,
            [userId, threeMonthsAgo.toISOString().split('T')[0], firstOfThisMonth.toISOString().split('T')[0]]
        ),
        pool.query('SELECT * FROM loans WHERE user_id = $1 AND is_active = true', [userId]),
        fetchCreditCardsWithCycleBreakdown(pool, userId),
    ]);

    const monthly_income = parseFloat((parseFloat(incomeRes.rows[0].total) / 3).toFixed(2));

    const breakdown_loans = loansRes.rows.map(loan => ({
        id: loan.id,
        name: loan.name,
        emi: parseFloat(emiForLoan(loan).toFixed(2)),
    }));
    const monthly_loan_emi = parseFloat(breakdown_loans.reduce((s, l) => s + l.emi, 0).toFixed(2));

    const breakdown_cards = cards.map(card => {
        const minPaymentBasis = card.statement_balance != null
            ? parseFloat(card.statement_balance)
            : parseFloat(card.current_outstanding_balance);
        return {
            id: card.id,
            name: card.card_name,
            minimum_payment: parseFloat((minPaymentBasis * 0.05).toFixed(2)),
        };
    });
    const monthly_credit_obligation = parseFloat(breakdown_cards.reduce((s, c) => s + c.minimum_payment, 0).toFixed(2));

    const total_monthly_debt_obligation = parseFloat((monthly_loan_emi + monthly_credit_obligation).toFixed(2));
    const dti_ratio = monthly_income > 0
        ? parseFloat(((total_monthly_debt_obligation / monthly_income) * 100).toFixed(1))
        : 0;

    return {
        monthly_income,
        monthly_loan_emi,
        monthly_credit_obligation,
        total_monthly_debt_obligation,
        dti_ratio,
        status: classifyDti(dti_ratio),
        breakdown_loans,
        breakdown_cards,
    };
}

router.get('/dti', async (req, res) => {
    try {
        res.json(await computeDtiBreakdown(req.user.id));
    } catch (err) {
        console.error('[Debt]', err.message);
        res.status(500).json({ error: 'Server error.' });
    }
});

module.exports = router;
module.exports.computeCreditUtilization = computeCreditUtilization;
module.exports.computeDtiBreakdown = computeDtiBreakdown;
