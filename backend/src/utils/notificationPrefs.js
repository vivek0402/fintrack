// Server-side view of the user's notification settings (the four toggles on
// the profile page) and the single mapping from a server push's alert key to
// the toggle that governs it. Pure functions only; fcm.js does the I/O.

// Must match the keys the profile page and frontend/lib/notificationTrigger.ts
// read from localStorage['fintrack-notif-prefs'].
const PREF_KEYS = ['budgetAlerts', 'billReminders', 'goalAlerts', 'weeklySummary'];

// Alert-key prefix (the part before the first ':') -> profile toggle.
// A prefix missing from this map is never muted (always pushed), which is
// the pre-settings behaviour.
const PREFIX_TO_PREF = Object.freeze({
    // Money going out on a schedule: bills, card dues, loan dues.
    bill_due: 'billReminders',
    bills_week: 'billReminders',
    bill_changed: 'billReminders',
    cc_due: 'billReminders',
    cc_overdue: 'billReminders',
    personal_loan_due: 'billReminders',

    // Spending against limits, and unusual-spend alerts.
    budget_breach: 'budgetAlerts',
    month_end_budget: 'budgetAlerts',
    large_tx: 'budgetAlerts',
    cat_spike: 'budgetAlerts',
    high_tx_count: 'budgetAlerts',

    // Goals and savings milestones.
    goal_milestone: 'goalAlerts',
    goal_deadline: 'goalAlerts',
    goal_inactive: 'goalAlerts',
    savings_total: 'goalAlerts',

    // Periodic digests of how spending went.
    weekly_summary: 'weeklySummary',
    midmonth: 'weeklySummary',
    weekend_spike: 'weeklySummary',
    day_pattern: 'weeklySummary',
    weekly_briefing: 'weeklySummary',
    daily_briefing: 'weeklySummary',

    // Deliberately unmapped (always pushed): daily_reminder, inactivity,
    // salary_missing, streak. None of the four toggles describes them.
});

// Bell icon category (frontend NotificationType) for each toggle.
const PREF_TO_BELL_TYPE = Object.freeze({
    billReminders: 'bill',
    budgetAlerts: 'budget',
    goalAlerts: 'goal',
    weeklySummary: 'summary',
});

const BELL_TYPES = new Set(['budget', 'goal', 'bill', 'summary', 'info']);

function alertPrefix(alertKey) {
    if (typeof alertKey !== 'string' || !alertKey) return null;
    return alertKey.split(':')[0];
}

/** Profile toggle governing this alert key, or null when none does. */
function prefKeyForAlert(alertKey) {
    const prefix = alertPrefix(alertKey);
    // Own-property check so "constructor:" / "__proto__:" can't hit Object.prototype.
    return prefix && Object.hasOwn(PREFIX_TO_PREF, prefix) ? PREFIX_TO_PREF[prefix] : null;
}

/**
 * Whether a push for alertKey should go out given the user's stored prefs.
 * Unmapped keys, missing prefs and missing toggle values all default to send.
 */
function shouldPush(prefs, alertKey) {
    const prefKey = prefKeyForAlert(alertKey);
    if (!prefKey) return true;
    if (!prefs || typeof prefs !== 'object') return true;
    return prefs[prefKey] !== false;
}

/** Stored prefs (or null) -> a full object with every toggle as a boolean. */
function effectivePrefs(stored) {
    const src = stored && typeof stored === 'object' ? stored : {};
    return Object.fromEntries(PREF_KEYS.map(k => [k, src[k] !== false]));
}

/**
 * Validates a PUT payload. Accepts a partial object of known keys with boolean
 * values. Returns { prefs } or { error }.
 */
function validatePrefsPayload(body) {
    if (!body || typeof body !== 'object' || Array.isArray(body))
        return { error: 'Preferences must be an object.' };
    const keys = Object.keys(body);
    if (!keys.length) return { error: 'No preferences given.' };
    const unknown = keys.filter(k => !PREF_KEYS.includes(k));
    if (unknown.length) return { error: `Unknown preference: ${unknown.join(', ')}` };
    const nonBool = keys.filter(k => typeof body[k] !== 'boolean');
    if (nonBool.length) return { error: `Preference must be true or false: ${nonBool.join(', ')}` };
    return { prefs: Object.fromEntries(keys.map(k => [k, body[k]])) };
}

/** Bell row type: the push's own data.type when it is a bell type, else by toggle. */
function bellTypeFor(alertKey, data = {}) {
    if (data && BELL_TYPES.has(data.type)) return data.type;
    const prefKey = prefKeyForAlert(alertKey);
    return prefKey ? PREF_TO_BELL_TYPE[prefKey] : 'info';
}

module.exports = {
    PREF_KEYS,
    PREFIX_TO_PREF,
    alertPrefix,
    prefKeyForAlert,
    shouldPush,
    effectivePrefs,
    validatePrefsPayload,
    bellTypeFor,
};
