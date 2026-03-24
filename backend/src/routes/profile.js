const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db/pool');
const auth = require('../middleware/auth');
const router = express.Router();

router.use(auth);

router.get('/', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT u.id, u.full_name, u.email, u.currency, u.created_at,
              COUNT(DISTINCT t.id) AS total_transactions,
              COUNT(DISTINCT b.id) AS total_budgets
       FROM users u
       LEFT JOIN transactions t ON t.user_id = u.id
       LEFT JOIN budgets b ON b.user_id = u.id
       WHERE u.id = $1 GROUP BY u.id`,
            [req.user.id]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'User not found.' });
        res.json({ profile: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: 'Server error.' });
    }
});

router.put('/', async (req, res) => {
    try {
        const { full_name, email, currency } = req.body;
        if (!full_name || !email) return res.status(400).json({ error: 'Name and email required.' });

        const existing = await pool.query(
            'SELECT id FROM users WHERE email=$1 AND id!=$2', [email, req.user.id]
        );
        if (existing.rows.length > 0) return res.status(409).json({ error: 'Email already in use.' });

        const result = await pool.query(
            `UPDATE users SET full_name=$1, email=$2, currency=$3, updated_at=NOW()
       WHERE id=$4 RETURNING id, full_name, email, currency`,
            [full_name, email, currency || 'INR', req.user.id]
        );
        res.json({ user: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: 'Server error.' });
    }
});

router.put('/password', async (req, res) => {
    try {
        const { current_password, new_password } = req.body;
        if (!current_password || !new_password) return res.status(400).json({ error: 'Both passwords required.' });
        if (new_password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });

        const result = await pool.query('SELECT password_hash FROM users WHERE id=$1', [req.user.id]);
        const isMatch = await bcrypt.compare(current_password, result.rows[0].password_hash);
        if (!isMatch) return res.status(401).json({ error: 'Current password is incorrect.' });

        const newHash = await bcrypt.hash(new_password, 10);
        await pool.query('UPDATE users SET password_hash=$1, updated_at=NOW() WHERE id=$2', [newHash, req.user.id]);
        res.json({ message: 'Password updated.' });
    } catch (err) {
        res.status(500).json({ error: 'Server error.' });
    }
});

module.exports = router;