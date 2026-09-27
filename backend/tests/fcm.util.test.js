// Exercises fcm.js's own logic (init guard, message shape, stale-token detection)
// against the real firebase-admin/app + firebase-admin/messaging modular API.
// Only the SDK boundary (getMessaging's returned messaging instance) is mocked —
// fcm.js's initialization, request-building, and response-interpretation code
// all run for real. This is the safety net that would have caught the v13 -> v14
// namespaced-API removal (admin.credential / admin.messaging going undefined).

const mockSendEachForMulticast = jest.fn();
const mockMessagingInstance = { sendEachForMulticast: mockSendEachForMulticast };

const mockCert = jest.fn((serviceAccount) => ({ __cert: serviceAccount }));
const mockInitializeApp = jest.fn((config) => ({ __app: config }));
const mockGetApps = jest.fn(() => []);
const mockGetMessaging = jest.fn(() => mockMessagingInstance);

jest.mock('firebase-admin/app', () => ({
    initializeApp: (...args) => mockInitializeApp(...args),
    cert: (...args) => mockCert(...args),
    getApps: (...args) => mockGetApps(...args),
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
function loadFcmModule({ withServiceAccount = true, existingApps = [] } = {}) {
    jest.resetModules();
    mockSendEachForMulticast.mockReset();
    mockCert.mockClear();
    mockInitializeApp.mockClear();
    mockGetMessaging.mockClear();
    mockGetApps.mockReset().mockReturnValue(existingApps);
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

describe('fcm.js (firebase-admin v14 modular API)', () => {
    afterEach(() => {
        delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    });

    test('initializes via modular cert()/initializeApp()/getMessaging() when no app exists yet', () => {
        loadFcmModule({ existingApps: [] });

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

    test('reuses an already-initialized app via getApps() guard instead of re-initializing', () => {
        loadFcmModule({ existingApps: [{ name: '[DEFAULT]' }] });

        expect(mockInitializeApp).not.toHaveBeenCalled();
        expect(mockCert).not.toHaveBeenCalled();
        // Reuses the default app's messaging instance.
        expect(mockGetMessaging).toHaveBeenCalledWith();
    });

    test('does not initialize and sendToUser is a silent no-op when service account env var is missing', async () => {
        const fcm = loadFcmModule({ withServiceAccount: false, existingApps: [] });

        expect(mockInitializeApp).not.toHaveBeenCalled();

        await expect(
            fcm.sendToUser('user-1', { title: 't', body: 'b' })
        ).resolves.toBeUndefined();
        expect(mockQuery).not.toHaveBeenCalled();
    });

    test('sendToUser calls sendEachForMulticast with the tokens/notification/data/android shape', async () => {
        const fcm = loadFcmModule({ existingApps: [] });
        mockQuery.mockResolvedValueOnce({ rows: [{ token: 'tok-1' }, { token: 'tok-2' }] });
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
        const fcm = loadFcmModule({ existingApps: [] });
        mockQuery
            .mockResolvedValueOnce({
                rows: [{ token: 'tok-good' }, { token: 'tok-unregistered' }, { token: 'tok-invalid' }, { token: 'tok-other-error' }],
            })
            .mockResolvedValueOnce({}); // the DELETE query

        mockSendEachForMulticast.mockResolvedValueOnce({
            responses: [
                { success: true },
                { success: false, error: { code: 'messaging/registration-token-not-registered' } },
                { success: false, error: { code: 'messaging/invalid-registration-token' } },
                { success: false, error: { code: 'messaging/internal-error' } },
            ],
        });

        await fcm.sendToUser('user-1', { title: 't', body: 'b' });

        expect(mockQuery).toHaveBeenCalledTimes(2);
        const [deleteSql, deleteParams] = mockQuery.mock.calls[1];
        expect(deleteSql).toMatch(/DELETE FROM user_fcm_tokens/);
        expect(deleteParams[0]).toEqual(['tok-unregistered', 'tok-invalid']);
    });

    test('does not issue a DELETE when all sends succeed', async () => {
        const fcm = loadFcmModule({ existingApps: [] });
        mockQuery.mockResolvedValueOnce({ rows: [{ token: 'tok-1' }] });
        mockSendEachForMulticast.mockResolvedValueOnce({ responses: [{ success: true }] });

        await fcm.sendToUser('user-1', { title: 't', body: 'b' });

        expect(mockQuery).toHaveBeenCalledTimes(1); // only the SELECT, no DELETE
    });

    test('sendToUser never throws even if sendEachForMulticast rejects', async () => {
        const fcm = loadFcmModule({ existingApps: [] });
        mockQuery.mockResolvedValueOnce({ rows: [{ token: 'tok-1' }] });
        mockSendEachForMulticast.mockRejectedValueOnce(new Error('network down'));

        await expect(
            fcm.sendToUser('user-1', { title: 't', body: 'b' })
        ).resolves.toBeUndefined();
    });

    test('notifyOnce sends only on first call for a given (user, alertKey) pair', async () => {
        const fcm = loadFcmModule({ existingApps: [] });
        mockQuery
            .mockResolvedValueOnce({ rowCount: 1 }) // INSERT succeeds
            .mockResolvedValueOnce({ rows: [{ token: 'tok-1' }] }) // sendToUser's SELECT
            .mockResolvedValueOnce({ rowCount: 0 }); // second notifyOnce's INSERT (conflict)
        mockSendEachForMulticast.mockResolvedValueOnce({ responses: [{ success: true }] });

        const first = await fcm.notifyOnce('user-1', 'alert-key', { title: 't', body: 'b' });
        expect(first).toBe(true);
        expect(mockSendEachForMulticast).toHaveBeenCalledTimes(1);

        const second = await fcm.notifyOnce('user-1', 'alert-key', { title: 't', body: 'b' });
        expect(second).toBe(false);
        expect(mockSendEachForMulticast).toHaveBeenCalledTimes(1); // not called again
    });
});
