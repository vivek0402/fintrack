const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const authMiddleware = require('../middleware/auth');
const { isPositiveNumber } = require('../utils/validation');

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
        if (!description || !participants || !Array.isArray(participants) || participants.length === 0) {
            return res.status(400).json({ error: 'description, total_amount, and participants are required' });
        }
        if (!isPositiveNumber(total_amount)) {
            return res.status(400).json({ error: 'total_amount must be greater than 0' });
        }

        const splitCount = participants.length + 1; // +1 for the user
        const total = parseFloat(total_amount);
        // Give each participant an equal rounded share; absorb any rounding remainder into the user's share
        const participantShare = Math.round((total / splitCount) * 100) / 100;
        const yourShare = Math.round((total - participants.length * participantShare) * 100) / 100;
        const splitDate = date || new Date().toISOString().split('T')[0];

        // Create a transaction for the user's share
        const txResult = await pool.query(
            `INSERT INTO transactions (user_id, type, amount, description, date)
             VALUES ($1, 'expense', $2, $3, $4) RETURNING id`,
            [req.user.id, yourShare, description, splitDate]
        );
        const transactionId = txResult.rows[0].id;

        // Mark all participants as pending with their equal share
        const participantsWithStatus = participants.map(p => ({
            name: p.name,
            share: participantShare,
            settled: false,
        }));

        const { rows } = await pool.query(
            `INSERT INTO expense_splits (user_id, transaction_id, total_amount, description, split_count, your_share, participants, date)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
            [req.user.id, transactionId, parseFloat(total_amount), description, splitCount, yourShare, JSON.stringify(participantsWithStatus), splitDate]
        );

        res.status(201).json({ split: rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to create split' });
    }
});

// PUT /api/splits/:id — edit a split
router.put('/:id', authMiddleware, async (req, res) => {
    try {
        const { id } = req.params;
        const { description, total_amount, participants, date } = req.body;

        if (!description || !participants || !Array.isArray(participants) || participants.length === 0) {
            return res.status(400).json({ error: 'description, total_amount, and participants are required' });
        }
        if (!isPositiveNumber(total_amount)) {
            return res.status(400).json({ error: 'total_amount must be greater than 0' });
        }

        const { rows } = await pool.query(
            `SELECT * FROM expense_splits WHERE id = $1 AND user_id = $2`,
            [id, req.user.id]
        );
        if (!rows.length) return res.status(404).json({ error: 'Split not found' });

        const existing = rows[0];
        const splitCount = participants.length + 1;
        const yourShare = Math.round((parseFloat(total_amount) / splitCount) * 100) / 100;
        const splitDate = date || existing.date;

        // Preserve settled status for participants with the same name
        const settledMap = {};
        (existing.participants || []).forEach(p => { settledMap[p.name] = p.settled; });

        const updatedParticipants = participants.map(p => ({
            name: p.name,
            share: yourShare,
            settled: settledMap[p.name] ?? false,
        }));

        // Update the linked transaction
        await pool.query(
            `UPDATE transactions SET amount = $1, description = $2, date = $3 WHERE id = $4 AND user_id = $5`,
            [yourShare, description, splitDate, existing.transaction_id, req.user.id]
        );

        const { rows: updated } = await pool.query(
            `UPDATE expense_splits
             SET description = $1, total_amount = $2, split_count = $3, your_share = $4, participants = $5, date = $6
             WHERE id = $7 AND user_id = $8 RETURNING *`,
            [description, parseFloat(total_amount), splitCount, yourShare, JSON.stringify(updatedParticipants), splitDate, id, req.user.id]
        );

        res.json({ split: updated[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to update split' });
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

// DELETE /api/splits/:id — delete split AND its linked transaction
router.delete('/:id', authMiddleware, async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        // Fetch the linked transaction ID before deleting
        const { rows } = await client.query(
            `SELECT transaction_id FROM expense_splits WHERE id = $1 AND user_id = $2`,
            [req.params.id, req.user.id]
        );
        if (!rows.length) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Split not found' });
        }

        // Delete the split
        await client.query(
            `DELETE FROM expense_splits WHERE id = $1 AND user_id = $2`,
            [req.params.id, req.user.id]
        );

        // Delete the linked transaction (if it exists)
        if (rows[0].transaction_id) {
            await client.query(
                `DELETE FROM transactions WHERE id = $1 AND user_id = $2`,
                [rows[0].transaction_id, req.user.id]
            );
        }

        await client.query('COMMIT');
        res.json({ success: true });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ error: 'Failed to delete split' });
    } finally {
        client.release();
    }
});

module.exports = router;
