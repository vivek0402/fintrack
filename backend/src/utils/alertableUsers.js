// Who the per-user alert crons in index.js (bills due, card due, month-end
// budget, goal deadline, ...) run for. sendToUser always records the alert in
// the in-app bell and only pushes when the user has FCM tokens, so these crons
// must not be limited to Android users: web-only users read the same alerts in
// the bell.
//
// "Alertable" = any user who could plausibly see the alert, bounded so the
// crons don't loop over long-abandoned accounts:
//   - has a registered push token (everyone who got these alerts before), or
//   - added a transaction in the last ACTIVE_WINDOW_DAYS days, or
//   - signed in / refreshed a session in the last ACTIVE_WINDOW_DAYS days
//     (a refresh_tokens row is created on every login and every rotation).
// There is no users.last_login_at column; refresh_tokens.created_at is the
// closest login signal.
//
// Not used by the AI briefing / opportunity crons (they keep their own,
// narrower 2-7 day activity windows to bound AI cost) or by the push-only
// nudges (8pm daily reminder, inactivity reminder).

const ACTIVE_WINDOW_DAYS = 60;

// A plain SELECT of user ids with no bind parameters, so crons that pick rows
// by a JOIN (goals, personal loans) can embed it as `user_id IN (...)` without
// renumbering their own parameters.
const ALERTABLE_USER_IDS_SQL = `
    SELECT u.id FROM users u
    WHERE EXISTS (SELECT 1 FROM user_fcm_tokens ft WHERE ft.user_id = u.id)
       OR EXISTS (
           SELECT 1 FROM transactions t
           WHERE t.user_id = u.id AND t.created_at > NOW() - INTERVAL '${ACTIVE_WINDOW_DAYS} days'
       )
       OR EXISTS (
           SELECT 1 FROM refresh_tokens rt
           WHERE rt.user_id = u.id AND rt.created_at > NOW() - INTERVAL '${ACTIVE_WINDOW_DAYS} days'
       )
`;

/** @returns {Promise<string[]>} ids of users the alert crons should run for */
async function fetchAlertableUserIds(pool) {
    const { rows } = await pool.query(ALERTABLE_USER_IDS_SQL);
    return rows.map(r => r.id);
}

module.exports = { fetchAlertableUserIds, ALERTABLE_USER_IDS_SQL, ACTIVE_WINDOW_DAYS };
