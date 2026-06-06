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

module.exports = router;
