const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const auth = require('../middleware/auth');

router.use(auth);

const STATS_QUERY = `
    SELECT a.*,
        COALESCE(SUM(CASE WHEN t.type = 'income'  THEN t.amount ELSE 0 END), 0) AS total_income,
        COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount ELSE 0 END), 0) AS total_expenses,
        COUNT(t.id) AS transaction_count,
        a.starting_balance
            + COALESCE(SUM(CASE WHEN t.type = 'income'  THEN t.amount ELSE 0 END), 0)
            - COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount ELSE 0 END), 0)
            AS current_balance
    FROM bank_accounts a
    LEFT JOIN transactions t ON t.account_id = a.id AND t.user_id = $1
        AND (a.balance_as_of IS NULL OR t.date >= a.balance_as_of)
    WHERE a.user_id = $1
    GROUP BY a.id
    ORDER BY a.created_at ASC
`;

const STATS_SINGLE_QUERY = `
    SELECT a.*,
        COALESCE(SUM(CASE WHEN t.type = 'income'  THEN t.amount ELSE 0 END), 0) AS total_income,
        COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount ELSE 0 END), 0) AS total_expenses,
        COUNT(t.id) AS transaction_count,
        a.starting_balance
            + COALESCE(SUM(CASE WHEN t.type = 'income'  THEN t.amount ELSE 0 END), 0)
            - COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount ELSE 0 END), 0)
            AS current_balance
    FROM bank_accounts a
    LEFT JOIN transactions t ON t.account_id = a.id AND t.user_id = $1
        AND (a.balance_as_of IS NULL OR t.date >= a.balance_as_of)
    WHERE a.user_id = $1 AND a.id = $2
    GROUP BY a.id
`;

// GET /api/accounts
router.get('/', async (req, res) => {
    try {
        const { rows } = await pool.query(STATS_QUERY, [req.user.id]);
        res.json({ accounts: rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch accounts' });
    }
});

// POST /api/accounts
router.post('/', async (req, res) => {
    try {
        const { name, icon = '🏦', color = '#3b82f6', starting_balance = 0, is_default = false, balance_as_of = null } = req.body;
        if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' });

        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            if (is_default) {
                await client.query(
                    `UPDATE bank_accounts SET is_default = FALSE WHERE user_id = $1`,
                    [req.user.id]
                );
            }
            const { rows } = await client.query(
                `INSERT INTO bank_accounts (user_id, name, icon, color, starting_balance, is_default, balance_as_of)
                 VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
                [req.user.id, name.trim(), icon, color, starting_balance, is_default, balance_as_of || null]
            );
            let linkedCount = 0;
            if (is_default) {
                const linked = await client.query(
                    `UPDATE transactions SET account_id = $1 WHERE user_id = $2 AND account_id IS NULL`,
                    [rows[0].id, req.user.id]
                );
                linkedCount = linked.rowCount;
            }
            await client.query('COMMIT');
            res.status(201).json({ account: rows[0], transactions_linked: linkedCount });
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to create account' });
    }
});

// PATCH /api/accounts/:id
router.patch('/:id', async (req, res) => {
    try {
        const { name, icon, color, starting_balance, is_default, balance_as_of } = req.body;
        const { rows: existing } = await pool.query(
            `SELECT id FROM bank_accounts WHERE id = $1 AND user_id = $2`,
            [req.params.id, req.user.id]
        );
        if (!existing.length) return res.status(404).json({ error: 'Account not found' });

        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            if (is_default === true) {
                await client.query(
                    `UPDATE bank_accounts SET is_default = FALSE WHERE user_id = $1`,
                    [req.user.id]
                );
            }
            await client.query(
                `UPDATE bank_accounts SET
                    name             = COALESCE($1, name),
                    icon             = COALESCE($2, icon),
                    color            = COALESCE($3, color),
                    starting_balance = COALESCE($4, starting_balance),
                    is_default       = COALESCE($5, is_default),
                    balance_as_of    = COALESCE($6, balance_as_of),
                    updated_at       = NOW()
                 WHERE id = $7 AND user_id = $8`,
                [name, icon, color, starting_balance, is_default, balance_as_of || null, req.params.id, req.user.id]
            );
            let linkedCount = 0;
            if (is_default === true) {
                const linked = await client.query(
                    `UPDATE transactions SET account_id = $1 WHERE user_id = $2 AND account_id IS NULL`,
                    [req.params.id, req.user.id]
                );
                linkedCount = linked.rowCount;
            }
            await client.query('COMMIT');
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }

        const { rows } = await pool.query(STATS_SINGLE_QUERY, [req.user.id, req.params.id]);
        res.json({ account: rows[0], transactions_linked: linkedCount });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to update account' });
    }
});

// PATCH /api/accounts/:id/set-default
router.patch('/:id/set-default', async (req, res) => {
    try {
        const { rows: existing } = await pool.query(
            `SELECT id FROM bank_accounts WHERE id = $1 AND user_id = $2`,
            [req.params.id, req.user.id]
        );
        if (!existing.length) return res.status(404).json({ error: 'Account not found' });

        let linkedCount = 0;
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await client.query(
                `UPDATE bank_accounts SET is_default = FALSE WHERE user_id = $1`,
                [req.user.id]
            );
            await client.query(
                `UPDATE bank_accounts SET is_default = TRUE, updated_at = NOW() WHERE id = $1`,
                [req.params.id]
            );
            const linked = await client.query(
                `UPDATE transactions SET account_id = $1 WHERE user_id = $2 AND account_id IS NULL`,
                [req.params.id, req.user.id]
            );
            linkedCount = linked.rowCount;
            await client.query('COMMIT');
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }

        res.json({ success: true, transactions_linked: linkedCount });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to set default account' });
    }
});

// DELETE /api/accounts/:id
router.delete('/:id', async (req, res) => {
    try {
        // Unlink transactions before deleting
        await pool.query(
            `UPDATE transactions SET account_id = NULL WHERE account_id = $1 AND user_id = $2`,
            [req.params.id, req.user.id]
        );
        const { rowCount } = await pool.query(
            `DELETE FROM bank_accounts WHERE id = $1 AND user_id = $2`,
            [req.params.id, req.user.id]
        );
        if (!rowCount) return res.status(404).json({ error: 'Account not found' });
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to delete account' });
    }
});

module.exports = router;
