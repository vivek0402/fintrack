const admin = require('firebase-admin');
const pool = require('../db/pool');

let _initialized = false;

function initFirebase() {
    if (_initialized) return;
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!raw) {
        console.warn('[FCM] FIREBASE_SERVICE_ACCOUNT_JSON not set — push notifications disabled');
        return;
    }
    try {
        const serviceAccount = JSON.parse(raw);
        admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
        _initialized = true;
        console.log('[FCM] Firebase Admin initialized ✅');
    } catch (err) {
        console.error('[FCM] Failed to initialize Firebase Admin:', err.message);
    }
}

initFirebase();

/**
 * Send a push notification to all registered devices for a user.
 * Silent fail — never throws, never breaks callers.
 */
async function sendToUser(userId, { title, body, data = {} }) {
    if (!_initialized) return;
    try {
        const { rows } = await pool.query(
            'SELECT token FROM user_fcm_tokens WHERE user_id = $1',
            [userId]
        );
        if (!rows.length) return;

        const tokens = rows.map(r => r.token);
        const message = {
            notification: { title, body },
            data: Object.fromEntries(
                Object.entries(data).map(([k, v]) => [k, String(v)])
            ),
            android: {
                priority: 'high',
                notification: { channelId: 'fintrack_alerts', sound: 'default' },
            },
            tokens,
        };

        const response = await admin.messaging().sendEachForMulticast(message);

        // Remove tokens that are no longer valid (uninstalled app, etc.)
        const staleTokens = [];
        response.responses.forEach((r, i) => {
            if (!r.success) {
                const code = r.error?.code;
                if (
                    code === 'messaging/registration-token-not-registered' ||
                    code === 'messaging/invalid-registration-token'
                ) {
                    staleTokens.push(tokens[i]);
                }
            }
        });

        if (staleTokens.length) {
            await pool.query(
                'DELETE FROM user_fcm_tokens WHERE token = ANY($1)',
                [staleTokens]
            );
        }
    } catch (err) {
        console.error('[FCM] sendToUser failed:', err.message);
    }
}

async function userHasTokens(userId) {
    try {
        const { rows } = await pool.query(
            'SELECT 1 FROM user_fcm_tokens WHERE user_id = $1 LIMIT 1',
            [userId]
        );
        return rows.length > 0;
    } catch { return false; }
}

/**
 * Send a push notification at most once per (user, alertKey) pair.
 * Relies on the UNIQUE(user_id, alert_key) constraint on notification_log —
 * the INSERT only succeeds the first time, so concurrent callers can't
 * both pass the check (no separate SELECT-then-INSERT race).
 * Returns true if the notification was sent, false if already sent before.
 */
async function notifyOnce(userId, alertKey, { title, body, data = {} }) {
    const { rowCount } = await pool.query(
        `INSERT INTO notification_log (user_id, alert_key) VALUES ($1, $2)
         ON CONFLICT (user_id, alert_key) DO NOTHING`,
        [userId, alertKey]
    );
    if (!rowCount) return false;
    await sendToUser(userId, { title, body, data });
    return true;
}

module.exports = { sendToUser, userHasTokens, notifyOnce };
