const express = require('express');
const pool = require('../db/pool');
const auth = require('../middleware/auth');
const { isNonNegativeNumber, isValidDateString, isValidMilestoneStatus } = require('../utils/validation');
const { nonSpendingExclusionSQL } = require('../utils/savingsRate');
const router = express.Router();

router.use(auth);

// Returns [start, end) date strings (YYYY-MM-DD) covering the last `n` full calendar months
// (i.e. excluding the current, in-progress month).
function lastNFullMonthsRange(n) {
    const now = new Date();
    const end = new Date(now.getFullYear(), now.getMonth(), 1);
    const start = new Date(now.getFullYear(), now.getMonth() - n, 1);
    return {
        start: start.toISOString().split('T')[0],
        end: end.toISOString().split('T')[0],
    };
}

async function getAverageMonthlySavings(userId) {
    const { start, end } = lastNFullMonthsRange(3);
    const result = await pool.query(
        `SELECT type, COALESCE(SUM(amount), 0) AS total FROM transactions
         WHERE user_id = $1 AND date >= $2 AND date < $3
         AND ${nonSpendingExclusionSQL('transactions')}
         GROUP BY type`,
        [userId, start, end]
    );

    let income = 0, expenses = 0;
    for (const row of result.rows) {
        if (row.type === 'income') income = parseFloat(row.total);
        if (row.type === 'expense') expenses = parseFloat(row.total);
    }
    return (income - expenses) / 3;
}

function computeFeasibility(milestone, average_monthly_savings) {
    const today = new Date();
    const targetDate = new Date(milestone.target_date);

    const days_remaining = Math.ceil((targetDate - today) / (1000 * 60 * 60 * 24));
    const months_remaining = Math.floor(days_remaining / 30);

    const feasibility = { days_remaining, months_remaining };

    const target_amount = milestone.target_amount !== null ? parseFloat(milestone.target_amount) : null;
    const current_amount = parseFloat(milestone.current_amount || 0);

    if (target_amount !== null && target_amount > 0) {
        const amount_remaining = target_amount - current_amount;
        const monthly_needed = months_remaining > 0 ? amount_remaining / months_remaining : 0;
        feasibility.amount_remaining = parseFloat(amount_remaining.toFixed(2));
        feasibility.monthly_needed = parseFloat(monthly_needed.toFixed(2));
        feasibility.is_on_track = monthly_needed <= average_monthly_savings;
    }

    const result = { feasibility };
    if (days_remaining < 0 && milestone.status !== 'achieved') {
        result.overdue = true;
    }
    return result;
}

router.get('/', async (req, res) => {
    try {
        const [milestonesRes, average_monthly_savings] = await Promise.all([
            pool.query(
                `SELECT m.*, p.name AS parent_name
                 FROM milestones m
                 LEFT JOIN milestones p ON m.parent_id = p.id
                 WHERE m.user_id = $1
                 ORDER BY m.target_date ASC`,
                [req.user.id]
            ),
            getAverageMonthlySavings(req.user.id),
        ]);

        const milestones = milestonesRes.rows.map(row => ({
            ...row,
            ...computeFeasibility(row, average_monthly_savings),
        }));

        res.json({ milestones });
    } catch (err) {
        console.error('[Milestones]', err.message);
        res.status(500).json({ error: 'Server error.' });
    }
});

router.post('/', async (req, res) => {
    try {
        const {
            name, description, target_date, target_amount, current_amount,
            parent_id, priority, notes,
        } = req.body || {};

        if (!name || !name.trim()) {
            return res.status(400).json({ error: 'name is required.' });
        }
        if (!target_date || !isValidDateString(target_date)) {
            return res.status(400).json({ error: 'target_date is required and must be a valid date.' });
        }
        if (target_amount !== undefined && target_amount !== null && !isNonNegativeNumber(target_amount)) {
            return res.status(400).json({ error: 'target_amount must be >= 0.' });
        }

        if (parent_id) {
            const parentRes = await pool.query('SELECT id FROM milestones WHERE id = $1 AND user_id = $2', [parent_id, req.user.id]);
            if (parentRes.rows.length === 0) {
                return res.status(404).json({ error: 'parent_id not found.' });
            }
        }

        const result = await pool.query(
            `INSERT INTO milestones
                (user_id, name, description, target_date, target_amount, current_amount, parent_id, priority, notes)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             RETURNING *`,
            [
                req.user.id, name, description || null, target_date,
                target_amount !== undefined ? target_amount : null,
                current_amount !== undefined ? current_amount : 0,
                parent_id || null,
                priority !== undefined ? priority : 0,
                notes || null,
            ]
        );

        const average_monthly_savings = await getAverageMonthlySavings(req.user.id);
        const milestone = { ...result.rows[0], ...computeFeasibility(result.rows[0], average_monthly_savings) };

        res.status(201).json({ milestone });
    } catch (err) {
        console.error('[Milestones]', err.message);
        res.status(500).json({ error: 'Server error.' });
    }
});

// Walks up the parent chain starting from `startId`, returning true if `targetId` is found
// (i.e. targetId is an ancestor of startId — assigning targetId as startId's descendant's parent would cycle).
async function chainContains(startId, targetId, userId) {
    let currentId = startId;
    const MAX_DEPTH = 1000;
    for (let i = 0; i < MAX_DEPTH; i++) {
        if (currentId === targetId) return true;
        const result = await pool.query('SELECT parent_id FROM milestones WHERE id = $1 AND user_id = $2', [currentId, userId]);
        if (result.rows.length === 0 || result.rows[0].parent_id === null) return false;
        currentId = result.rows[0].parent_id;
    }
    return false;
}

router.patch('/:id', async (req, res) => {
    try {
        const existingRes = await pool.query('SELECT * FROM milestones WHERE id = $1', [req.params.id]);
        if (existingRes.rows.length === 0) return res.status(404).json({ error: 'Milestone not found.' });
        if (existingRes.rows[0].user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden.' });
        const existing = existingRes.rows[0];

        const {
            name, description, target_date, target_amount, current_amount,
            parent_id, priority, notes, status,
        } = req.body || {};

        if (name !== undefined && !name.trim()) {
            return res.status(400).json({ error: 'name cannot be empty.' });
        }
        if (target_date !== undefined && !isValidDateString(target_date)) {
            return res.status(400).json({ error: 'target_date must be a valid date.' });
        }
        if (target_amount !== undefined && target_amount !== null && !isNonNegativeNumber(target_amount)) {
            return res.status(400).json({ error: 'target_amount must be >= 0.' });
        }
        if (status !== undefined && !isValidMilestoneStatus(status)) {
            return res.status(400).json({ error: 'Invalid status.' });
        }

        if (parent_id !== undefined && parent_id !== null) {
            if (parent_id === req.params.id) {
                return res.status(400).json({ error: 'This would create a circular dependency' });
            }
            const parentRes = await pool.query('SELECT id FROM milestones WHERE id = $1 AND user_id = $2', [parent_id, req.user.id]);
            if (parentRes.rows.length === 0) {
                return res.status(404).json({ error: 'parent_id not found.' });
            }
            const isCycle = await chainContains(parent_id, req.params.id, req.user.id);
            if (isCycle) {
                return res.status(400).json({ error: 'This would create a circular dependency' });
            }
        }

        const result = await pool.query(
            `UPDATE milestones SET
                name = $1, description = $2, target_date = $3, target_amount = $4,
                current_amount = $5, parent_id = $6, priority = $7, notes = $8,
                status = $9, updated_at = NOW()
             WHERE id = $10 AND user_id = $11 RETURNING *`,
            [
                name !== undefined ? name : existing.name,
                description !== undefined ? description : existing.description,
                target_date !== undefined ? target_date : existing.target_date,
                target_amount !== undefined ? target_amount : existing.target_amount,
                current_amount !== undefined ? current_amount : existing.current_amount,
                parent_id !== undefined ? parent_id : existing.parent_id,
                priority !== undefined ? priority : existing.priority,
                notes !== undefined ? notes : existing.notes,
                status !== undefined ? status : existing.status,
                req.params.id,
                req.user.id,
            ]
        );

        const average_monthly_savings = await getAverageMonthlySavings(req.user.id);
        const milestone = { ...result.rows[0], ...computeFeasibility(result.rows[0], average_monthly_savings) };

        res.json({ milestone });
    } catch (err) {
        console.error('[Milestones]', err.message);
        res.status(500).json({ error: 'Server error.' });
    }
});

router.patch('/:id/progress', async (req, res) => {
    try {
        const existingRes = await pool.query('SELECT * FROM milestones WHERE id = $1', [req.params.id]);
        if (existingRes.rows.length === 0) return res.status(404).json({ error: 'Milestone not found.' });
        if (existingRes.rows[0].user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden.' });
        const existing = existingRes.rows[0];

        const { current_amount, status } = req.body || {};

        if (current_amount === undefined && status === undefined) {
            return res.status(400).json({ error: 'At least one of current_amount or status is required.' });
        }
        if (current_amount !== undefined) {
            if (!isNonNegativeNumber(current_amount)) {
                return res.status(400).json({ error: 'current_amount must be >= 0.' });
            }
            const target_amount = existing.target_amount !== null ? parseFloat(existing.target_amount) : null;
            if (target_amount !== null && parseFloat(current_amount) > target_amount) {
                return res.status(400).json({ error: 'current_amount cannot exceed target_amount.' });
            }
        }
        if (status !== undefined && !isValidMilestoneStatus(status)) {
            return res.status(400).json({ error: 'Invalid status.' });
        }

        let resolvedStatus = status !== undefined ? status : existing.status;
        const resolvedAmount = current_amount !== undefined ? current_amount : existing.current_amount;

        if (status === undefined && existing.target_amount !== null
            && parseFloat(resolvedAmount) === parseFloat(existing.target_amount)) {
            resolvedStatus = 'achieved';
        }

        const result = await pool.query(
            `UPDATE milestones SET current_amount = $1, status = $2, updated_at = NOW()
             WHERE id = $3 AND user_id = $4 RETURNING *`,
            [resolvedAmount, resolvedStatus, req.params.id, req.user.id]
        );

        const average_monthly_savings = await getAverageMonthlySavings(req.user.id);
        const milestone = { ...result.rows[0], ...computeFeasibility(result.rows[0], average_monthly_savings) };

        res.json({ milestone });
    } catch (err) {
        console.error('[Milestones]', err.message);
        res.status(500).json({ error: 'Server error.' });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        const existingRes = await pool.query('SELECT user_id FROM milestones WHERE id = $1', [req.params.id]);
        if (existingRes.rows.length === 0) return res.status(404).json({ error: 'Milestone not found.' });
        if (existingRes.rows[0].user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden.' });

        const childrenRes = await pool.query('SELECT COUNT(*)::int AS count FROM milestones WHERE parent_id = $1', [req.params.id]);
        const children_unlinked = childrenRes.rows[0].count;

        await pool.query('DELETE FROM milestones WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);

        res.json({ message: 'Milestone deleted', children_unlinked });
    } catch (err) {
        console.error('[Milestones]', err.message);
        res.status(500).json({ error: 'Server error.' });
    }
});

module.exports = router;
