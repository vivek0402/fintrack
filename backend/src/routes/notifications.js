const express = require('express');
const pool = require('../db/pool');
const auth = require('../middleware/auth');
const router = express.Router();

router.use(auth);

// Register FCM token for this device
router.post('/register-token', async (req, res) => {
    try {
        const { token, platform = 'android' } = req.body;
        if (!token || typeof token !== 'string' || token.trim().length < 10)
            return res.status(400).json({ error: 'Valid token required.' });

        await pool.query(
            `INSERT INTO user_fcm_tokens (user_id, token, platform, updated_at)
             VALUES ($1, $2, $3, NOW())
             ON CONFLICT (token) DO UPDATE
             SET user_id = $1, platform = $3, updated_at = NOW()`,
            [req.user.id, token.trim(), platform]
        );

        res.json({ ok: true });
    } catch (err) {
        console.error('[FCM] register-token error:', err.message);
        res.status(500).json({ error: 'Server error.' });
    }
});

// Unregister token (called on logout)
router.delete('/register-token', async (req, res) => {
    try {
        const { token } = req.body;
        if (!token) return res.status(400).json({ error: 'Token required.' });
        await pool.query(
            'DELETE FROM user_fcm_tokens WHERE user_id = $1 AND token = $2',
            [req.user.id, token]
        );
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: 'Server error.' });
    }
});

// Create a notification. The id is a deterministic, client-computed key per
// alert (e.g. "budget-<category_id>-<month>-<year>") so re-running the same
// rule check is a safe no-op via ON CONFLICT instead of needing a separate
// dedup pre-check query.
router.post('/', async (req, res) => {
    try {
        const { id, title, body, type, deepLink } = req.body;
        if (!id || typeof id !== 'string' || !title || typeof title !== 'string')
            return res.status(400).json({ error: 'id and title are required.' });

        await pool.query(
            `INSERT INTO notifications (id, user_id, title, body, type, deep_link)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (user_id, id) DO NOTHING`,
            [id, req.user.id, title, body || null, type || null, deepLink || null]
        );

        res.status(201).json({ ok: true });
    } catch (err) {
        console.error('[Notifications] create error:', err.message);
        res.status(500).json({ error: 'Server error.' });
    }
});

// List notifications, most recent first, with the current unread count.
router.get('/', async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
        const unreadOnly = req.query.unread_only === 'true';

        const result = await pool.query(
            `SELECT id, title, body, type, deep_link AS "deepLink", read_at AS "readAt", created_at AS "createdAt"
             FROM notifications
             WHERE user_id = $1 ${unreadOnly ? 'AND read_at IS NULL' : ''}
             ORDER BY created_at DESC
             LIMIT $2`,
            [req.user.id, limit]
        );
        const unreadRes = await pool.query(
            'SELECT COUNT(*)::int AS count FROM notifications WHERE user_id = $1 AND read_at IS NULL',
            [req.user.id]
        );

        res.json({ notifications: result.rows, unread_count: unreadRes.rows[0].count });
    } catch (err) {
        console.error('[Notifications] list error:', err.message);
        res.status(500).json({ error: 'Server error.' });
    }
});

// Delete all notifications for this user ("Clear all" in the bell panel).
router.delete('/', async (req, res) => {
    try {
        await pool.query('DELETE FROM notifications WHERE user_id = $1', [req.user.id]);
        res.json({ ok: true });
    } catch (err) {
        console.error('[Notifications] clear-all error:', err.message);
        res.status(500).json({ error: 'Server error.' });
    }
});

// Mark all unread notifications read.
router.post('/read-all', async (req, res) => {
    try {
        await pool.query(
            'UPDATE notifications SET read_at = NOW() WHERE user_id = $1 AND read_at IS NULL',
            [req.user.id]
        );
        res.json({ ok: true });
    } catch (err) {
        console.error('[Notifications] read-all error:', err.message);
        res.status(500).json({ error: 'Server error.' });
    }
});

// Mark a single notification read.
router.patch('/:id', async (req, res) => {
    try {
        await pool.query(
            'UPDATE notifications SET read_at = NOW() WHERE user_id = $1 AND id = $2',
            [req.user.id, req.params.id]
        );
        res.json({ ok: true });
    } catch (err) {
        console.error('[Notifications] mark-read error:', err.message);
        res.status(500).json({ error: 'Server error.' });
    }
});

module.exports = router;
