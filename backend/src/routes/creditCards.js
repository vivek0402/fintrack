const express = require('express');
const router  = express.Router();
const pool    = require('../db/pool');
const auth    = require('../middleware/auth');
const { isNonNegativeNumber } = require('../utils/validation');

router.use(auth);

// GET /api/credit-cards
router.get('/', async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT * FROM credit_cards WHERE user_id = $1 ORDER BY created_at ASC`,
            [req.user.id]
        );
        res.json({ cards: rows });
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
        } = req.body;

        if (!bank_name?.trim()) return res.status(400).json({ error: 'bank_name is required' });
        if (!card_name?.trim()) return res.status(400).json({ error: 'card_name is required' });
        if (!isNonNegativeNumber(credit_limit)) return res.status(400).json({ error: 'credit_limit must be >= 0' });
        if (!isNonNegativeNumber(outstanding_balance)) return res.status(400).json({ error: 'outstanding_balance must be >= 0' });
        if (!isNonNegativeNumber(due_days)) return res.status(400).json({ error: 'due_days must be >= 0' });
        if (interest_rate_pct !== null && !isNonNegativeNumber(interest_rate_pct)) return res.status(400).json({ error: 'interest_rate_pct must be >= 0' });

        const { rows } = await pool.query(
            `INSERT INTO credit_cards
                (user_id, bank_name, card_name, last_four, credit_limit, outstanding_balance, billing_date, due_days, network, color, interest_rate_pct)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
             RETURNING *`,
            [req.user.id, bank_name.trim(), card_name.trim(), last_four || null,
             credit_limit, outstanding_balance, billing_date || null, due_days, network, color, interest_rate_pct]
        );
        res.status(201).json({ card: rows[0] });
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
            interest_rate_pct,
        } = req.body;

        if (credit_limit !== undefined && !isNonNegativeNumber(credit_limit)) return res.status(400).json({ error: 'credit_limit must be >= 0' });
        if (outstanding_balance !== undefined && !isNonNegativeNumber(outstanding_balance)) return res.status(400).json({ error: 'outstanding_balance must be >= 0' });
        if (due_days !== undefined && !isNonNegativeNumber(due_days)) return res.status(400).json({ error: 'due_days must be >= 0' });
        if (interest_rate_pct !== undefined && interest_rate_pct !== null && !isNonNegativeNumber(interest_rate_pct)) return res.status(400).json({ error: 'interest_rate_pct must be >= 0' });

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
                updated_at          = NOW()
             WHERE id = $11 AND user_id = $12
             RETURNING *`,
            [bank_name, card_name, last_four || null,
             credit_limit, outstanding_balance,
             billing_date || null, due_days, network, color, interest_rate_pct,
             req.params.id, req.user.id]
        );
        res.json({ card: rows[0] });
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

module.exports = router;
