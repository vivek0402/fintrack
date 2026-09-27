const express = require('express');
const pool = require('../db/pool');
const auth = require('../middleware/auth');
const { isNonNegativeNumber } = require('../utils/validation');
const { fetchBudgetsWithSpent } = require('../utils/budgetSpend');
const router = express.Router();

router.use(auth);

router.get('/', async (req, res) => {
    try {
        const { month, year } = req.query;
        const m = month || new Date().getMonth() + 1;
        const y = year || new Date().getFullYear();

        const budgets = await fetchBudgetsWithSpent(req.user.id, m, y);
        res.json({ budgets });
    } catch (err) {
        res.status(500).json({ error: 'Server error.' });
    }
});

router.post('/', async (req, res) => {
    try {
        const { category_id, amount, month, year } = req.body;
        if (!category_id || !month || !year)
            return res.status(400).json({ error: 'All fields required.' });
        if (!isNonNegativeNumber(amount))
            return res.status(400).json({ error: 'amount must be >= 0.' });

        const { rows: categoryCheck } = await pool.query(
            `SELECT id FROM categories WHERE id = $1 AND (user_id = $2 OR user_id IS NULL)`,
            [category_id, req.user.id]
        );
        if (!categoryCheck.length)
            return res.status(400).json({ error: 'Invalid category_id.' });

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