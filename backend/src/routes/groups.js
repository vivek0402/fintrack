const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const auth = require('../middleware/auth');
const { isPositiveNumber, isNonNegativeNumber } = require('../utils/validation');

router.use(auth);

// GET /api/groups — list all groups with stats
router.get('/', async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT g.*,
                (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) AS member_count,
                (SELECT COALESCE(SUM(t.amount),0) FROM transactions t WHERE t.group_id = g.id) AS total_spent
             FROM expense_groups g
             WHERE g.user_id = $1
             ORDER BY g.created_at DESC`,
            [req.user.id]
        );
        res.json({ groups: rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch groups' });
    }
});

// POST /api/groups — create group
router.post('/', async (req, res) => {
    try {
        const { name, emoji = '👥', description, budget, currency = 'INR', members = [] } = req.body;
        if (!name) return res.status(400).json({ error: 'name is required' });

        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const { rows } = await client.query(
                `INSERT INTO expense_groups (user_id, name, emoji, description, budget, currency)
                 VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
                [req.user.id, name, emoji, description || null, budget || null, currency]
            );
            const group = rows[0];
            for (const m of members) {
                if (m.name && m.name.trim()) {
                    await client.query(
                        `INSERT INTO group_members (group_id, name, email) VALUES ($1,$2,$3)`,
                        [group.id, m.name.trim(), m.email || null]
                    );
                }
            }
            await client.query('COMMIT');
            const full = await pool.query(
                `SELECT g.*, (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) AS member_count, 0 AS total_spent
                 FROM expense_groups g WHERE g.id = $1`, [group.id]
            );
            res.status(201).json({ group: full.rows[0] });
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to create group' });
    }
});

// GET /api/groups/:id — group detail with members, transactions, splits
router.get('/:id', async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT g.*,
                (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) AS member_count,
                (SELECT COALESCE(SUM(t.amount),0) FROM transactions t WHERE t.group_id = g.id) AS total_spent
             FROM expense_groups g WHERE g.id = $2 AND g.user_id = $1`,
            [req.user.id, req.params.id]
        );
        if (!rows.length) return res.status(404).json({ error: 'Group not found' });

        const [members, transactions, splits] = await Promise.all([
            pool.query(`SELECT * FROM group_members WHERE group_id = $1 ORDER BY name`, [req.params.id]),
            pool.query(`SELECT * FROM transactions WHERE group_id = $1 AND user_id = $2 ORDER BY date DESC`, [req.params.id, req.user.id]),
            pool.query(
                `SELECT gs.*, COALESCE(json_agg(gss ORDER BY gss.id) FILTER (WHERE gss.id IS NOT NULL), '[]') AS shares
                 FROM group_splits gs
                 LEFT JOIN group_split_shares gss ON gss.split_id = gs.id
                 WHERE gs.group_id = $1
                 GROUP BY gs.id ORDER BY gs.date DESC`,
                [req.params.id]
            ),
        ]);

        res.json({
            group: rows[0],
            members: members.rows,
            transactions: transactions.rows,
            splits: splits.rows,
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch group' });
    }
});

// PATCH /api/groups/:id — update group
router.patch('/:id', async (req, res) => {
    try {
        const { name, emoji, description, budget, currency, members } = req.body;
        const { rows } = await pool.query(
            `SELECT id FROM expense_groups WHERE id = $1 AND user_id = $2`,
            [req.params.id, req.user.id]
        );
        if (!rows.length) return res.status(404).json({ error: 'Group not found' });

        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await client.query(
                `UPDATE expense_groups SET
                    name = COALESCE($1, name), emoji = COALESCE($2, emoji),
                    description = COALESCE($3, description), budget = COALESCE($4, budget),
                    currency = COALESCE($5, currency), updated_at = NOW()
                 WHERE id = $6`,
                [name, emoji, description, budget, currency, req.params.id]
            );
            if (Array.isArray(members)) {
                await client.query(`DELETE FROM group_members WHERE group_id = $1`, [req.params.id]);
                for (const m of members) {
                    if (m.name && m.name.trim()) {
                        await client.query(
                            `INSERT INTO group_members (group_id, name, email) VALUES ($1,$2,$3)`,
                            [req.params.id, m.name.trim(), m.email || null]
                        );
                    }
                }
            }
            await client.query('COMMIT');
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }

        const updated = await pool.query(
            `SELECT g.*,
                (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) AS member_count,
                (SELECT COALESCE(SUM(t.amount),0) FROM transactions t WHERE t.group_id = g.id) AS total_spent
             FROM expense_groups g WHERE g.id = $1`,
            [req.params.id]
        );
        res.json({ group: updated.rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to update group' });
    }
});

// DELETE /api/groups/:id
// Wrapped in a transaction: unlinking and deleting are atomic.
router.delete('/:id', async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        // Unlink any transactions that reference splits in this group (auto-created by addSplit)
        await client.query(
            `UPDATE transactions SET split_id = NULL WHERE split_id IN (
               SELECT id FROM group_splits WHERE group_id = $1
             )`,
            [req.params.id]
        );
        // Unlink any transactions that reference this group directly
        await client.query(
            `UPDATE transactions SET group_id = NULL, split_id = NULL WHERE group_id = $1 AND user_id = $2`,
            [req.params.id, req.user.id]
        );
        // Delete the group (cascades to group_members, group_splits, group_split_shares via FK)
        const { rowCount } = await client.query(
            `DELETE FROM expense_groups WHERE id = $1 AND user_id = $2`,
            [req.params.id, req.user.id]
        );
        if (!rowCount) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Group not found' });
        }
        await client.query('COMMIT');
        res.json({ success: true });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ error: 'Failed to delete group' });
    } finally {
        client.release();
    }
});

// POST /api/groups/:id/transactions/:txId — link transaction to group
router.post('/:id/transactions/:txId', async (req, res) => {
    try {
        const { rowCount } = await pool.query(
            `UPDATE transactions SET group_id = $1 WHERE id = $2 AND user_id = $3`,
            [req.params.id, req.params.txId, req.user.id]
        );
        if (!rowCount) return res.status(404).json({ error: 'Transaction not found' });
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to link transaction' });
    }
});

// DELETE /api/groups/:id/transactions/:txId — unlink transaction
router.delete('/:id/transactions/:txId', async (req, res) => {
    try {
        const { rowCount } = await pool.query(
            `UPDATE transactions SET group_id = NULL WHERE id = $1 AND user_id = $2 AND group_id = $3`,
            [req.params.txId, req.user.id, req.params.id]
        );
        if (!rowCount) return res.status(404).json({ error: 'Transaction not found in group' });
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to unlink transaction' });
    }
});

// POST /api/groups/:id/splits — add a split to the group
router.post('/:id/splits', async (req, res) => {
    try {
        const { description, total_amount, paid_by, date, shares } = req.body;
        if (!description || !paid_by || !shares || !Array.isArray(shares)) {
            return res.status(400).json({ error: 'description, total_amount, paid_by, and shares are required' });
        }
        if (!isPositiveNumber(total_amount)) {
            return res.status(400).json({ error: 'total_amount must be greater than 0' });
        }
        if (shares.some(s => !isNonNegativeNumber(s.amount))) {
            return res.status(400).json({ error: 'each share amount must be >= 0' });
        }
        const { rows } = await pool.query(
            `SELECT id FROM expense_groups WHERE id = $1 AND user_id = $2`,
            [req.params.id, req.user.id]
        );
        if (!rows.length) return res.status(404).json({ error: 'Group not found' });

        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const splitResult = await client.query(
                `INSERT INTO group_splits (group_id, description, total_amount, paid_by, date)
                 VALUES ($1,$2,$3,$4,$5) RETURNING *`,
                [req.params.id, description, total_amount, paid_by, date || new Date().toISOString().split('T')[0]]
            );
            const split = splitResult.rows[0];
            for (const s of shares) {
                await client.query(
                    `INSERT INTO group_split_shares (split_id, member, amount) VALUES ($1,$2,$3)`,
                    [split.id, s.member, s.amount]
                );
            }

            // Create a transaction for the current user's share (the "Me" member)
            const meShare = shares.find(s => s.member === 'Me');
            if (meShare) {
                const grpRes = await client.query(`SELECT name FROM expense_groups WHERE id = $1`, [req.params.id]);
                const groupName = grpRes.rows[0]?.name || 'Group';
                await client.query(
                    `INSERT INTO transactions (user_id, type, amount, description, notes, tags, date, group_id, split_id, source)
                     VALUES ($1, 'expense', $2, $3, $4, $5, $6, $7, $8, 'manual')`,
                    [req.user.id, meShare.amount, description,
                     `My share in ${groupName}`, '{group-split}',
                     date || new Date().toISOString().split('T')[0], req.params.id, split.id]
                );
            }

            await client.query('COMMIT');
            const full = await pool.query(
                `SELECT gs.*, COALESCE(json_agg(gss ORDER BY gss.id) FILTER (WHERE gss.id IS NOT NULL), '[]') AS shares
                 FROM group_splits gs LEFT JOIN group_split_shares gss ON gss.split_id = gs.id
                 WHERE gs.id = $1 GROUP BY gs.id`,
                [split.id]
            );
            res.status(201).json({ split: full.rows[0] });
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to create split' });
    }
});

// PUT /api/groups/:id/splits/:splitId — update a split
router.put('/:id/splits/:splitId', async (req, res) => {
    try {
        const { description, total_amount, paid_by, date, shares } = req.body;
        if (!description || !paid_by || !shares || !Array.isArray(shares)) {
            return res.status(400).json({ error: 'description, total_amount, paid_by, and shares are required' });
        }
        if (!isPositiveNumber(total_amount)) {
            return res.status(400).json({ error: 'total_amount must be greater than 0' });
        }
        if (shares.some(s => !isNonNegativeNumber(s.amount))) {
            return res.status(400).json({ error: 'each share amount must be >= 0' });
        }
        const { rows } = await pool.query(
            `SELECT gs.id FROM group_splits gs
             JOIN expense_groups g ON g.id = gs.group_id
             WHERE gs.id = $1 AND g.id = $2 AND g.user_id = $3`,
            [req.params.splitId, req.params.id, req.user.id]
        );
        if (!rows.length) return res.status(404).json({ error: 'Split not found' });

        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const splitDate = date || new Date().toISOString().split('T')[0];
            await client.query(
                `UPDATE group_splits SET description = $1, total_amount = $2, paid_by = $3, date = $4 WHERE id = $5`,
                [description, total_amount, paid_by, splitDate, req.params.splitId]
            );
            await client.query(`DELETE FROM group_split_shares WHERE split_id = $1`, [req.params.splitId]);
            for (const s of shares) {
                await client.query(
                    `INSERT INTO group_split_shares (split_id, member, amount) VALUES ($1,$2,$3)`,
                    [req.params.splitId, s.member, s.amount]
                );
            }

            // Update or create the linked transaction for "Me" — using split_id FK (robust)
            const meShare = shares.find(s => s.member === 'Me');
            const existingTx = await client.query(
                `SELECT id FROM transactions WHERE split_id = $1 AND user_id = $2 LIMIT 1`,
                [req.params.splitId, req.user.id]
            );
            if (meShare) {
                const grpRes = await client.query(`SELECT name FROM expense_groups WHERE id = $1`, [req.params.id]);
                const groupName = grpRes.rows[0]?.name || 'Group';
                if (existingTx.rows.length) {
                    await client.query(
                        `UPDATE transactions SET amount = $1, description = $2, notes = $3, date = $4 WHERE id = $5`,
                        [meShare.amount, description, `My share in ${groupName}`, splitDate, existingTx.rows[0].id]
                    );
                } else {
                    await client.query(
                        `INSERT INTO transactions (user_id, type, amount, description, notes, tags, date, group_id, split_id, source)
                         VALUES ($1, 'expense', $2, $3, $4, $5, $6, $7, $8, 'manual')`,
                        [req.user.id, meShare.amount, description,
                         `My share in ${groupName}`, '{group-split}',
                         splitDate, req.params.id, req.params.splitId]
                    );
                }
            } else if (existingTx.rows.length) {
                // "Me" was removed from the split — delete the linked transaction
                await client.query(`DELETE FROM transactions WHERE id = $1`, [existingTx.rows[0].id]);
            }

            await client.query('COMMIT');
            const full = await pool.query(
                `SELECT gs.*, COALESCE(json_agg(gss ORDER BY gss.id) FILTER (WHERE gss.id IS NOT NULL), '[]') AS shares
                 FROM group_splits gs LEFT JOIN group_split_shares gss ON gss.split_id = gs.id
                 WHERE gs.id = $1 GROUP BY gs.id`,
                [req.params.splitId]
            );
            res.json({ split: full.rows[0] });
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to update split' });
    }
});

// PATCH /api/groups/:id/splits/:splitId/shares/:shareId/settle — toggle settle
router.patch('/:id/splits/:splitId/shares/:shareId/settle', async (req, res) => {
    try {
        const { rows } = await pool.query(
            `SELECT gss.id, gss.settled FROM group_split_shares gss
             JOIN group_splits gs ON gs.id = gss.split_id
             JOIN expense_groups g ON g.id = gs.group_id
             WHERE gss.id = $1 AND gs.id = $2 AND g.id = $3 AND g.user_id = $4`,
            [req.params.shareId, req.params.splitId, req.params.id, req.user.id]
        );
        if (!rows.length) return res.status(404).json({ error: 'Share not found' });

        const newSettled = !rows[0].settled;
        const updated = await pool.query(
            `UPDATE group_split_shares SET settled = $1, settled_at = $2 WHERE id = $3 RETURNING *`,
            [newSettled, newSettled ? new Date() : null, req.params.shareId]
        );
        res.json({ share: updated.rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to toggle settlement' });
    }
});

// GET /api/groups/:id/settlements — greedy debt simplification
router.get('/:id/settlements', async (req, res) => {
    try {
        const { rows: group } = await pool.query(
            `SELECT id FROM expense_groups WHERE id = $1 AND user_id = $2`,
            [req.params.id, req.user.id]
        );
        if (!group.length) return res.status(404).json({ error: 'Group not found' });

        const { rows: shares } = await pool.query(
            `SELECT gss.member, gs.paid_by, gss.amount, gss.settled
             FROM group_split_shares gss
             JOIN group_splits gs ON gs.id = gss.split_id
             WHERE gs.group_id = $1 AND gss.settled = FALSE`,
            [req.params.id]
        );

        // Build net balance map: positive = owed money, negative = owes money
        const balance = {};
        for (const s of shares) {
            if (s.member === s.paid_by) continue;
            balance[s.paid_by] = (balance[s.paid_by] || 0) + parseFloat(s.amount);
            balance[s.member]  = (balance[s.member]  || 0) - parseFloat(s.amount);
        }

        // Greedy simplification
        const creditors = Object.entries(balance).filter(([,v]) => v > 0).map(([n,v]) => ({ name: n, amount: v }));
        const debtors   = Object.entries(balance).filter(([,v]) => v < 0).map(([n,v]) => ({ name: n, amount: -v }));
        creditors.sort((a,b) => b.amount - a.amount);
        debtors.sort((a,b) => b.amount - a.amount);

        const settlements = [];
        let ci = 0, di = 0;
        while (ci < creditors.length && di < debtors.length) {
            const settle = Math.min(creditors[ci].amount, debtors[di].amount);
            settlements.push({ from: debtors[di].name, to: creditors[ci].name, amount: parseFloat(settle.toFixed(2)) });
            creditors[ci].amount -= settle;
            debtors[di].amount   -= settle;
            if (creditors[ci].amount < 0.01) ci++;
            if (debtors[di].amount   < 0.01) di++;
        }

        res.json({ settlements });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to calculate settlements' });
    }
});

module.exports = router;
