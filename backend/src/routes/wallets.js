const express = require('express');
const router  = express.Router();
const pool    = require('../db/pool');
const auth    = require('../middleware/auth');

router.use(auth);

// GET /api/wallets
router.get('/', async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT * FROM wallets WHERE user_id = $1 ORDER BY created_at ASC`,
            [req.user.id]
        );
        res.json({ wallets: rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch wallets' });
    }
});

// POST /api/wallets
router.post('/', async (req, res) => {
    try {
        const { name, emoji = '👛', balance = 0 } = req.body;
        if (!name?.trim()) return res.status(400).json({ error: 'name is required' });

        const { rows } = await pool.query(
            `INSERT INTO wallets (user_id, name, emoji, balance)
             VALUES ($1,$2,$3,$4) RETURNING *`,
            [req.user.id, name.trim(), emoji, balance]
        );
        res.status(201).json({ wallet: rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to create wallet' });
    }
});

// PUT /api/wallets/:id
router.put('/:id', async (req, res) => {
    try {
        const { rows: existing } = await pool.query(
            `SELECT id FROM wallets WHERE id = $1 AND user_id = $2`,
            [req.params.id, req.user.id]
        );
        if (!existing.length) return res.status(404).json({ error: 'Wallet not found' });

        const { name, emoji, balance } = req.body;

        const { rows } = await pool.query(
            `UPDATE wallets SET
                name       = COALESCE($1, name),
                emoji      = COALESCE($2, emoji),
                balance    = COALESCE($3, balance),
                updated_at = NOW()
             WHERE id = $4 AND user_id = $5
             RETURNING *`,
            [name, emoji, balance, req.params.id, req.user.id]
        );
        res.json({ wallet: rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to update wallet' });
    }
});

// DELETE /api/wallets/:id
router.delete('/:id', async (req, res) => {
    try {
        const { rowCount } = await pool.query(
            `DELETE FROM wallets WHERE id = $1 AND user_id = $2`,
            [req.params.id, req.user.id]
        );
        if (!rowCount) return res.status(404).json({ error: 'Wallet not found' });
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to delete wallet' });
    }
});

module.exports = router;
