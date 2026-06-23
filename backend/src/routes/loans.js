const express = require('express');
const pool = require('../db/pool');
const auth = require('../middleware/auth');
const { isPositiveNumber, isNonNegativeNumber, isValidDateString, isValidLoanType } = require('../utils/validation');
const { generateAmortization, monthsRemainingForLoan } = require('../utils/amortization');
const router = express.Router();

router.use(auth);

function withComputedFields(loan) {
    const result = generateAmortization({
        outstanding_balance: parseFloat(loan.outstanding_balance),
        interest_rate_pct: parseFloat(loan.interest_rate_pct),
        tenure_months_remaining: monthsRemainingForLoan(loan),
        emi_amount: loan.emi_amount ? parseFloat(loan.emi_amount) : null,
    });

    if (result.invalid) {
        return { ...loan, months_remaining: null, total_interest_remaining: null, amortization_error: result.error };
    }

    return {
        ...loan,
        months_remaining: result.summary.total_months,
        total_interest_remaining: result.summary.total_interest,
    };
}

router.get('/', async (req, res) => {
    try {
        const { active } = req.query;
        let query = 'SELECT * FROM loans WHERE user_id = $1';
        const params = [req.user.id];
        if (active === 'true') {
            query += ' AND is_active = true';
        }
        query += ' ORDER BY created_at DESC';

        const result = await pool.query(query, params);
        res.json({ loans: result.rows.map(withComputedFields) });
    } catch (err) {
        console.error('[Loans]', err.message);
        res.status(500).json({ error: 'Server error.' });
    }
});

router.post('/', async (req, res) => {
    try {
        const {
            name, type, principal_amount, disbursement_date, tenure_months, interest_rate_pct,
            outstanding_balance, emi_amount, bank_or_lender, account_number_last4, prepayment_penalty_pct, notes,
        } = req.body;

        if (!name || !type || principal_amount === undefined || !disbursement_date || tenure_months === undefined
            || interest_rate_pct === undefined || outstanding_balance === undefined) {
            return res.status(400).json({ error: 'name, type, principal_amount, disbursement_date, tenure_months, interest_rate_pct and outstanding_balance are required.' });
        }
        if (!isValidLoanType(type))
            return res.status(400).json({ error: 'Invalid loan type.' });
        if (!isPositiveNumber(principal_amount))
            return res.status(400).json({ error: 'principal_amount must be greater than 0.' });
        if (!isNonNegativeNumber(outstanding_balance))
            return res.status(400).json({ error: 'outstanding_balance must be 0 or greater.' });
        if (parseFloat(outstanding_balance) > parseFloat(principal_amount))
            return res.status(400).json({ error: 'outstanding_balance cannot exceed principal_amount.' });
        if (!(parseFloat(interest_rate_pct) > 0 && parseFloat(interest_rate_pct) <= 100))
            return res.status(400).json({ error: 'interest_rate_pct must be greater than 0 and at most 100.' });
        if (!Number.isFinite(parseInt(tenure_months)) || parseInt(tenure_months) <= 0)
            return res.status(400).json({ error: 'tenure_months must be greater than 0.' });
        if (!isValidDateString(disbursement_date))
            return res.status(400).json({ error: 'disbursement_date must be a valid date (YYYY-MM-DD).' });
        if (new Date(disbursement_date) > new Date())
            return res.status(400).json({ error: 'disbursement_date must be in the past.' });

        if (emi_amount !== undefined && emi_amount !== null) {
            if (!isPositiveNumber(emi_amount))
                return res.status(400).json({ error: 'emi_amount must be greater than 0.' });
            const monthlyRate = parseFloat(interest_rate_pct) / 12 / 100;
            const monthlyInterest = parseFloat(outstanding_balance) * monthlyRate;
            if (parseFloat(emi_amount) <= monthlyInterest)
                return res.status(400).json({ error: 'emi_amount must be greater than the monthly interest on the outstanding balance, otherwise the loan would never pay off.' });
        }

        const result = await pool.query(
            `INSERT INTO loans (user_id, name, type, principal_amount, disbursement_date, tenure_months, interest_rate_pct,
                                 emi_amount, outstanding_balance, bank_or_lender, account_number_last4, prepayment_penalty_pct, notes)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
            [req.user.id, name, type, principal_amount, disbursement_date, tenure_months, interest_rate_pct,
                emi_amount || null, outstanding_balance, bank_or_lender || null, account_number_last4 || null,
                prepayment_penalty_pct ?? 0, notes || null]
        );

        res.status(201).json({ loan: withComputedFields(result.rows[0]) });
    } catch (err) {
        console.error('[Loans]', err.message);
        res.status(500).json({ error: 'Server error.' });
    }
});

router.patch('/:id', async (req, res) => {
    try {
        const existing = await pool.query('SELECT * FROM loans WHERE id = $1', [req.params.id]);
        if (existing.rows.length === 0)
            return res.status(404).json({ error: 'Loan not found.' });
        if (existing.rows[0].user_id !== req.user.id)
            return res.status(403).json({ error: 'Forbidden.' });

        const { name, outstanding_balance, interest_rate_pct, emi_amount, bank_or_lender, notes, is_active } = req.body;

        if (outstanding_balance !== undefined && !isNonNegativeNumber(outstanding_balance))
            return res.status(400).json({ error: 'outstanding_balance must be 0 or greater.' });
        if (outstanding_balance !== undefined && parseFloat(outstanding_balance) > parseFloat(existing.rows[0].principal_amount))
            return res.status(400).json({ error: 'outstanding_balance cannot exceed principal_amount.' });
        if (interest_rate_pct !== undefined && !(parseFloat(interest_rate_pct) > 0 && parseFloat(interest_rate_pct) <= 100))
            return res.status(400).json({ error: 'interest_rate_pct must be greater than 0 and at most 100.' });
        if (emi_amount !== undefined && emi_amount !== null && !isPositiveNumber(emi_amount))
            return res.status(400).json({ error: 'emi_amount must be greater than 0.' });

        const result = await pool.query(
            `UPDATE loans SET
               name = COALESCE($1, name),
               outstanding_balance = COALESCE($2, outstanding_balance),
               interest_rate_pct = COALESCE($3, interest_rate_pct),
               emi_amount = COALESCE($4, emi_amount),
               bank_or_lender = COALESCE($5, bank_or_lender),
               notes = COALESCE($6, notes),
               is_active = COALESCE($7, is_active),
               updated_at = NOW()
             WHERE id = $8 AND user_id = $9 RETURNING *`,
            [name, outstanding_balance, interest_rate_pct, emi_amount, bank_or_lender, notes, is_active, req.params.id, req.user.id]
        );

        res.json({ loan: withComputedFields(result.rows[0]) });
    } catch (err) {
        console.error('[Loans]', err.message);
        res.status(500).json({ error: 'Server error.' });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        const existing = await pool.query('SELECT id, user_id FROM loans WHERE id = $1', [req.params.id]);
        if (existing.rows.length === 0)
            return res.status(404).json({ error: 'Loan not found.' });
        if (existing.rows[0].user_id !== req.user.id)
            return res.status(403).json({ error: 'Forbidden.' });

        await pool.query('UPDATE loans SET is_active = false, updated_at = NOW() WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
        res.json({ message: 'Loan marked as repaid' });
    } catch (err) {
        console.error('[Loans]', err.message);
        res.status(500).json({ error: 'Server error.' });
    }
});

router.get('/:id/amortization', async (req, res) => {
    try {
        const loanRes = await pool.query('SELECT * FROM loans WHERE id = $1', [req.params.id]);
        if (loanRes.rows.length === 0)
            return res.status(404).json({ error: 'Loan not found.' });
        if (loanRes.rows[0].user_id !== req.user.id)
            return res.status(403).json({ error: 'Forbidden.' });

        const loan = loanRes.rows[0];
        const prepaymentsRes = await pool.query(
            'SELECT amount, prepayment_date AS date FROM loan_prepayments WHERE loan_id = $1',
            [req.params.id]
        );

        const result = generateAmortization({
            outstanding_balance: parseFloat(loan.outstanding_balance),
            interest_rate_pct: parseFloat(loan.interest_rate_pct),
            tenure_months_remaining: monthsRemainingForLoan(loan),
            emi_amount: loan.emi_amount ? parseFloat(loan.emi_amount) : null,
            prepayments: prepaymentsRes.rows.map(p => ({ date: p.date, amount: parseFloat(p.amount) })),
        });

        if (result.invalid)
            return res.status(400).json({ error: result.error });

        res.json({ schedule: result.schedule, summary: result.summary });
    } catch (err) {
        console.error('[Loans]', err.message);
        res.status(500).json({ error: 'Server error.' });
    }
});

router.post('/:id/prepayments', async (req, res) => {
    try {
        const loanRes = await pool.query('SELECT * FROM loans WHERE id = $1', [req.params.id]);
        if (loanRes.rows.length === 0)
            return res.status(404).json({ error: 'Loan not found.' });
        if (loanRes.rows[0].user_id !== req.user.id)
            return res.status(403).json({ error: 'Forbidden.' });

        const loan = loanRes.rows[0];
        const { amount, prepayment_date, notes } = req.body;

        if (amount === undefined || !prepayment_date)
            return res.status(400).json({ error: 'amount and prepayment_date are required.' });
        if (!isPositiveNumber(amount))
            return res.status(400).json({ error: 'amount must be greater than 0.' });
        if (parseFloat(amount) > parseFloat(loan.outstanding_balance))
            return res.status(400).json({ error: 'amount cannot exceed the outstanding balance.' });
        if (!isValidDateString(prepayment_date))
            return res.status(400).json({ error: 'prepayment_date must be a valid date (YYYY-MM-DD).' });

        const outstanding = parseFloat(loan.outstanding_balance);
        const interestRate = parseFloat(loan.interest_rate_pct);
        const tenureRemaining = monthsRemainingForLoan(loan);
        const emi = loan.emi_amount ? parseFloat(loan.emi_amount) : null;

        const before = generateAmortization({
            outstanding_balance: outstanding,
            interest_rate_pct: interestRate,
            tenure_months_remaining: tenureRemaining,
            emi_amount: emi,
        });
        if (before.invalid)
            return res.status(400).json({ error: before.error });

        const after = generateAmortization({
            outstanding_balance: outstanding,
            interest_rate_pct: interestRate,
            tenure_months_remaining: tenureRemaining,
            emi_amount: emi,
            prepayments: [{ date: prepayment_date, amount: parseFloat(amount) }],
        });
        if (after.invalid)
            return res.status(400).json({ error: after.error });

        const months_saved = before.summary.total_months - after.summary.total_months;
        const interest_saved = parseFloat((before.summary.total_interest - after.summary.total_interest).toFixed(2));

        // The amount > outstanding_balance check above reads a value fetched at the
        // top of this handler — under concurrent requests that's stale. Make the
        // decrement itself the authoritative check (atomic, race-proof) inside a
        // transaction, so two simultaneous prepayments can't both pass a check
        // against the same stale balance and drive it negative.
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const decremented = await client.query(
                `UPDATE loans SET outstanding_balance = outstanding_balance - $1, updated_at = NOW()
                 WHERE id = $2 AND user_id = $3 AND outstanding_balance >= $1
                 RETURNING outstanding_balance`,
                [amount, req.params.id, req.user.id]
            );

            if (decremented.rowCount === 0) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: 'amount cannot exceed the outstanding balance.' });
            }

            const inserted = await client.query(
                `INSERT INTO loan_prepayments (loan_id, user_id, amount, prepayment_date, months_saved, interest_saved, notes)
                 VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
                [req.params.id, req.user.id, amount, prepayment_date, months_saved, interest_saved, notes || null]
            );

            await client.query('COMMIT');
            res.status(201).json({ prepayment: inserted.rows[0] });
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    } catch (err) {
        console.error('[Loans]', err.message);
        res.status(500).json({ error: 'Server error.' });
    }
});

router.get('/:id/prepayments', async (req, res) => {
    try {
        const loanRes = await pool.query('SELECT id, user_id FROM loans WHERE id = $1', [req.params.id]);
        if (loanRes.rows.length === 0)
            return res.status(404).json({ error: 'Loan not found.' });
        if (loanRes.rows[0].user_id !== req.user.id)
            return res.status(403).json({ error: 'Forbidden.' });

        const result = await pool.query(
            'SELECT * FROM loan_prepayments WHERE loan_id = $1 ORDER BY prepayment_date DESC',
            [req.params.id]
        );
        res.json({ prepayments: result.rows });
    } catch (err) {
        console.error('[Loans]', err.message);
        res.status(500).json({ error: 'Server error.' });
    }
});

module.exports = router;
