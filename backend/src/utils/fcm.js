const { initializeApp, cert } = require('firebase-admin/app');
const { getMessaging } = require('firebase-admin/messaging');
const { randomUUID } = require('crypto');
const pool = require('../db/pool');
const { shouldPush, bellTypeFor } = require('./notificationPrefs');

let _initialized = false;
let _messaging = null;

function initFirebase() {
    if (_initialized) return;
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!raw) {
        console.warn('[FCM] FIREBASE_SERVICE_ACCOUNT_JSON not set — push notifications disabled');
        return;
    }
    try {
        const serviceAccount = JSON.parse(raw);
        const app = initializeApp({ credential: cert(serviceAccount) });
        _messaging = getMessaging(app);
        _initialized = true;
        console.log('[FCM] Firebase Admin initialized ✅');
    } catch (err) {
        console.error('[FCM] Failed to initialize Firebase Admin:', err.message);
    }
}

initFirebase();

// Bell row id for a server push. Prefixed "srv:" so it can never equal a
// client-created id (numeric Date.now() strings or "budget-"/"bill-"/"goal-"/
// "weekly-summary-" keys). Keyed pushes reuse their alert key, so a repeat of
// the same alert is a no-op via ON CONFLICT; unkeyed ones get a random UUID,
// so concurrent inserts can't clash on the (user_id, id) primary key.
function bellIdFor(alertKey) {
    return `srv:${alertKey || randomUUID()}`;
}

// Stored notification_prefs for the user, or null (no prefs / lookup failed,
// both of which mean "push everything").
async function loadPrefs(userId) {
    try {
        const { rows } = await pool.query(
            'SELECT notification_prefs FROM users WHERE id = $1',
            [userId]
        );
        return rows[0]?.notification_prefs || null;
    } catch (err) {
        console.error('[FCM] loading notification prefs failed:', err.message);
        return null;
    }
}

// Records the push in the in-app bell (notifications table). Logs, never throws.
async function recordInBell(userId, alertKey, { title, body, data }) {
    try {
        await pool.query(
            `INSERT INTO notifications (id, user_id, title, body, type, deep_link)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (user_id, id) DO NOTHING`,
            [
                bellIdFor(alertKey),
                userId,
                title || 'FinTrack',
                body || null,
                bellTypeFor(alertKey, data),
                data?.deepLink ? String(data.deepLink) : null,
            ]
        );
    } catch (err) {
        console.error('[FCM] bell insert failed:', err.message);
    }
}

/**
 * Deliver a server notification: always record it in the in-app bell, then
 * push it to all the user's devices unless the toggle that governs alertKey
 * (see utils/notificationPrefs.js) is off. A muted push still lands in the
 * bell as quiet history.
 * Silent fail — never throws, never breaks callers.
 * @param opts.alertKey  e.g. "bill_due:<id>:<date>"; selects the pref toggle
 *                       and makes the bell row idempotent.
 */
async function sendToUser(userId, { title, body, data = {} }, { alertKey = null } = {}) {
    try {
        const prefs = await loadPrefs(userId);
        // Bell row first, so a foreground push's refresh already sees it.
        await recordInBell(userId, alertKey, { title, body, data });
        if (!shouldPush(prefs, alertKey)) return;
        if (!_initialized) return;

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

        const response = await _messaging.sendEachForMulticast(message);

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
 * The log row is written even when the user has muted this alert's category,
 * so turning the category back on doesn't replay old alerts.
 * Returns true if the notification was delivered (pushed or, when muted,
 * recorded in the bell), false if already sent before.
 */
async function notifyOnce(userId, alertKey, { title, body, data = {} }) {
    const { rowCount } = await pool.query(
        `INSERT INTO notification_log (user_id, alert_key) VALUES ($1, $2)
         ON CONFLICT (user_id, alert_key) DO NOTHING`,
        [userId, alertKey]
    );
    if (!rowCount) return false;
    await sendToUser(userId, { title, body, data }, { alertKey });
    return true;
}

module.exports = { sendToUser, userHasTokens, notifyOnce, bellIdFor };
