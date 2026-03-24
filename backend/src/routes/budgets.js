const express = require('express');
const pool = require('../db/pool');
const auth = require('../middleware/auth');
const router = express.Router();

router.use(auth);

router.get('/', async (req, res) => {
    try {
        const { month, year } = req.query;
        const m = month || new Date().getMonth() + 1;
        const y = year || new Date().getFullYear();

        const result = await pool.query(
            `SELECT b.*, c.name AS category_name, c.icon AS category_icon, c.color AS category_color,
              COALESCE(SUM(t.amount), 0) AS spent
       FROM budgets b
       JOIN categories c ON b.category_id = c.id
       LEFT JOIN transactions t
         ON t.category_id = b.category_id AND t.user_id = b.user_id
         AND t.type = 'expense'
         AND EXTRACT(MONTH FROM t.date) = b.month
         AND EXTRACT(YEAR  FROM t.date) = b.year
       WHERE b.user_id = $1 AND b.month = $2 AND b.year = $3
       GROUP BY b.id, c.name, c.icon, c.color
       ORDER BY c.name ASC`,
            [req.user.id, m, y]
        );
        res.json({ budgets: result.rows });
    } catch (err) {
        res.status(500).json({ error: 'Server error.' });
    }
});

router.post('/', async (req, res) => {
    try {
        const { category_id, amount, month, year } = req.body;
        if (!category_id || !amount || !month || !year)
            return res.status(400).json({ error: 'All fields required.' });

        const result = await pool.query(
            `INSERT INTO budgets (user_id, category_id, amount, month, year)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (user_id, category_id, month, year)
       DO UPDATE SET amount = $3, updated_at = NOW()
       RETURNING *`,
            [req.user.id, category_id, amount, month, year]
        );
        res.status(201).json({ budget: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: 'Server error.' });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        const result = await pool.query(
            'DELETE FROM budgets WHERE id = $1 AND user_id = $2 RETURNING id',
            [req.params.id, req.user.id]
        );
        if (result.rows.length === 0)
            return res.status(404).json({ error: 'Budget not found.' });
        res.json({ message: 'Deleted.' });
    } catch (err) {
        res.status(500).json({ error: 'Server error.' });
    }
});

module.exports = router;