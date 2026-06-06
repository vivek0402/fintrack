const express = require('express');
const pool = require('../db/pool');
const auth = require('../middleware/auth');
const { sendToUser } = require('../utils/fcm');
const router = express.Router();

router.use(auth);

router.get('/', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT r.*, c.name AS category_name, c.color AS category_color, c.icon AS category_icon
       FROM recurring_transactions r LEFT JOIN categories c ON r.category_id = c.id
       WHERE r.user_id=$1 ORDER BY r.created_at DESC`,
            [req.user.id]
        );
        res.json({ recurring: result.rows });
    } catch (err) {
        res.status(500).json({ error: 'Server error.' });
    }
});

router.post('/', async (req, res) => {
    try {
        const { type, amount, description, notes, category_id, frequency, day_of_month } = req.body;
        if (!type || !amount || !description || !frequency)
            return res.status(400).json({ error: 'Type, amount, description and frequency are required.' });

        const today = new Date();
        let nextDue = new Date();

        if (frequency === 'monthly' && day_of_month) {
            nextDue.setDate(day_of_month);
            if (nextDue <= today) nextDue.setMonth(nextDue.getMonth() + 1);
        } else if (frequency === 'weekly') {
            nextDue.setDate(today.getDate() + 7);
        } else {
            nextDue.setDate(today.getDate() + 1);
        }

        const result = await pool.query(
            `INSERT INTO recurring_transactions
        (user_id, category_id, type, amount, description, notes, frequency, day_of_month, next_due_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
            [req.user.id, category_id || null, type, amount, description, notes || null, frequency, day_of_month || null, nextDue.toISOString().split('T')[0]]
        );
        res.status(201).json({ recurring: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: 'Server error.' });
    }
});

router.patch('/:id/toggle', async (req, res) => {
    try {
        const result = await pool.query(
            `UPDATE recurring_transactions SET is_active = NOT is_active
       WHERE id=$1 AND user_id=$2 RETURNING *`,
            [req.params.id, req.user.id]
        );
        if (result.rows.length === 0) return res.status(404).json({ error: 'Not found.' });
        res.json({ recurring: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: 'Server error.' });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        const result = await pool.query(
            'DELETE FROM recurring_transactions WHERE id=$1 AND user_id=$2 RETURNING id',
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
        const { type, amount, description, frequency, day_of_month, category_id } = req.body;
        if (!type || !amount || !description || !frequency)
            return res.status(400).json({ error: 'Type, amount, description and frequency are required.' });

        const { rows: oldRows } = await pool.query(
            'SELECT amount FROM recurring_transactions WHERE id=$1 AND user_id=$2',
            [req.params.id, req.user.id]
        );

        const result = await pool.query(
            `UPDATE recurring_transactions
             SET type=$1, amount=$2, description=$3, frequency=$4,
                 day_of_month=$5, category_id=$6
             WHERE id=$7 AND user_id=$8 RETURNING *`,
            [type, amount, description, frequency, day_of_month || null, category_id || null, req.params.id, req.user.id]
        );
        if (result.rows.length === 0)
            return res.status(404).json({ error: 'Not found.' });

        const updated = result.rows[0];
        res.json({ recurring: updated });

        const oldAmount = parseFloat(oldRows[0]?.amount || 0);
        const newAmount = parseFloat(amount);
        if (oldRows.length && Math.abs(oldAmount - newAmount) > 1) {
            setImmediate(async () => {
                try {
                    const alertKey = `bill_changed:${updated.id}:${new Date().toISOString().slice(0, 7)}`;
                    const { rowCount } = await pool.query(
                        `INSERT INTO notification_log (user_id, alert_key) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
                        [req.user.id, alertKey]
                    );
                    if (!rowCount) return;
                    const diff = newAmount - oldAmount;
                    await sendToUser(req.user.id, {
                        title: 'Recurring Bill Updated 📝',
                        body: `Your "${description}" bill ${diff > 0 ? 'went up' : 'went down'} from ₹${oldAmount.toLocaleString('en-IN')} to ₹${newAmount.toLocaleString('en-IN')}. Good to keep track of these! 😊`,
                        data: { type: 'bill_changed', id: String(updated.id) },
                    });
                } catch { }
            });
        }
    } catch (err) {
        res.status(500).json({ error: 'Server error.' });
    }
});

router.post('/process', async (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        const due = await pool.query(
            `SELECT * FROM recurring_transactions WHERE user_id=$1 AND is_active=true AND next_due_date <= $2`,
            [req.user.id, today]
        );

        const created = [];
        for (const r of due.rows) {
            const current = new Date(r.next_due_date);
            let next = new Date(current);
            if (r.frequency === 'daily') next.setDate(current.getDate() + 1);
            else if (r.frequency === 'weekly') next.setDate(current.getDate() + 7);
            else if (r.frequency === 'monthly') { next.setMonth(current.getMonth() + 1); if (r.day_of_month) next.setDate(r.day_of_month); }
            const nextStr = next.toISOString().split('T')[0];

            // Atomically advance next_due_date only if it still matches what we read.
            // This prevents duplicate transactions when two requests race (e.g. two browser tabs).
            const { rowCount } = await pool.query(
                `UPDATE recurring_transactions SET next_due_date=$1
                 WHERE id=$2 AND next_due_date=$3`,
                [nextStr, r.id, r.next_due_date]
            );
            if (rowCount === 0) continue; // another concurrent request already processed this item

            await pool.query(
                `INSERT INTO transactions (user_id, category_id, type, amount, description, notes, date)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
                [r.user_id, r.category_id, r.type, r.amount, r.description, r.notes, r.next_due_date]
            );
            created.push(r.description);
        }
        res.json({ processed: created.length, created });
    } catch (err) {
        res.status(500).json({ error: 'Server error.' });
    }
});

module.exports = router;