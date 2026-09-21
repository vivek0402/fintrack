const express = require('express');
const router  = express.Router();
const crypto  = require('crypto');
const pool    = require('../db/pool');
const auth    = require('../middleware/auth');
const { isNonNegativeNumber, isPositiveNumber, isValidDateString } = require('../utils/validation');
const { fetchCreditCardsWithBalance, fetchCreditCardWithBalance, fetchCreditCardsWithCycleBreakdown } = require('../utils/creditCardBalance');
const { fetchCreditCardEmiWithBalance, buildEmiInstallmentSchedule } = require('../utils/creditCardEmi');
const { generateAmortization } = require('../utils/amortization');
const { istDateStr } = require('../utils/istDate');

router.use(auth);

// GET /api/credit-cards
router.get('/', async (req, res) => {
    try {
        const cards = await fetchCreditCardsWithCycleBreakdown(pool, req.user.id);
        res.json({ cards });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch credit cards' });
    }
});

// POST /api/credit-cards
router.post('/', async (req, res) => {
    try {
        const {
            bank_name, card_name,
            last_four           = null,
            credit_limit        = 0,
            outstanding_balance = 0,
            billing_date        = null,
            due_days            = 20,
            network             = 'Visa',
            color               = '#6366f1',
            interest_rate_pct   = null,
            balance_as_of       = null,
        } = req.body;

        if (!bank_name?.trim()) return res.status(400).json({ error: 'bank_name is required' });
        if (!card_name?.trim()) return res.status(400).json({ error: 'card_name is required' });
        if (!isNonNegativeNumber(credit_limit)) return res.status(400).json({ error: 'credit_limit must be >= 0' });
        if (!isNonNegativeNumber(outstanding_balance)) return res.status(400).json({ error: 'outstanding_balance must be >= 0' });
        if (!isNonNegativeNumber(due_days)) return res.status(400).json({ error: 'due_days must be >= 0' });
        if (interest_rate_pct !== null && !isNonNegativeNumber(interest_rate_pct)) return res.status(400).json({ error: 'interest_rate_pct must be >= 0' });

        const { rows } = await pool.query(
            `INSERT INTO credit_cards
                (user_id, bank_name, card_name, last_four, credit_limit, outstanding_balance, billing_date, due_days, network, color, interest_rate_pct, balance_as_of)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
             RETURNING *`,
            [req.user.id, bank_name.trim(), card_name.trim(), last_four || null,
             credit_limit, outstanding_balance, billing_date || null, due_days, network, color, interest_rate_pct, balance_as_of || null]
        );
        // current_outstanding_balance === outstanding_balance for a brand new card
        // (no transactions could reference it before it existed).
        res.status(201).json({ card: { ...rows[0], current_outstanding_balance: rows[0].outstanding_balance } });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to create credit card' });
    }
});

// PUT /api/credit-cards/:id
router.put('/:id', async (req, res) => {
    try {
        const { rows: existing } = await pool.query(
            `SELECT id FROM credit_cards WHERE id = $1 AND user_id = $2`,
            [req.params.id, req.user.id]
        );
        if (!existing.length) return res.status(404).json({ error: 'Card not found' });

        const {
            bank_name, card_name, last_four,
            credit_limit, outstanding_balance,
            billing_date, due_days, network, color,
            interest_rate_pct, balance_as_of,
        } = req.body;

        if (credit_limit !== undefined && !isNonNegativeNumber(credit_limit)) return res.status(400).json({ error: 'credit_limit must be >= 0' });
        if (outstanding_balance !== undefined && !isNonNegativeNumber(outstanding_balance)) return res.status(400).json({ error: 'outstanding_balance must be >= 0' });
        if (due_days !== undefined && !isNonNegativeNumber(due_days)) return res.status(400).json({ error: 'due_days must be >= 0' });
        if (interest_rate_pct !== undefined && interest_rate_pct !== null && !isNonNegativeNumber(interest_rate_pct)) return res.status(400).json({ error: 'interest_rate_pct must be >= 0' });

        // outstanding_balance is a baseline snapshot, not a live value (see
        // utils/creditCardBalance.js) -- when the client explicitly sends
        // balance_as_of (including null), that resets the snapshot date, same
        // "explicit key in body, even if null" convention accounts.js's PATCH
        // uses for bank_accounts.balance_as_of.
        const newBalanceAsOf = 'balance_as_of' in req.body ? (balance_as_of || null) : undefined;

        const { rows } = await pool.query(
            `UPDATE credit_cards SET
                bank_name           = COALESCE($1, bank_name),
                card_name           = COALESCE($2, card_name),
                last_four           = COALESCE($3, last_four),
                credit_limit        = COALESCE($4, credit_limit),
                outstanding_balance = COALESCE($5, outstanding_balance),
                billing_date        = COALESCE($6, billing_date),
                due_days            = COALESCE($7, due_days),
                network             = COALESCE($8, network),
                color               = COALESCE($9, color),
                interest_rate_pct   = COALESCE($10, interest_rate_pct),
                balance_as_of       = CASE WHEN $13::boolean THEN $14::date ELSE balance_as_of END,
                updated_at          = NOW()
             WHERE id = $11 AND user_id = $12
             RETURNING *`,
            [bank_name, card_name, last_four || null,
             credit_limit, outstanding_balance,
             billing_date || null, due_days, network, color, interest_rate_pct,
             req.params.id, req.user.id,
             newBalanceAsOf !== undefined, newBalanceAsOf]
        );

        const card = await fetchCreditCardWithBalance(pool, req.user.id, rows[0].id);
        res.json({ card });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to update credit card' });
    }
});

// DELETE /api/credit-cards/:id
router.delete('/:id', async (req, res) => {
    try {
        const { rowCount } = await pool.query(
            `DELETE FROM credit_cards WHERE id = $1 AND user_id = $2`,
            [req.params.id, req.user.id]
        );
        if (!rowCount) return res.status(404).json({ error: 'Card not found' });
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to delete credit card' });
    }
});

// POST /api/credit-cards/:id/pay -- record paying down a card's balance from a
// bank account. Atomic (unlike the existing two-call transfer flow): inserts
// both legs in one transaction, sharing a transfer_group_id so they can be
// deleted together later. The card-side leg is booked as type='expense' would
// be wrong -- it's type='income' with credit_card_id set, which is how
// utils/creditCardBalance.js's formula reduces what's owed.
router.post('/:id/pay', async (req, res) => {
    const { bank_account_id, amount, date, notes } = req.body;

    if (!isPositiveNumber(amount)) return res.status(400).json({ error: 'amount must be greater than 0' });
    if (!isValidDateString(date)) return res.status(400).json({ error: 'date is required (YYYY-MM-DD)' });
    if (!bank_account_id) return res.status(400).json({ error: 'bank_account_id is required' });

    const client = await pool.connect();
    try {
        const [cardCheck, bankCheck] = await Promise.all([
            client.query(`SELECT id, bank_name, card_name FROM credit_cards WHERE id = $1 AND user_id = $2`, [req.params.id, req.user.id]),
            client.query(`SELECT id, name FROM bank_accounts WHERE id = $1 AND user_id = $2`, [bank_account_id, req.user.id]),
        ]);
        // No explicit release() here -- the finally block below always runs,
        // including on these early returns, and releasing twice logs a pg error.
        if (!cardCheck.rows.length) return res.status(404).json({ error: 'Card not found' });
        if (!bankCheck.rows.length) return res.status(404).json({ error: 'Bank account not found' });
        const card = cardCheck.rows[0];
        const bank = bankCheck.rows[0];

        const transferGroupId = crypto.randomUUID();

        await client.query('BEGIN');
        const bankLeg = await client.query(
            `INSERT INTO transactions (user_id, type, amount, description, notes, tags, date, account_id, payment_method, transfer_group_id)
             VALUES ($1,'expense',$2,$3,$4,$5,$6,$7,'Net Banking',$8)
             RETURNING *`,
            [req.user.id, amount, `Payment to ${card.bank_name} ${card.card_name}`, notes || null, ['credit_card_payment'], date, bank_account_id, transferGroupId]
        );
        const cardLeg = await client.query(
            `INSERT INTO transactions (user_id, type, amount, description, notes, tags, date, credit_card_id, payment_method, transfer_group_id)
             VALUES ($1,'income',$2,$3,$4,$5,$6,$7,'Net Banking',$8)
             RETURNING *`,
            [req.user.id, amount, `Payment from ${bank.name}`, notes || null, ['credit_card_payment'], date, req.params.id, transferGroupId]
        );
        await client.query('COMMIT');

        const refreshedCard = await fetchCreditCardWithBalance(pool, req.user.id, req.params.id);
        res.status(201).json({ transactions: [bankLeg.rows[0], cardLeg.rows[0]], card: refreshedCard });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ error: 'Failed to record payment' });
    } finally {
        client.release();
    }
});

// POST /api/credit-cards/:id/convert-to-emi -- v1 scope is entry-time only:
// this creates a brand-new EMI purchase from scratch. It does NOT
// retroactively convert an already-posted transaction (that's deferred to a
// future v1.1). No full-price transaction is created here at all -- the
// purchase amount only ever appears gradually, via installment transactions
// a later task's cron posts as they come due. source_transaction_id is
// therefore always NULL in this flow.
router.post('/:id/convert-to-emi', async (req, res) => {
    const {
        description, amount, date, category_id = null,
        tenure_months, interest_rate_pct = 0, is_no_cost,
        processing_fee = null, markup_suspected = false, notes = null,
    } = req.body;

    if (typeof description !== 'string' || !description.trim()) return res.status(400).json({ error: 'description is required' });
    if (!isPositiveNumber(amount)) return res.status(400).json({ error: 'amount must be greater than 0' });
    if (!isValidDateString(date)) return res.status(400).json({ error: 'date is required (YYYY-MM-DD)' });
    // Accept a numeric string the same way isPositiveNumber does elsewhere in
    // this file, but also reject a non-integer value (6.5) -- tenure_months
    // is an INTEGER column, and a float slipping past this check would
    // either get silently truncated by Postgres or throw, neither of which
    // is a clean 400.
    if (!isPositiveNumber(tenure_months) || !Number.isInteger(parseFloat(tenure_months)))
        return res.status(400).json({ error: 'tenure_months must be a positive integer' });
    const tenureMonths = parseInt(tenure_months, 10);
    if (!isNonNegativeNumber(interest_rate_pct)) return res.status(400).json({ error: 'interest_rate_pct must be >= 0' });
    if (processing_fee !== null && !isNonNegativeNumber(processing_fee)) return res.status(400).json({ error: 'processing_fee must be >= 0' });

    // is_no_cost is derived from interest_rate_pct === 0 rather than trusted
    // as an independent client input -- letting the client assert "no cost"
    // on a plan the math would actually charge interest on (or vice versa)
    // would let the stored flag silently lie about what was charged. If the
    // client sends both, they must agree with each other; if it sends
    // neither or only interest_rate_pct, the derived value is used.
    const derivedIsNoCost = parseFloat(interest_rate_pct) === 0;
    if (is_no_cost !== undefined && Boolean(is_no_cost) !== derivedIsNoCost) {
        return res.status(400).json({ error: `is_no_cost (${is_no_cost}) is inconsistent with interest_rate_pct (${interest_rate_pct})` });
    }

    const client = await pool.connect();
    try {
        const cardCheck = await client.query(`SELECT id FROM credit_cards WHERE id = $1 AND user_id = $2`, [req.params.id, req.user.id]);
        // No explicit release() here -- the finally block below always runs,
        // including on these early returns, same convention as /pay above.
        if (!cardCheck.rows.length) return res.status(404).json({ error: 'Card not found' });

        // Same "shared default category (user_id IS NULL) OR this user's own
        // category" ownership check used in planning.js for
        // financial_plan_expenses.category_id -- deliberately kept identical
        // in shape after 4e394ad tightened that exact check.
        if (category_id) {
            const categoryCheck = await client.query(
                `SELECT id FROM categories WHERE id = $1 AND (user_id = $2 OR user_id IS NULL)`,
                [category_id, req.user.id]
            );
            if (!categoryCheck.rows.length) return res.status(400).json({ error: 'Invalid category_id.' });
        }

        // Anchor every downstream date computation (installment due dates,
        // the fee transaction's date) off the IST calendar date the purchase
        // actually falls on. `date` may arrive as a bare 'YYYY-MM-DD' or as a
        // full timestamp near the UTC/IST midnight boundary; routing it
        // through istDateStr (rather than slicing the string or doing raw
        // Date math) is exactly what istDate.js exists to make automatic --
        // see its header comment for the bug history this avoids.
        const purchaseDate = istDateStr(new Date(date));

        const principal = parseFloat(amount);
        const rate = parseFloat(interest_rate_pct);
        // generateAmortization is used for its principal/interest-component
        // math only -- buildEmiInstallmentSchedule (creditCardEmi.js) turns
        // it into IST-safe due-dated installment rows; see its comment for
        // why amortization.js itself is left untouched.
        const amortization = generateAmortization({
            outstanding_balance: principal,
            interest_rate_pct: rate,
            tenure_months_remaining: tenureMonths,
        });
        // Not reachable from this endpoint in practice: `invalid` only fires
        // when the EMI amount is <= the first month's interest accrual, and
        // this route never passes its own `emi_amount` override -- the only
        // way to trigger that -- so generateAmortization always derives the
        // EMI itself via calculateEMI(), which is mathematically guaranteed
        // to exceed one month's interest for any principal/rate/tenure > 0.
        // Kept as a guard (not deleted) in case that assumption ever changes.
        if (amortization.invalid) return res.status(400).json({ error: amortization.error });

        // Computed before BEGIN, and can throw (caught below, surfaced as a
        // clean 500) if the schedule length doesn't match tenureMonths --
        // that way a mismatch is caught before any row is written, not
        // discovered after a partial insert.
        const scheduleEntries = buildEmiInstallmentSchedule(amortization, purchaseDate, tenureMonths);

        await client.query('BEGIN');

        // The processing fee is a real one-time charge that hits the card
        // immediately -- it is NOT part of the EMI principal/schedule, so it
        // gets its own ordinary expense transaction rather than folding into
        // credit_card_emis.processing_fee silently.
        let feeTransaction = null;
        const fee = processing_fee !== null ? parseFloat(processing_fee) : 0;
        if (fee > 0) {
            const feeResult = await client.query(
                `INSERT INTO transactions (user_id, type, amount, description, notes, tags, date, credit_card_id, category_id)
                 VALUES ($1,'expense',$2,$3,$4,$5,$6,$7,$8)
                 RETURNING *`,
                [req.user.id, fee, `EMI processing fee - ${description.trim()}`, notes || null, ['credit_card_emi_fee'], purchaseDate, req.params.id, category_id || null]
            );
            feeTransaction = feeResult.rows[0];
        }

        const emiResult = await client.query(
            `INSERT INTO credit_card_emis
                (user_id, credit_card_id, source_transaction_id, description, purchase_date, category_id,
                 principal_amount, tenure_months, interest_rate_pct, is_no_cost, processing_fee, markup_suspected, notes)
             VALUES ($1,$2,NULL,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
             RETURNING *`,
            [req.user.id, req.params.id, description.trim(), purchaseDate, category_id || null,
             principal, tenureMonths, rate, derivedIsNoCost, processing_fee !== null ? fee : null, Boolean(markup_suspected), notes || null]
        );
        const emi = emiResult.rows[0];

        // posted_at/transaction_id stay NULL -- nothing posts until a later
        // task's cron does, as each installment comes due.
        const installmentRows = [];
        for (const entry of scheduleEntries) {
            const installmentResult = await client.query(
                `INSERT INTO credit_card_emi_installments
                    (emi_id, user_id, installment_number, due_date, amount, principal_component, interest_component, posted_at, transaction_id)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,NULL,NULL)
                 RETURNING *`,
                [emi.id, req.user.id, entry.installment_number, entry.due_date, entry.amount, entry.principal_component, entry.interest_component]
            );
            installmentRows.push(installmentResult.rows[0]);
        }

        await client.query('COMMIT');

        const refreshedEmi = await fetchCreditCardEmiWithBalance(pool, req.user.id, emi.id);
        res.status(201).json({ emi: refreshedEmi, installments: installmentRows, fee_transaction: feeTransaction });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ error: 'Failed to convert to EMI' });
    } finally {
        client.release();
    }
});

module.exports = router;
