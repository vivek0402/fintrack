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
        if (typeof counterparty_name !== 'string' || !counterparty_name.trim())
            return res.status(400).json({ error: 'Counterparty name must be a non-empty string.' });
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
            const freshLoan = await fetchPersonalLoanWithBalance(pool, req.user.id, loan.id);
            res.status(201).json({ loan: freshLoan });
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

// principal_amount, direction and account_id are immutable after creation --
// changing them would require reconciling the linked transaction, the same
// class of complexity transactions.js's own PUT handler deliberately avoids
// for investment- and goal-linked rows.
router.patch('/:id', async (req, res) => {
    try {
        const { counterparty_name, due_date, interest_type, interest_rate, notes } = req.body;
        if (due_date !== undefined && due_date !== null && !isValidDateString(due_date))
            return res.status(400).json({ error: 'Due date must be a valid date (YYYY-MM-DD).' });
        if (interest_type !== undefined && !isValidPersonalLoanInterestType(interest_type))
            return res.status(400).json({ error: "Interest type must be 'none', 'flat' or 'percent_per_month'." });

        // interest_type and interest_rate are coupled by a DB CHECK constraint
        // (a positive rate is required unless the type is 'none'). Whenever
        // either is being touched, fetch the current row and validate the
        // *resulting* combination here -- otherwise a bad request either
        // surfaces as a raw constraint violation, or (going back to 'none')
        // silently leaves a stale rate on a loan that claims to have none.
        if (interest_type !== undefined || interest_rate !== undefined) {
            const { rows: currentRows } = await pool.query(
                'SELECT interest_type, interest_rate FROM personal_loans WHERE id = $1 AND user_id = $2',
                [req.params.id, req.user.id]
            );
            if (!currentRows.length) return res.status(404).json({ error: 'Loan not found.' });
            const effectiveType = interest_type !== undefined ? interest_type : currentRows[0].interest_type;
            const effectiveRate = effectiveType === 'none'
                ? null
                : (interest_rate !== undefined ? interest_rate : currentRows[0].interest_rate);
            if (effectiveType !== 'none' && !isPositiveNumber(effectiveRate))
                return res.status(400).json({ error: 'Interest rate is required and must be a positive number when an interest type other than none is selected.' });
        }

        const result = await pool.query(
            `UPDATE personal_loans SET
                counterparty_name = COALESCE($1, counterparty_name),
                due_date = CASE WHEN $6::boolean THEN NULL ELSE COALESCE($2, due_date) END,
                interest_type = COALESCE($3, interest_type),
                interest_rate = CASE WHEN $3::text = 'none' THEN NULL ELSE COALESCE($4, interest_rate) END,
                notes = COALESCE($5, notes),
                updated_at = NOW()
             WHERE id = $7 AND user_id = $8 RETURNING id`,
            [(typeof counterparty_name === 'string' && counterparty_name.trim()) || null, due_date || null, interest_type || null, interest_rate ?? null, notes || null,
             'due_date' in req.body && req.body.due_date === null, req.params.id, req.user.id]
        );
        if (!result.rows.length) return res.status(404).json({ error: 'Loan not found.' });

        const loan = await fetchPersonalLoanWithBalance(pool, req.user.id, req.params.id);
        res.json({ loan });
    } catch (err) {
        console.error('[PersonalLoans]', err.message);
        res.status(500).json({ error: 'Server error.' });
    }
});

router.post('/:id/repayments', async (req, res) => {
    try {
        const { amount, date, notes, account_id } = req.body;
        if (!amount || !date) return res.status(400).json({ error: 'Amount and date are required.' });
        if (!isPositiveNumber(amount)) return res.status(400).json({ error: 'Amount must be a positive number.' });
        if (!isValidDateString(date)) return res.status(400).json({ error: 'Date must be a valid date (YYYY-MM-DD).' });

        const loan = await fetchPersonalLoanWithBalance(pool, req.user.id, req.params.id);
        if (!loan) return res.status(404).json({ error: 'Loan not found.' });
        if (loan.status === 'written_off') return res.status(400).json({ error: 'Cannot record a repayment on a written-off loan.' });
        if (parseFloat(amount) > parseFloat(loan.outstanding_amount) + 0.01)
            return res.status(400).json({ error: `Amount exceeds the outstanding balance of ${loan.outstanding_amount}.` });

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

            let transactionId = null;
            if (account_id) {
                const txType = loan.direction === 'lent' ? 'income' : 'expense';
                const description = loan.direction === 'lent'
                    ? `Repayment from ${loan.counterparty_name}`
                    : `Repayment to ${loan.counterparty_name}`;
                const txResult = await client.query(
                    `INSERT INTO transactions (user_id, type, amount, description, date, account_id, personal_loan_id)
                     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
                    [req.user.id, txType, amount, description, date, account_id, loan.id]
                );
                transactionId = txResult.rows[0].id;
            }

            const repaymentResult = await client.query(
                `INSERT INTO personal_loan_repayments (loan_id, user_id, amount, date, notes, transaction_id)
                 VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
                [loan.id, req.user.id, amount, date, notes || null, transactionId]
            );

            await client.query('COMMIT');

            const updatedLoan = await fetchPersonalLoanWithBalance(pool, req.user.id, req.params.id);
            res.status(201).json({ repayment: repaymentResult.rows[0], loan: updatedLoan });
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

router.patch('/:id/write-off', async (req, res) => {
    try {
        const result = await pool.query(
            `UPDATE personal_loans SET written_off_at = NOW(), updated_at = NOW()
             WHERE id = $1 AND user_id = $2 AND written_off_at IS NULL RETURNING id`,
            [req.params.id, req.user.id]
        );
        if (!result.rows.length) return res.status(404).json({ error: 'Loan not found or already written off.' });

        const loan = await fetchPersonalLoanWithBalance(pool, req.user.id, req.params.id);
        res.json({ loan });
    } catch (err) {
        console.error('[PersonalLoans]', err.message);
        res.status(500).json({ error: 'Server error.' });
    }
});

// Deleting a loan explicitly deletes its linked transaction(s) too, rather
// than leaving them orphaned with personal_loan_id set NULL by the FK -- an
// orphaned "Lent to Priya" expense would otherwise start counting as a real
// ₹5,000 expense the moment it's no longer loan-linked.
//
// Note: the reverse direction (deleting the linked transaction itself via
// the generic /api/transactions/:id route) is NOT specially handled -- the
// loan's own balance math never depends on the transaction row (it's always
// principal minus repayments), so nothing breaks except the account balance
// and transaction history quietly losing that entry. Same tradeoff this
// codebase already accepts for investment- and goal-linked transactions.
// Deliberate.
router.delete('/:id', async (req, res) => {
    try {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            const { rows: repayments } = await client.query(
                'SELECT transaction_id FROM personal_loan_repayments WHERE loan_id = $1',
                [req.params.id]
            );
            const { rows: loanRows } = await client.query(
                'SELECT transaction_id FROM personal_loans WHERE id = $1 AND user_id = $2',
                [req.params.id, req.user.id]
            );
            if (!loanRows.length) {
                await client.query('ROLLBACK');
                return res.status(404).json({ error: 'Loan not found.' });
            }

            const txIds = [loanRows[0].transaction_id, ...repayments.map(r => r.transaction_id)].filter(Boolean);
            if (txIds.length) {
                await client.query('DELETE FROM transactions WHERE id = ANY($1::uuid[]) AND user_id = $2', [txIds, req.user.id]);
            }

            await client.query('DELETE FROM personal_loans WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);

            await client.query('COMMIT');
            res.json({ message: 'Deleted.' });
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
