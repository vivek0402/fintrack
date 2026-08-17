const express = require('express');
const router  = express.Router();
const crypto  = require('crypto');
const pool    = require('../db/pool');
const auth    = require('../middleware/auth');
const { isNonNegativeNumber, isPositiveNumber, isValidDateString } = require('../utils/validation');
const { fetchCreditCardsWithBalance, fetchCreditCardWithBalance, fetchCreditCardsWithCycleBreakdown } = require('../utils/creditCardBalance');

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

module.exports = router;
