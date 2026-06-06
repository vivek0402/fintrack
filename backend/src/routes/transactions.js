const express = require('express');
const pool = require('../db/pool');
const auth = require('../middleware/auth');
const { sendToUser } = require('../utils/fcm');
const router = express.Router();

router.use(auth);

router.get('/earliest', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT date FROM transactions WHERE user_id = $1 ORDER BY date ASC LIMIT 1',
            [req.user.id]
        );
        res.json({ date: result.rows[0]?.date || new Date().toISOString() });
    } catch (err) {
        res.status(500).json({ error: 'Server error.' });
    }
});

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
        let query = `SELECT t.*, c.name AS category_name, c.icon AS category_icon, c.color AS category_color,
                         g.name AS group_name
                  FROM transactions t
                  LEFT JOIN categories c ON t.category_id = c.id
                  LEFT JOIN expense_groups g ON g.id = t.group_id
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
        const { type, amount, description, notes, tags, date, category_id, account_id, payment_method } = req.body;
        if (!type || !amount || !description || !date)
            return res.status(400).json({ error: 'Type, amount, description and date are required.' });

        const result = await pool.query(
            `INSERT INTO transactions (user_id, category_id, type, amount, description, notes, tags, date, account_id, payment_method)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
            [req.user.id, category_id || null, type, amount, description, notes || null, tags || [], date, account_id || null, payment_method || 'Cash']
        );
        const tx = result.rows[0];

        // Auto-assign to default account if none provided
        if (!account_id) {
            const { rows: defaults } = await pool.query(
                `SELECT id FROM bank_accounts WHERE user_id = $1 AND is_default = TRUE LIMIT 1`,
                [req.user.id]
            );
            if (defaults.length) {
                await pool.query(
                    `UPDATE transactions SET account_id = $1 WHERE id = $2`,
                    [defaults[0].id, tx.id]
                );
                tx.account_id = defaults[0].id;
            }
        }

        res.status(201).json({ transaction: tx });

        // Fire-and-forget: check if transaction count today is unusually high
        setImmediate(async () => {
            try {
                const today = tx.date;
                const alertKey = `high_tx_count:${req.user.id}:${today}`;
                const { rowCount: alreadySent } = await pool.query(
                    `SELECT 1 FROM notification_log WHERE user_id=$1 AND alert_key=$2`,
                    [req.user.id, alertKey]
                );
                if (alreadySent) return;

                const { rows } = await pool.query(
                    `SELECT COUNT(*) AS cnt FROM transactions WHERE user_id=$1 AND date=$2`,
                    [req.user.id, today]
                );
                const count = parseInt(rows[0]?.cnt || 0);
                if (count < 10) return;

                await pool.query(
                    `INSERT INTO notification_log (user_id, alert_key) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
                    [req.user.id, alertKey]
                );
                await sendToUser(req.user.id, {
                    title: 'High Spending Activity',
                    body: `You've logged ${count} transactions today. Everything going as planned?`,
                    data: { type: 'high_tx_count' },
                });
            } catch { /* silent */ }
        });

        // Fire-and-forget: check if any budget is now over 80%
        setImmediate(async () => {
            try {
                const month = tx.date.slice(0, 7); // 'YYYY-MM'
                const { rows: budgets } = await pool.query(
                    `SELECT b.id, b.category_id, b.amount,
                            COALESCE(SUM(t.amount),0) AS spent
                     FROM budgets b
                     LEFT JOIN transactions t
                       ON t.user_id = b.user_id
                      AND t.category_id = b.category_id
                      AND t.type = 'expense'
                      AND to_char(t.date, 'YYYY-MM') = $2
                     WHERE b.user_id = $1
                     GROUP BY b.id, b.category_id, b.amount
                     HAVING COALESCE(SUM(t.amount),0) / b.amount >= 0.8`,
                    [req.user.id, month]
                );

                for (const b of budgets) {
                    const pct = Math.round((b.spent / b.amount) * 100);
                    const alertKey = `budget_breach:${b.id}:${month}:${pct >= 100 ? '100' : '80'}`;
                    const { rowCount } = await pool.query(
                        `INSERT INTO notification_log (user_id, alert_key) VALUES ($1,$2)
                         ON CONFLICT (user_id, alert_key) DO NOTHING`,
                        [req.user.id, alertKey]
                    );
                    if (!rowCount) continue;

                    const { rows: cats } = await pool.query(
                        'SELECT name FROM categories WHERE id=$1', [b.category_id]
                    );
                    const catName = cats[0]?.name || 'A category';
                    await sendToUser(req.user.id, {
                        title: pct >= 100 ? 'Budget Exceeded' : 'Budget Alert',
                        body: `${catName}: ${pct}% of your budget used this month.`,
                        data: { type: 'budget_alert', category_id: String(b.category_id) },
                    });
                }
            } catch { /* silent — never delay response */ }
        });

        // Large transaction alert (>₹5000 expenses)
        setImmediate(async () => {
            try {
                const txAmount = parseFloat(tx.amount);
                if (txAmount < 5000 || tx.type !== 'expense') return;
                const alertKey = `large_tx:${tx.id}`;
                const { rowCount } = await pool.query(
                    `INSERT INTO notification_log (user_id, alert_key) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
                    [req.user.id, alertKey]
                );
                if (!rowCount) return;
                await sendToUser(req.user.id, {
                    title: 'Big Spend Alert 💸',
                    body: `You just logged ₹${txAmount.toLocaleString('en-IN')} for "${tx.description}". Hope it was totally worth it! 😊`,
                    data: { type: 'large_transaction', tx_id: String(tx.id) },
                });
            } catch { }
        });

        // Category spending spike vs same period last month (≥50% increase)
        setImmediate(async () => {
            try {
                if (!tx.category_id || tx.type !== 'expense') return;
                const monthStart = tx.date.slice(0, 8) + '01';
                const lastMonthDate = new Date(tx.date);
                lastMonthDate.setMonth(lastMonthDate.getMonth() - 1);
                const lastMonthStart = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}-01`;
                const lastMonthSameDay = lastMonthDate.toISOString().split('T')[0];

                const [{ rows: [thisRow] }, { rows: [lastRow] }] = await Promise.all([
                    pool.query(
                        `SELECT COALESCE(SUM(amount),0) AS total FROM transactions
                         WHERE user_id=$1 AND category_id=$2 AND type='expense' AND date BETWEEN $3 AND $4`,
                        [req.user.id, tx.category_id, monthStart, tx.date]
                    ),
                    pool.query(
                        `SELECT COALESCE(SUM(amount),0) AS total FROM transactions
                         WHERE user_id=$1 AND category_id=$2 AND type='expense' AND date BETWEEN $3 AND $4`,
                        [req.user.id, tx.category_id, lastMonthStart, lastMonthSameDay]
                    ),
                ]);
                const thisTotal = parseFloat(thisRow.total);
                const lastTotal = parseFloat(lastRow.total);
                if (lastTotal < 500 || thisTotal < lastTotal * 1.5) return;

                const pct = Math.round(((thisTotal - lastTotal) / lastTotal) * 100);
                const alertKey = `cat_spike:${tx.category_id}:${tx.date.slice(0, 7)}`;
                const { rowCount } = await pool.query(
                    `INSERT INTO notification_log (user_id, alert_key) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
                    [req.user.id, alertKey]
                );
                if (!rowCount) return;

                const { rows: cats } = await pool.query('SELECT name FROM categories WHERE id=$1', [tx.category_id]);
                await sendToUser(req.user.id, {
                    title: 'Spending Spike Spotted 📊',
                    body: `Your ${cats[0]?.name || 'category'} spending is ${pct}% higher than last month at this point. Just keeping you in the loop! 😊`,
                    data: { type: 'category_spike', category_id: String(tx.category_id) },
                });
            } catch { }
        });

        // Spending streak (notify at 3, 7, 14, 30 days)
        setImmediate(async () => {
            try {
                const { rows: datRows } = await pool.query(
                    `SELECT DISTINCT date::text FROM transactions
                     WHERE user_id=$1 AND date >= CURRENT_DATE - INTERVAL '31 days'
                     ORDER BY date DESC`,
                    [req.user.id]
                );
                let streak = 0;
                for (let i = 0; i < datRows.length; i++) {
                    const expected = new Date(tx.date);
                    expected.setDate(new Date(tx.date).getDate() - i);
                    if (datRows[i].date === expected.toISOString().split('T')[0]) streak++;
                    else break;
                }
                if (![3, 7, 14, 30].includes(streak)) return;

                const alertKey = `streak:${streak}:${tx.date.slice(0, 7)}`;
                const { rowCount } = await pool.query(
                    `INSERT INTO notification_log (user_id, alert_key) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
                    [req.user.id, alertKey]
                );
                if (!rowCount) return;

                await sendToUser(req.user.id, {
                    title: `${streak}-Day Tracking Streak! 🔥`,
                    body: streak === 30
                        ? `30 days straight of logging your finances — you're an absolute rockstar! 🌟`
                        : `${streak} days in a row of tracking your spending — you're absolutely crushing it! Keep going! 💪`,
                    data: { type: 'streak', days: String(streak) },
                });
            } catch { }
        });
    } catch (err) {
        res.status(500).json({ error: 'Server error.' });
    }
});

router.put('/:id', async (req, res) => {
    try {
        const { type, amount, description, notes, tags, date, category_id, payment_method } = req.body;
        const existing = await pool.query(
            'SELECT id FROM transactions WHERE id = $1 AND user_id = $2',
            [req.params.id, req.user.id]
        );
        if (existing.rows.length === 0)
            return res.status(404).json({ error: 'Transaction not found.' });

        const result = await pool.query(
            `UPDATE transactions SET
         type = COALESCE($1,type), amount = COALESCE($2,amount),
         description = COALESCE($3,description),
         notes = CASE WHEN $4::text IS NOT NULL THEN $4 WHEN $11::boolean THEN NULL ELSE notes END,
         tags = COALESCE($5,tags), date = COALESCE($6,date),
         category_id = $7,
         payment_method = COALESCE($8,payment_method), updated_at = NOW()
       WHERE id = $9 AND user_id = $10 RETURNING *`,
            [type, amount, description, notes, tags, date, category_id, payment_method,
             req.params.id, req.user.id, 'notes' in req.body && req.body.notes === null]
        );
        res.json({ transaction: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: 'Server error.' });
    }
});

router.patch('/:id/regret', async (req, res) => {
    try {
        const existing = await pool.query(
            'SELECT id, is_regretted FROM transactions WHERE id = $1 AND user_id = $2',
            [req.params.id, req.user.id]
        );
        if (existing.rows.length === 0)
            return res.status(404).json({ error: 'Transaction not found.' });

        const result = await pool.query(
            `UPDATE transactions SET is_regretted = NOT is_regretted, updated_at = NOW()
             WHERE id = $1 AND user_id = $2 RETURNING *`,
            [req.params.id, req.user.id]
        );
        const regretTx = result.rows[0];
        res.json({ transaction: regretTx });

        if (regretTx.is_regretted) {
            setImmediate(async () => {
                try {
                    const { rows } = await pool.query(
                        `SELECT COUNT(*) AS cnt FROM transactions
                         WHERE user_id=$1 AND is_regretted=true AND updated_at >= NOW() - INTERVAL '7 days'`,
                        [req.user.id]
                    );
                    const count = parseInt(rows[0]?.cnt || 0);
                    if (count < 5) return;

                    const alertKey = `regret_rising:${new Date().toISOString().slice(0, 7)}`;
                    const { rowCount } = await pool.query(
                        `INSERT INTO notification_log (user_id, alert_key) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
                        [req.user.id, alertKey]
                    );
                    if (!rowCount) return;

                    await sendToUser(req.user.id, {
                        title: "Feeling Some Regret? 😅",
                        body: `You've marked ${count} transactions as regrets this week. It might be worth reviewing your habits — we're rooting for you! 💙`,
                        data: { type: 'regret_rising', count: String(count) },
                    });
                } catch { }
            });
        }
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