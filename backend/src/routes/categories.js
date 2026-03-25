const express = require('express');
const pool = require('../db/pool');
const auth = require('../middleware/auth');
const router = express.Router();

router.use(auth);

router.get('/', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT * FROM categories
             WHERE is_default = true OR user_id = $1
             ORDER BY name ASC, is_default DESC`,
            [req.user.id]
        );
        // Deduplicate by name at application level (prefer first match — is_default wins ties)
        const seen = new Set();
        const categories = result.rows.filter(row => {
            if (seen.has(row.name)) return false;
            seen.add(row.name);
            return true;
        });
        res.json({ categories });
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
        const result = await pool.query(
            `DELETE FROM categories WHERE id = $1 AND user_id = $2 AND is_default = false RETURNING id`,
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
