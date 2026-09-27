const {
    PREF_KEYS,
    prefKeyForAlert,
    shouldPush,
    effectivePrefs,
    validatePrefsPayload,
    bellTypeFor,
} = require('../src/utils/notificationPrefs');

describe('prefKeyForAlert', () => {
    test.each([
        ['bill_due:1:2026-10-01', 'billReminders'],
        ['bills_week:2026-10-01', 'billReminders'],
        ['bill_changed:1:2026-10', 'billReminders'],
        ['cc_due:c1:2026-10-05', 'billReminders'],
        ['personal_loan_due:l1:2026-10-05', 'billReminders'],
        ['budget_breach:3:2026-10:80', 'budgetAlerts'],
        ['month_end_budget:3:2026-10', 'budgetAlerts'],
        ['large_tx:tx1', 'budgetAlerts'],
        ['cat_spike:5:2026-10', 'budgetAlerts'],
        ['high_tx_count:u1:2026-10-01', 'budgetAlerts'],
        ['goal_milestone:g1:50', 'goalAlerts'],
        ['goal_deadline:g1:2026-12-01', 'goalAlerts'],
        ['goal_inactive:g1:2026-10', 'goalAlerts'],
        ['savings_total:100000', 'goalAlerts'],
        ['weekly_summary:2026-10-04', 'weeklySummary'],
        ['midmonth:2026-10', 'weeklySummary'],
        ['weekend_spike:2026-10-04', 'weeklySummary'],
        ['day_pattern:2026-10', 'weeklySummary'],
        ['weekly_briefing:2026-09-28', 'weeklySummary'],
        ['daily_briefing:2026-10-01', 'weeklySummary'],
    ])('%s -> %s', (key, pref) => {
        expect(prefKeyForAlert(key)).toBe(pref);
    });

    test.each(['daily_reminder:2026-10-01', 'inactivity:2026-10-01', 'salary_missing:2026-10', 'streak:7:2026-10', 'unknown:1', 'constructor:1', '__proto__:1', 'toString', 'hasOwnProperty:x', '', null, undefined])(
        '%s is unmapped', (key) => {
            expect(prefKeyForAlert(key)).toBeNull();
        }
    );

    test('every mapped toggle is a known pref key', () => {
        const { PREFIX_TO_PREF } = require('../src/utils/notificationPrefs');
        for (const pref of Object.values(PREFIX_TO_PREF)) expect(PREF_KEYS).toContain(pref);
    });
});

describe('shouldPush', () => {
    test('defaults to send with no prefs or an unmapped key', () => {
        expect(shouldPush(null, 'bill_due:1:x')).toBe(true);
        expect(shouldPush(undefined, 'bill_due:1:x')).toBe(true);
        expect(shouldPush({ billReminders: false }, 'streak:7:2026-10')).toBe(true);
        expect(shouldPush({ billReminders: false }, null)).toBe(true);
    });

    test('mutes only the category turned off', () => {
        const prefs = { billReminders: false, budgetAlerts: true };
        expect(shouldPush(prefs, 'cc_due:c1:2026-10-05')).toBe(false);
        expect(shouldPush(prefs, 'budget_breach:3:2026-10:80')).toBe(true);
        expect(shouldPush(prefs, 'goal_milestone:g1:50')).toBe(true); // key absent = on
    });
});

describe('effectivePrefs', () => {
    test('fills every key, defaulting to on', () => {
        expect(effectivePrefs(null)).toEqual({ budgetAlerts: true, billReminders: true, goalAlerts: true, weeklySummary: true });
        expect(effectivePrefs({ goalAlerts: false, junk: false })).toEqual({ budgetAlerts: true, billReminders: true, goalAlerts: false, weeklySummary: true });
    });
});

describe('validatePrefsPayload', () => {
    test('accepts a partial object of known boolean keys', () => {
        expect(validatePrefsPayload({ goalAlerts: false })).toEqual({ prefs: { goalAlerts: false } });
    });

    test.each([
        [null],
        [[]],
        ['x'],
        [{}],
        [{ goalAlerts: 'no' }],
        [{ pushEverything: true }],
        [{ goalAlerts: true, __proto__x: true }],
    ])('rejects %p', (body) => {
        expect(validatePrefsPayload(body).error).toEqual(expect.any(String));
    });
});

describe('bellTypeFor', () => {
    test('keeps a data.type that is already a bell type', () => {
        expect(bellTypeFor('large_tx:tx1', { type: 'info' })).toBe('info');
        expect(bellTypeFor('cc_due:c1:x', { type: 'bill' })).toBe('bill');
    });

    test('derives from the category otherwise, falling back to info', () => {
        expect(bellTypeFor('budget_breach:3:x:80', { type: 'budget_alert' })).toBe('budget');
        expect(bellTypeFor('goal_milestone:g1:50', {})).toBe('goal');
        expect(bellTypeFor('weekly_briefing:x', { type: 'weekly_briefing' })).toBe('summary');
        expect(bellTypeFor('streak:7:x', { type: 'streak' })).toBe('info');
        expect(bellTypeFor(null, undefined)).toBe('info');
        expect(bellTypeFor('constructor:1', {})).toBe('info');
        expect(shouldPush({ budgetAlerts: false }, 'constructor:1')).toBe(true);
    });
});
