import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./api', () => ({
    notificationsAPI: {
        getPrefs: vi.fn(),
        updatePrefs: vi.fn(),
    },
}));

import { notificationsAPI } from './api';
import {
    DEFAULT_NOTIF_PREFS, NOTIF_PREFS_KEY, loadNotificationPrefs, saveNotificationPrefs,
} from './notificationPrefs';

const getPrefs = vi.mocked(notificationsAPI.getPrefs);
const updatePrefs = vi.mocked(notificationsAPI.updatePrefs);
const cache = () => JSON.parse(localStorage.getItem(NOTIF_PREFS_KEY) || 'null');

describe('loadNotificationPrefs', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
        updatePrefs.mockResolvedValue({ data: {} } as never);
    });

    it('uses the server copy and refreshes the localStorage cache', async () => {
        localStorage.setItem(NOTIF_PREFS_KEY, JSON.stringify({ ...DEFAULT_NOTIF_PREFS, goalAlerts: false }));
        getPrefs.mockResolvedValue({ data: { prefs: { ...DEFAULT_NOTIF_PREFS, billReminders: false }, stored: true } } as never);

        const prefs = await loadNotificationPrefs();

        expect(prefs).toEqual({ ...DEFAULT_NOTIF_PREFS, billReminders: false });
        expect(cache()).toEqual({ ...DEFAULT_NOTIF_PREFS, billReminders: false });
        expect(updatePrefs).not.toHaveBeenCalled();
    });

    it('uploads local prefs once when the server has none stored', async () => {
        localStorage.setItem(NOTIF_PREFS_KEY, JSON.stringify({ weeklySummary: false }));
        getPrefs.mockResolvedValue({ data: { prefs: DEFAULT_NOTIF_PREFS, stored: false } } as never);

        const prefs = await loadNotificationPrefs();

        const expected = { ...DEFAULT_NOTIF_PREFS, weeklySummary: false };
        expect(prefs).toEqual(expected);
        expect(updatePrefs).toHaveBeenCalledWith(expected);
    });

    it('does not upload when neither side has prefs', async () => {
        getPrefs.mockResolvedValue({ data: { prefs: DEFAULT_NOTIF_PREFS, stored: false } } as never);

        expect(await loadNotificationPrefs()).toEqual(DEFAULT_NOTIF_PREFS);
        expect(updatePrefs).not.toHaveBeenCalled();
    });

    it('falls back to the cache when the API is unreachable', async () => {
        localStorage.setItem(NOTIF_PREFS_KEY, JSON.stringify({ budgetAlerts: false }));
        getPrefs.mockRejectedValue(new Error('offline'));

        expect(await loadNotificationPrefs()).toEqual({ ...DEFAULT_NOTIF_PREFS, budgetAlerts: false });
    });
});

describe('saveNotificationPrefs', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
    });

    it('writes the cache and PUTs to the API', async () => {
        updatePrefs.mockResolvedValue({ data: {} } as never);
        const next = { ...DEFAULT_NOTIF_PREFS, goalAlerts: false };

        await saveNotificationPrefs(next);

        expect(cache()).toEqual(next);
        expect(updatePrefs).toHaveBeenCalledWith(next);
    });

    it('rejects when the API save fails so the caller can revert', async () => {
        updatePrefs.mockRejectedValue(new Error('500'));
        await expect(saveNotificationPrefs(DEFAULT_NOTIF_PREFS)).rejects.toThrow('500');
    });
});
