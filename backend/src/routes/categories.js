const express = require('express');
const pool = require('../db/pool');
const auth = require('../middleware/auth');
const router = express.Router();

router.use(auth);

router.get('/', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT
               c.*,
               COUNT(t.id) AS usage_count,
               MAX(t.date) AS last_used
             FROM categories c
             LEFT JOIN transactions t
               ON t.category_id = c.id AND t.user_id = c.user_id
             WHERE c.user_id = $1
             GROUP BY c.id
             ORDER BY usage_count DESC, c.name ASC`,
            [req.user.id]
        );
        res.json({ categories: result.rows });
    } catch (err) {
        res.status(500).json({ error: 'Server error.' });
    }
});

router.post('/', async (req, res) => {
    try {
        const { name, icon, color } = req.body;
        if (!name) return res.status(400).json({ error: 'Name is required.' });

        const result = await pool.query(
            `INSERT INTO categories (user_id, name, icon, color, is_default)
             VALUES ($1, $2, $3, $4, false) RETURNING *`,
            [req.user.id, name, icon || '📦', color || '#64748b']
        );
        res.status(201).json({ category: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: 'Server error.' });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        const cat = await pool.query(
            `SELECT is_default FROM categories WHERE id = $1 AND user_id = $2`,
            [req.params.id, req.user.id]
        );
        if (cat.rows.length === 0)
            return res.status(404).json({ error: 'Category not found.' });
        if (cat.rows[0].is_default)
            return res.status(403).json({ error: 'Cannot delete a default category.' });

        const result = await pool.query(
            `DELETE FROM categories WHERE id = $1 AND user_id = $2 RETURNING id`,
            [req.params.id, req.user.id]
        );
        if (result.rows.length === 0)
            return res.status(404).json({ error: 'Category not found.' });
        res.json({ message: 'Deleted.' });
    } catch (err) {
        res.status(500).json({ error: 'Server error.' });
    }
});

module.exports = router;
