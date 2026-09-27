// Exercises fcm.js's own logic (init guard, message shape, stale-token detection,
// bell rows, notification-settings muting) against mocks of the firebase-admin
// v14 modular API boundary (firebase-admin/app, firebase-admin/messaging) and
// the db pool.

const mockSendEachForMulticast = jest.fn();
const mockMessagingInstance = { sendEachForMulticast: mockSendEachForMulticast };

const mockCert = jest.fn((serviceAccount) => ({ __cert: serviceAccount }));
const mockInitializeApp = jest.fn((config) => ({ __app: config }));
const mockGetMessaging = jest.fn(() => mockMessagingInstance);

jest.mock('firebase-admin/app', () => ({
    initializeApp: (...args) => mockInitializeApp(...args),
    cert: (...args) => mockCert(...args),
}));

jest.mock('firebase-admin/messaging', () => ({
    getMessaging: (...args) => mockGetMessaging(...args),
}));

const mockQuery = jest.fn();
jest.mock('../src/db/pool', () => ({
    query: (...args) => mockQuery(...args),
}));

const SERVICE_ACCOUNT_JSON = JSON.stringify({
    project_id: 'test-project',
    client_email: 'test@test.iam.gserviceaccount.com',
    private_key: 'fake-key',
});

/**
 * fcm.js calls initFirebase() at module load time, so each test that needs a
 * fresh init must reset the module registry and re-require it.
 */
function loadFcmModule({ withServiceAccount = true } = {}) {
    jest.resetModules();
    mockSendEachForMulticast.mockReset();
    mockCert.mockClear();
    mockInitializeApp.mockClear();
    mockGetMessaging.mockClear();
    mockQuery.mockReset();

    if (withServiceAccount) {
        process.env.FIREBASE_SERVICE_ACCOUNT_JSON = SERVICE_ACCOUNT_JSON;
    } else {
        delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    }

    // Re-bind the mocks after resetModules (jest.mock factories above are
    // hoisted and remain registered, so the require below reuses them).
    return require('../src/utils/fcm');
}

/**
 * Routes pool.query by SQL so tests don't depend on query order.
 * @param opts.tokens       rows for the user_fcm_tokens SELECT
 * @param opts.prefs        users.notification_prefs value (null = never set)
 * @param opts.bellError    make the notifications INSERT reject with this error
 * @param opts.prefsError   make the prefs SELECT reject with this error
 * @param opts.logRowCounts successive rowCounts for notification_log INSERTs
 */
function routeQueries({ tokens = [], prefs = null, bellError = null, prefsError = null, logRowCounts = [1] } = {}) {
    const logCounts = [...logRowCounts];
    mockQuery.mockImplementation(async (sql) => {
        if (/FROM users/.test(sql)) {
            if (prefsError) throw prefsError;
            return { rows: [{ notification_prefs: prefs }] };
        }
        if (/INSERT INTO notifications/.test(sql)) {
            if (bellError) throw bellError;
            return { rowCount: 1 };
        }
        if (/INSERT INTO notification_log/.test(sql)) {
            return { rowCount: logCounts.length ? logCounts.shift() : 0 };
        }
        if (/SELECT token FROM user_fcm_tokens/.test(sql)) return { rows: tokens.map(token => ({ token })) };
        if (/DELETE FROM user_fcm_tokens/.test(sql)) return {};
        throw new Error(`unexpected SQL: ${sql}`);
    });
}

const callsMatching = (re) => mockQuery.mock.calls.filter(([sql]) => re.test(sql));

afterEach(() => {
    delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
});

describe('fcm.js (firebase-admin v14 modular API)', () => {
    test('initializes via modular cert()/initializeApp()/getMessaging()', () => {
        loadFcmModule();

        expect(mockCert).toHaveBeenCalledWith(
            expect.objectContaining({ project_id: 'test-project' })
        );
        expect(mockInitializeApp).toHaveBeenCalledWith(
            expect.objectContaining({ credential: expect.anything() })
        );
        expect(mockGetMessaging).toHaveBeenCalledWith(
            expect.objectContaining({ __app: expect.anything() })
        );
    });

    test('without a service account, sendToUser still records the bell row but never looks up tokens', async () => {
        const fcm = loadFcmModule({ withServiceAccount: false });
        routeQueries({ tokens: ['tok-1'] });

        expect(mockInitializeApp).not.toHaveBeenCalled();

        await expect(
            fcm.sendToUser('user-1', { title: 't', body: 'b' })
        ).resolves.toBeUndefined();
        expect(callsMatching(/INSERT INTO notifications/)).toHaveLength(1);
        expect(callsMatching(/user_fcm_tokens/)).toHaveLength(0);
    });

    test('sendToUser calls sendEachForMulticast with the tokens/notification/data/android shape', async () => {
        const fcm = loadFcmModule();
        routeQueries({ tokens: ['tok-1', 'tok-2'] });
        mockSendEachForMulticast.mockResolvedValueOnce({
            responses: [{ success: true }, { success: true }],
        });

        await fcm.sendToUser('user-1', { title: 'Hi', body: 'There', data: { count: 3 } });

        expect(mockSendEachForMulticast).toHaveBeenCalledTimes(1);
        const message = mockSendEachForMulticast.mock.calls[0][0];
        expect(message.tokens).toEqual(['tok-1', 'tok-2']);
        expect(message.notification).toEqual({ title: 'Hi', body: 'There' });
        expect(message.data).toEqual({ count: '3' }); // values stringified
        expect(message.android).toEqual({
            priority: 'high',
            notification: { channelId: 'fintrack_alerts', sound: 'default' },
        });
    });

    test('deletes only tokens with registration-token-not-registered or invalid-registration-token errors', async () => {
        const fcm = loadFcmModule();
        routeQueries({ tokens: ['tok-good', 'tok-unregistered', 'tok-invalid', 'tok-other-error'] });

        mockSendEachForMulticast.mockResolvedValueOnce({
            responses: [
                { success: true },
                { success: false, error: { code: 'messaging/registration-token-not-registered' } },
                { success: false, error: { code: 'messaging/invalid-registration-token' } },
                { success: false, error: { code: 'messaging/internal-error' } },
            ],
        });

        await fcm.sendToUser('user-1', { title: 't', body: 'b' });

        const deletes = callsMatching(/DELETE FROM user_fcm_tokens/);
        expect(deletes).toHaveLength(1);
        expect(deletes[0][1][0]).toEqual(['tok-unregistered', 'tok-invalid']);
    });

    test('does not issue a DELETE when all sends succeed', async () => {
        const fcm = loadFcmModule();
        routeQueries({ tokens: ['tok-1'] });
        mockSendEachForMulticast.mockResolvedValueOnce({ responses: [{ success: true }] });

        await fcm.sendToUser('user-1', { title: 't', body: 'b' });

        expect(callsMatching(/DELETE FROM user_fcm_tokens/)).toHaveLength(0);
    });

    test('sendToUser never throws even if sendEachForMulticast rejects', async () => {
        const fcm = loadFcmModule();
        routeQueries({ tokens: ['tok-1'] });
        mockSendEachForMulticast.mockRejectedValueOnce(new Error('network down'));
        const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        await expect(
            fcm.sendToUser('user-1', { title: 't', body: 'b' })
        ).resolves.toBeUndefined();
        errSpy.mockRestore();
    });

    test('notifyOnce sends only on first call for a given (user, alertKey) pair', async () => {
        const fcm = loadFcmModule();
        routeQueries({ tokens: ['tok-1'], logRowCounts: [1, 0] });
        mockSendEachForMulticast.mockResolvedValueOnce({ responses: [{ success: true }] });

        const first = await fcm.notifyOnce('user-1', 'alert-key', { title: 't', body: 'b' });
        expect(first).toBe(true);
        expect(mockSendEachForMulticast).toHaveBeenCalledTimes(1);

        const second = await fcm.notifyOnce('user-1', 'alert-key', { title: 't', body: 'b' });
        expect(second).toBe(false);
        expect(mockSendEachForMulticast).toHaveBeenCalledTimes(1); // not called again
        expect(callsMatching(/INSERT INTO notifications/)).toHaveLength(1);
    });
});

describe('sendToUser: in-app bell rows', () => {
    test('inserts a bell row even when the user has no FCM tokens', async () => {
        const fcm = loadFcmModule();
        routeQueries({ tokens: [] });

        await fcm.sendToUser('user-1', {
            title: 'Card due',
            body: 'Pay it',
            data: { type: 'bill', deepLink: '/accounts' },
        }, { alertKey: 'cc_due:c1:2026-10-05' });

        const inserts = callsMatching(/INSERT INTO notifications/);
        expect(inserts).toHaveLength(1);
        const [sql, params] = inserts[0];
        expect(sql).toMatch(/ON CONFLICT \(user_id, id\) DO NOTHING/);
        expect(params).toEqual(['srv:cc_due:c1:2026-10-05', 'user-1', 'Card due', 'Pay it', 'bill', '/accounts']);
        expect(mockSendEachForMulticast).not.toHaveBeenCalled();
    });

    test('derives the bell type from the alert category when data.type is not a bell type', async () => {
        const fcm = loadFcmModule();
        routeQueries({ tokens: [] });

        await fcm.sendToUser('user-1', { title: 't', body: 'b', data: { type: 'bill_reminder' } }, { alertKey: 'bill_due:9:2026-10-01' });

        const [, params] = callsMatching(/INSERT INTO notifications/)[0];
        expect(params[4]).toBe('bill');
        expect(params[5]).toBeNull();
    });

    test('unkeyed sends get distinct random srv: ids', async () => {
        const fcm = loadFcmModule();
        routeQueries({ tokens: [] });

        await fcm.sendToUser('user-1', { title: 'a', body: 'b' });
        await fcm.sendToUser('user-1', { title: 'a', body: 'b' });

        const ids = callsMatching(/INSERT INTO notifications/).map(([, p]) => p[0]);
        expect(ids[0]).toMatch(/^srv:[0-9a-f-]{36}$/);
        expect(ids[0]).not.toBe(ids[1]);
    });

    test('a failed bell insert is logged, does not throw, and does not block the push', async () => {
        const fcm = loadFcmModule();
        routeQueries({ tokens: ['tok-1'], bellError: new Error('db down') });
        mockSendEachForMulticast.mockResolvedValueOnce({ responses: [{ success: true }] });
        const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        await expect(
            fcm.sendToUser('user-1', { title: 't', body: 'b' }, { alertKey: 'bill_due:1:2026-10-01' })
        ).resolves.toBeUndefined();

        expect(mockSendEachForMulticast).toHaveBeenCalledTimes(1);
        expect(errSpy).toHaveBeenCalledWith('[FCM] bell insert failed:', 'db down');
        errSpy.mockRestore();
    });
});

describe('sendToUser: notification settings', () => {
    test('a muted category records the bell row but sends no FCM push', async () => {
        const fcm = loadFcmModule();
        routeQueries({ tokens: ['tok-1'], prefs: { billReminders: false } });

        await fcm.sendToUser('user-1', { title: 't', body: 'b' }, { alertKey: 'bill_due:1:2026-10-01' });

        expect(callsMatching(/INSERT INTO notifications/)).toHaveLength(1);
        expect(callsMatching(/user_fcm_tokens/)).toHaveLength(0);
        expect(mockSendEachForMulticast).not.toHaveBeenCalled();
    });

    test('other categories still push when one is muted', async () => {
        const fcm = loadFcmModule();
        routeQueries({ tokens: ['tok-1'], prefs: { billReminders: false } });
        mockSendEachForMulticast.mockResolvedValueOnce({ responses: [{ success: true }] });

        await fcm.sendToUser('user-1', { title: 't', body: 'b' }, { alertKey: 'budget_breach:3:2026-10:80' });

        expect(mockSendEachForMulticast).toHaveBeenCalledTimes(1);
    });

    test('notifyOnce writes notification_log even when muted, so re-enabling does not replay', async () => {
        const fcm = loadFcmModule();
        routeQueries({ tokens: ['tok-1'], prefs: { goalAlerts: false }, logRowCounts: [1, 0] });

        const first = await fcm.notifyOnce('user-1', 'goal_milestone:g1:50', { title: 't', body: 'b' });
        expect(first).toBe(true);
        expect(callsMatching(/INSERT INTO notification_log/)).toHaveLength(1);
        expect(callsMatching(/INSERT INTO notifications/)).toHaveLength(1);
        expect(mockSendEachForMulticast).not.toHaveBeenCalled();

        const again = await fcm.notifyOnce('user-1', 'goal_milestone:g1:50', { title: 't', body: 'b' });
        expect(again).toBe(false);
    });

    test.each([
        ['unkeyed', undefined],
        ['unmapped', 'streak:7:2026-10'],
        ['prototype-named', 'constructor:1'],
    ])('%s pushes skip the prefs query and still push', async (_label, alertKey) => {
        const fcm = loadFcmModule();
        routeQueries({ tokens: ['tok-1'], prefs: { budgetAlerts: false, billReminders: false, goalAlerts: false, weeklySummary: false } });
        mockSendEachForMulticast.mockResolvedValueOnce({ responses: [{ success: true }] });

        await fcm.sendToUser('user-1', { title: 't', body: 'b' }, { alertKey });

        expect(callsMatching(/FROM users/)).toHaveLength(0);
        expect(callsMatching(/INSERT INTO notifications/)).toHaveLength(1);
        expect(mockSendEachForMulticast).toHaveBeenCalledTimes(1);
    });

    test('mapped pushes query prefs exactly once', async () => {
        const fcm = loadFcmModule();
        routeQueries({ tokens: [] });

        await fcm.sendToUser('user-1', { title: 't', body: 'b' }, { alertKey: 'cc_due:c1:2026-10-05' });

        expect(callsMatching(/FROM users/)).toHaveLength(1);
    });

    test('a prefs lookup failure defaults to sending', async () => {
        const fcm = loadFcmModule();
        routeQueries({ tokens: ['tok-1'], prefsError: new Error('boom') });
        mockSendEachForMulticast.mockResolvedValueOnce({ responses: [{ success: true }] });
        const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        await fcm.sendToUser('user-1', { title: 't', body: 'b' }, { alertKey: 'bill_due:1:2026-10-01' });

        expect(mockSendEachForMulticast).toHaveBeenCalledTimes(1);
        errSpy.mockRestore();
    });
});
