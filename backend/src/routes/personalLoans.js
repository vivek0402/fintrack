const express = require('express');
const pool = require('../db/pool');
const auth = require('../middleware/auth');
const { isPositiveNumber, isValidDateString, isValidPersonalLoanDirection, isValidPersonalLoanInterestType } = require('../utils/validation');
const { fetchPersonalLoansWithBalance, fetchPersonalLoanWithBalance } = require('../utils/personalLoans');
const router = express.Router();

router.use(auth);

router.get('/', async (req, res) => {
    try {
        const loans = await fetchPersonalLoansWithBalance(pool, req.user.id);
        res.json({ loans });
    } catch (err) {
        console.error('[PersonalLoans]', err.message);
        res.status(500).json({ error: 'Server error.' });
    }
});

router.get('/:id', async (req, res) => {
    try {
        const loan = await fetchPersonalLoanWithBalance(pool, req.user.id, req.params.id);
        if (!loan) return res.status(404).json({ error: 'Loan not found.' });
        const { rows: repayments } = await pool.query(
            'SELECT * FROM personal_loan_repayments WHERE loan_id = $1 ORDER BY date DESC, created_at DESC',
            [req.params.id]
        );
        res.json({ loan, repayments });
    } catch (err) {
        console.error('[PersonalLoans]', err.message);
        res.status(500).json({ error: 'Server error.' });
    }
});

router.post('/', async (req, res) => {
    try {
        const { direction, counterparty_name, principal_amount, account_id, date_given, due_date, interest_type, interest_rate, notes } = req.body;
        if (!direction || !counterparty_name || !principal_amount || !date_given)
            return res.status(400).json({ error: 'Direction, counterparty name, amount and date are required.' });
        if (!isValidPersonalLoanDirection(direction))
            return res.status(400).json({ error: "Direction must be 'lent' or 'borrowed'." });
        if (!isPositiveNumber(principal_amount))
            return res.status(400).json({ error: 'Amount must be a positive number.' });
        if (!isValidDateString(date_given))
            return res.status(400).json({ error: 'Date given must be a valid date (YYYY-MM-DD).' });
        if (due_date && !isValidDateString(due_date))
            return res.status(400).json({ error: 'Due date must be a valid date (YYYY-MM-DD).' });
        if (interest_type && !isValidPersonalLoanInterestType(interest_type))
            return res.status(400).json({ error: "Interest type must be 'none', 'flat' or 'percent_per_month'." });
        // The interest_rate CHECK constraints on personal_loans (added after this
        // plan was first drafted) would otherwise turn a bad request into an
        // unhandled DB error -- validate the same rule here so it's a clean 400.
        if (interest_type && interest_type !== 'none' && !isPositiveNumber(interest_rate))
            return res.status(400).json({ error: 'Interest rate is required and must be a positive number when an interest type other than none is selected.' });
        if (account_id) {
            const { rows: acctCheck } = await pool.query(
                'SELECT id FROM bank_accounts WHERE id = $1 AND user_id = $2',
                [account_id, req.user.id]
            );
            if (!acctCheck.length) return res.status(400).json({ error: 'Invalid account_id.' });
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const loanResult = await client.query(
                `INSERT INTO personal_loans
                    (user_id, direction, counterparty_name, principal_amount, account_id, date_given, due_date, interest_type, interest_rate, notes)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
                [req.user.id, direction, counterparty_name.trim(), principal_amount, account_id || null, date_given, due_date || null,
                 interest_type || 'none', (interest_type && interest_type !== 'none') ? interest_rate : null, notes || null]
            );
            let loan = loanResult.rows[0];

            if (account_id) {
                const txType = direction === 'lent' ? 'expense' : 'income';
                const description = direction === 'lent' ? `Lent to ${counterparty_name.trim()}` : `Borrowed from ${counterparty_name.trim()}`;
                const txResult = await client.query(
                    `INSERT INTO transactions (user_id, type, amount, description, date, account_id, personal_loan_id)
                     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
                    [req.user.id, txType, principal_amount, description, date_given, account_id, loan.id]
                );
                const updateResult = await client.query(
                    'UPDATE personal_loans SET transaction_id = $1 WHERE id = $2 RETURNING *',
                    [txResult.rows[0].id, loan.id]
                );
                loan = updateResult.rows[0];
            }

            await client.query('COMMIT');
            res.status(201).json({
                loan: { ...loan, repaid_amount: 0, outstanding_amount: parseFloat(loan.principal_amount), status: 'outstanding' },
            });
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    } catch (err) {
        console.error('[PersonalLoans]', err.message);
        res.status(500).json({ error: 'Server error.' });
    }
});

module.exports = router;
