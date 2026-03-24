const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const authMiddleware = require('../middleware/auth');

// GET /api/splits — list all splits for the user
router.get('/', authMiddleware, async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT * FROM expense_splits WHERE user_id = $1 ORDER BY date DESC, created_at DESC`,
            [req.user.id]
        );
        res.json({ splits: rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch splits' });
    }
});

// POST /api/splits — create a new split
router.post('/', authMiddleware, async (req, res) => {
    try {
        const { description, total_amount, participants, date } = req.body;
        if (!description || !total_amount || !participants || !Array.isArray(participants) || participants.length === 0) {
            return res.status(400).json({ error: 'description, total_amount, and participants are required' });
        }

        const splitCount = participants.length + 1; // +1 for the user
        const yourShare = parseFloat(total_amount) / splitCount;
        const splitDate = date || new Date().toISOString().split('T')[0];

        // Create a transaction for the user's share
        const txResult = await pool.query(
            `INSERT INTO transactions (user_id, type, amount, description, date)
             VALUES ($1, 'expense', $2, $3, $4) RETURNING id`,
            [req.user.id, yourShare.toFixed(2), description, splitDate]
        );
        const transactionId = txResult.rows[0].id;

        // Mark all participants as pending
        const participantsWithStatus = participants.map(p => ({
            name: p.name,
            share: yourShare.toFixed(2),
            settled: false,
        }));

        const { rows } = await pool.query(
            `INSERT INTO expense_splits (user_id, transaction_id, total_amount, description, split_count, your_share, participants, date)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
            [req.user.id, transactionId, parseFloat(total_amount).toFixed(2), description, splitCount, yourShare.toFixed(2), JSON.stringify(participantsWithStatus), splitDate]
        );

        res.status(201).json({ split: rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to create split' });
    }
});

// PATCH /api/splits/:id/settle/:participantIndex — mark one participant as settled
router.patch('/:id/settle/:index', authMiddleware, async (req, res) => {
    try {
        const { id, index } = req.params;
        const { rows } = await pool.query(
            `SELECT * FROM expense_splits WHERE id = $1 AND user_id = $2`,
            [id, req.user.id]
        );
        if (!rows.length) return res.status(404).json({ error: 'Split not found' });

        const split = rows[0];
        const participants = split.participants;
        const idx = parseInt(index);
        if (idx < 0 || idx >= participants.length) return res.status(400).json({ error: 'Invalid participant index' });

        participants[idx].settled = !participants[idx].settled;

        const { rows: updated } = await pool.query(
            `UPDATE expense_splits SET participants = $1 WHERE id = $2 AND user_id = $3 RETURNING *`,
            [JSON.stringify(participants), id, req.user.id]
        );
        res.json({ split: updated[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to update split' });
    }
});

// DELETE /api/splits/:id
router.delete('/:id', authMiddleware, async (req, res) => {
    try {
        const { rowCount } = await pool.query(
            `DELETE FROM expense_splits WHERE id = $1 AND user_id = $2`,
            [req.params.id, req.user.id]
        );
        if (!rowCount) return res.status(404).json({ error: 'Split not found' });
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to delete split' });
    }
});

module.exports = router;
