const express = require('express');
const pool = require('../db/pool');
const auth = require('../middleware/auth');
const { isPositiveNumber } = require('../utils/validation');
const { applyGoalContribution, fireGoalMilestoneChecks } = require('../utils/goals');
const router = express.Router();

router.use(auth);

router.get('/', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM savings_goals WHERE user_id=$1 ORDER BY created_at DESC',
            [req.user.id]
        );
        res.json({ goals: result.rows });
    } catch (err) {
        console.error('[Goals]', err.message);
        res.status(500).json({ error: 'Server error.' });
    }
});

router.post('/', async (req, res) => {
    try {
        const { name, target_amount, deadline, color, icon } = req.body;
        if (!name || !target_amount) return res.status(400).json({ error: 'Name and target amount required.' });
        if (!isPositiveNumber(target_amount))
            return res.status(400).json({ error: 'Target amount must be a positive number.' });

        const result = await pool.query(
            `INSERT INTO savings_goals (user_id, name, target_amount, deadline, color, icon)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
            [req.user.id, name, target_amount, deadline || null, color || '#10b981', icon || 'target']
        );
        res.status(201).json({ goal: result.rows[0] });
    } catch (err) {
        console.error('[Goals]', err.message);
        res.status(500).json({ error: 'Server error.' });
    }
});

router.patch('/:id/funds', async (req, res) => {
    try {
        const { amount } = req.body;
        const delta = parseFloat(amount);
        if (!isFinite(delta)) return res.status(400).json({ error: 'amount must be a number.' });

        const goal = await applyGoalContribution(pool, req.user.id, req.params.id, delta);
        if (!goal) return res.status(404).json({ error: 'Goal not found.' });
        res.json({ goal });

        fireGoalMilestoneChecks(req.user.id, goal, delta);
    } catch (err) {
        console.error('[Goals]', err.message);
        res.status(500).json({ error: 'Server error.' });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        const result = await pool.query(
            'DELETE FROM savings_goals WHERE id=$1 AND user_id=$2 RETURNING id',
            [req.params.id, req.user.id]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Not found.' });
        res.json({ message: 'Deleted.' });
    } catch (err) {
        console.error('[Goals]', err.message);
        res.status(500).json({ error: 'Server error.' });
    }
});

router.put('/:id', async (req, res) => {
    try {
        const { name, target_amount, deadline, color } = req.body;
        if (!name || !target_amount)
            return res.status(400).json({ error: 'Name and target amount are required.' });
        if (!isPositiveNumber(target_amount))
            return res.status(400).json({ error: 'Target amount must be a positive number.' });

        const result = await pool.query(
            `UPDATE savings_goals
             SET name=$1, target_amount=$2, deadline=$3, color=$4, updated_at=NOW()
             WHERE id=$5 AND user_id=$6 RETURNING *`,
            [name, target_amount, deadline || null, color || '#10b981', req.params.id, req.user.id]
        );
        if (result.rows.length === 0)
            return res.status(404).json({ error: 'Not found.' });
        res.json({ goal: result.rows[0] });
    } catch (err) {
        console.error('[Goals]', err.message);
        res.status(500).json({ error: 'Server error.' });
    }
});

module.exports = router;