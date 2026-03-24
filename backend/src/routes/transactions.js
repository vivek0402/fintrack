const express = require('express');
const pool = require('../db/pool');
const auth = require('../middleware/auth');
const router = express.Router();

router.use(auth);

router.get('/search', async (req, res) => {
    try {
        const { q } = req.query;
        if (!q || q.trim().length < 2) return res.json({ transactions: [] });

        const result = await pool.query(
            `SELECT t.*, c.name AS category_name, c.icon AS category_icon, c.color AS category_color
       FROM transactions t
       LEFT JOIN categories c ON t.category_id = c.id
       WHERE t.user_id = $1
         AND (LOWER(t.description) LIKE LOWER($2) OR LOWER(c.name) LIKE LOWER($2) OR LOWER(t.notes) LIKE LOWER($2))
       ORDER BY t.date DESC LIMIT 20`,
            [req.user.id, `%${q.trim()}%`]
        );
        res.json({ transactions: result.rows });
    } catch (err) {
        res.status(500).json({ error: 'Server error.' });
    }
});

router.get('/', async (req, res) => {
    try {
        const { type, month, year, category_id } = req.query;
        let query = `SELECT t.*, c.name AS category_name, c.icon AS category_icon, c.color AS category_color
                  FROM transactions t LEFT JOIN categories c ON t.category_id = c.id
                  WHERE t.user_id = $1`;
        const params = [req.user.id];
        let n = 1;

        if (type) { n++; query += ` AND t.type = $${n}`; params.push(type); }
        if (month) { n++; query += ` AND EXTRACT(MONTH FROM t.date) = $${n}`; params.push(month); }
        if (year) { n++; query += ` AND EXTRACT(YEAR  FROM t.date) = $${n}`; params.push(year); }
        if (category_id) { n++; query += ` AND t.category_id = $${n}`; params.push(category_id); }

        query += ' ORDER BY t.date DESC, t.created_at DESC';
        const result = await pool.query(query, params);
        res.json({ transactions: result.rows });
    } catch (err) {
        res.status(500).json({ error: 'Server error.' });
    }
});

router.post('/', async (req, res) => {
    try {
        const { type, amount, description, notes, tags, date, category_id } = req.body;
        if (!type || !amount || !description || !date)
            return res.status(400).json({ error: 'Type, amount, description and date are required.' });

        const result = await pool.query(
            `INSERT INTO transactions (user_id, category_id, type, amount, description, notes, tags, date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
            [req.user.id, category_id || null, type, amount, description, notes || null, tags || [], date]
        );
        res.status(201).json({ transaction: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: 'Server error.' });
    }
});

router.put('/:id', async (req, res) => {
    try {
        const { type, amount, description, notes, tags, date, category_id } = req.body;
        const existing = await pool.query(
            'SELECT id FROM transactions WHERE id = $1 AND user_id = $2',
            [req.params.id, req.user.id]
        );
        if (existing.rows.length === 0)
            return res.status(404).json({ error: 'Transaction not found.' });

        const result = await pool.query(
            `UPDATE transactions SET
         type = COALESCE($1,type), amount = COALESCE($2,amount),
         description = COALESCE($3,description), notes = COALESCE($4,notes),
         tags = COALESCE($5,tags), date = COALESCE($6,date),
         category_id = COALESCE($7,category_id), updated_at = NOW()
       WHERE id = $8 AND user_id = $9 RETURNING *`,
            [type, amount, description, notes, tags, date, category_id, req.params.id, req.user.id]
        );
        res.json({ transaction: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: 'Server error.' });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        const result = await pool.query(
            'DELETE FROM transactions WHERE id = $1 AND user_id = $2 RETURNING id',
            [req.params.id, req.user.id]
        );
        if (result.rows.length === 0)
            return res.status(404).json({ error: 'Transaction not found.' });
        res.json({ message: 'Deleted.' });
    } catch (err) {
        res.status(500).json({ error: 'Server error.' });
    }
});

module.exports = router;