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
        COALESCE(a.starting_balance, 0)
            + COALESCE(SUM(CASE WHEN t.type = 'income'  THEN t.amount ELSE 0 END), 0)
            - COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount ELSE 0 END), 0)
            AS current_balance
    FROM bank_accounts a
    LEFT JOIN transactions t
        ON t.account_id = a.id
        AND t.user_id = a.user_id
        AND t.date >= COALESCE(a.balance_as_of, '1970-01-01')
    WHERE a.user_id = $1
    GROUP BY a.id
    ORDER BY a.created_at ASC
`;

const STATS_SINGLE_QUERY = `
    SELECT a.*,
        COALESCE(SUM(CASE WHEN t.type = 'income'  THEN t.amount ELSE 0 END), 0) AS total_income,
        COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount ELSE 0 END), 0) AS total_expenses,
        COUNT(t.id) AS transaction_count,
        COALESCE(a.starting_balance, 0)
            + COALESCE(SUM(CASE WHEN t.type = 'income'  THEN t.amount ELSE 0 END), 0)
            - COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount ELSE 0 END), 0)
            AS current_balance
    FROM bank_accounts a
    LEFT JOIN transactions t
        ON t.account_id = a.id
        AND t.user_id = a.user_id
        AND t.date >= COALESCE(a.balance_as_of, '1970-01-01')
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
        const { name, icon = '🏦', color = '#3b82f6', starting_balance = 0, is_default = false, balance_as_of = null, account_type = 'Savings', last_four = null } = req.body;
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
                `INSERT INTO bank_accounts (user_id, name, icon, color, starting_balance, is_default, balance_as_of, account_type, last_four)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
                [req.user.id, name.trim(), icon, color, starting_balance, is_default, balance_as_of || null, account_type, last_four || null]
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
        const { name, icon, color, starting_balance, is_default, balance_as_of, account_type, last_four } = req.body;
        const { rows: existing } = await pool.query(
            `SELECT id FROM bank_accounts WHERE id = $1 AND user_id = $2`,
            [req.params.id, req.user.id]
        );
        if (!existing.length) return res.status(404).json({ error: 'Account not found' });

        let linkedCount = 0;
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            if (is_default === true) {
                await client.query(
                    `UPDATE bank_accounts SET is_default = FALSE WHERE user_id = $1`,
                    [req.user.id]
                );
            }
            // balance_as_of: if explicitly sent in request body (including null), use it; otherwise keep existing
            const newBalanceAsOf = 'balance_as_of' in req.body ? (balance_as_of || null) : undefined;
            await client.query(
                `UPDATE bank_accounts SET
                    name             = COALESCE($1, name),
                    icon             = COALESCE($2, icon),
                    color            = COALESCE($3, color),
                    starting_balance = COALESCE($4, starting_balance),
                    is_default       = COALESCE($5, is_default),
                    balance_as_of    = CASE WHEN $6::boolean THEN $7::date ELSE balance_as_of END,
                    account_type     = COALESCE($10, account_type),
                    last_four        = COALESCE($11, last_four),
                    updated_at       = NOW()
                 WHERE id = $8 AND user_id = $9`,
                [name, icon, color, starting_balance, is_default,
                 newBalanceAsOf !== undefined, newBalanceAsOf,
                 req.params.id, req.user.id,
                 account_type || null, last_four || null]
            );
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
                `UPDATE bank_accounts SET is_default = TRUE, updated_at = NOW() WHERE id = $1 AND user_id = $2`,
                [req.params.id, req.user.id]
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
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(
            `UPDATE transactions SET account_id = NULL WHERE account_id = $1 AND user_id = $2`,
            [req.params.id, req.user.id]
        );
        const { rowCount } = await client.query(
            `DELETE FROM bank_accounts WHERE id = $1 AND user_id = $2`,
            [req.params.id, req.user.id]
        );
        if (!rowCount) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Account not found' });
        }
        await client.query('COMMIT');
        res.json({ success: true });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ error: 'Failed to delete account' });
    } finally {
        client.release();
    }
});

module.exports = router;
