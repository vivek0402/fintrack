const express = require('express');
const pool = require('../db/pool');
const auth = require('../middleware/auth');
const { sendToUser } = require('../utils/fcm');
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
        res.status(500).json({ error: 'Server error.' });
    }
});

router.post('/', async (req, res) => {
    try {
        const { name, target_amount, deadline, color, icon } = req.body;
        if (!name || !target_amount) return res.status(400).json({ error: 'Name and target amount required.' });

        const result = await pool.query(
            `INSERT INTO savings_goals (user_id, name, target_amount, deadline, color, icon)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
            [req.user.id, name, target_amount, deadline || null, color || '#10b981', icon || 'target']
        );
        res.status(201).json({ goal: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: 'Server error.' });
    }
});

router.patch('/:id/funds', async (req, res) => {
    try {
        const { amount } = req.body;
        const delta = parseFloat(amount);
        if (!isFinite(delta)) return res.status(400).json({ error: 'amount must be a number.' });

        // Atomic read-modify-write in SQL to prevent lost-update race conditions
        const result = await pool.query(
            `UPDATE savings_goals
             SET saved_amount = GREATEST(0, saved_amount + $1), updated_at = NOW()
             WHERE id = $2 AND user_id = $3 RETURNING *`,
            [delta, req.params.id, req.user.id]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Goal not found.' });
        const goal = result.rows[0];
        res.json({ goal });

        // Fire-and-forget: check for 50%, 100% milestone
        setImmediate(async () => {
            try {
                const pct = goal.target_amount > 0
                    ? Math.round((goal.saved_amount / goal.target_amount) * 100)
                    : 0;
                if (pct < 50) return;

                const milestone = pct >= 100 ? 100 : 50;
                const alertKey = `goal_milestone:${goal.id}:${milestone}`;
                const { rowCount } = await pool.query(
                    `INSERT INTO notification_log (user_id, alert_key) VALUES ($1,$2)
                     ON CONFLICT (user_id, alert_key) DO NOTHING`,
                    [req.user.id, alertKey]
                );
                if (!rowCount) return;

                await sendToUser(req.user.id, {
                    title: milestone === 100 ? 'Goal Reached! 🎯' : 'Halfway There! 🏃',
                    body: milestone === 100
                        ? `You've fully funded "${goal.name}"! That's incredible — you actually did it! 🎉`
                        : `You're halfway to your "${goal.name}" goal! You're doing so well — keep it up! 💪`,
                    data: { type: 'goal_milestone', goal_id: String(goal.id) },
                });
            } catch { /* silent */ }
        });

        // Total savings milestone (₹10K, ₹25K, ₹50K, ₹1L, ₹2.5L, ₹5L, ₹10L)
        setImmediate(async () => {
            try {
                const { rows } = await pool.query(
                    `SELECT COALESCE(SUM(saved_amount),0) AS total FROM savings_goals WHERE user_id=$1`,
                    [req.user.id]
                );
                const total = parseFloat(rows[0]?.total || 0);
                const milestones = [10000, 25000, 50000, 100000, 250000, 500000, 1000000];
                const crossed = milestones.find(m => total >= m && (total - delta) < m);
                if (!crossed) return;

                const alertKey = `savings_total:${crossed}`;
                const { rowCount } = await pool.query(
                    `INSERT INTO notification_log (user_id, alert_key) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
                    [req.user.id, alertKey]
                );
                if (!rowCount) return;

                const label = crossed >= 100000
                    ? `₹${(crossed / 100000).toLocaleString('en-IN')}L`
                    : `₹${crossed.toLocaleString('en-IN')}`;
                await sendToUser(req.user.id, {
                    title: 'Savings Milestone! 🎉',
                    body: `Your total savings just crossed ${label}! That's a massive achievement — you should be so proud of yourself! 🌟`,
                    data: { type: 'savings_milestone', milestone: String(crossed) },
                });
            } catch { }
        });
    } catch (err) {
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
        res.status(500).json({ error: 'Server error.' });
    }
});

router.put('/:id', async (req, res) => {
    try {
        const { name, target_amount, deadline, color } = req.body;
        if (!name || !target_amount)
            return res.status(400).json({ error: 'Name and target amount are required.' });

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
        res.status(500).json({ error: 'Server error.' });
    }
});

module.exports = router;