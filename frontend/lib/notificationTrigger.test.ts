import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./api', () => ({
    analyticsAPI: { summary: vi.fn() },
    budgetsAPI: { getAll: vi.fn() },
    goalsAPI: { getAll: vi.fn() },
    recurringAPI: { getAll: vi.fn() },
    notificationsAPI: { getPrefs: vi.fn(), updatePrefs: vi.fn() },
}));

vi.mock('./notifications', () => ({ addInAppNotification: vi.fn() }));

import { analyticsAPI, budgetsAPI, goalsAPI, recurringAPI, notificationsAPI } from './api';
import { addInAppNotification } from './notifications';
import { runNotificationCheck } from './notificationTrigger';
import { DEFAULT_NOTIF_PREFS, NOTIF_PREFS_KEY } from './notificationPrefs';

const overBudget = { category_id: 'c1', name: 'Food', amount: 1000, spent: 950 };

describe('runNotificationCheck prefs', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
        vi.mocked(analyticsAPI.summary).mockResolvedValue({ data: {} } as never);
        vi.mocked(budgetsAPI.getAll).mockResolvedValue({ data: [overBudget] } as never);
        vi.mocked(goalsAPI.getAll).mockResolvedValue({ data: [] } as never);
        vi.mocked(recurringAPI.getAll).mockResolvedValue({ data: [] } as never);
    });

    it('uses freshly loaded server prefs over a stale local cache', async () => {
        // This device still has budget alerts on; another device muted them.
        localStorage.setItem(NOTIF_PREFS_KEY, JSON.stringify(DEFAULT_NOTIF_PREFS));
        vi.mocked(notificationsAPI.getPrefs).mockResolvedValue({
            data: { prefs: { ...DEFAULT_NOTIF_PREFS, budgetAlerts: false }, stored: true },
        } as never);

        await runNotificationCheck();

        expect(notificationsAPI.getPrefs).toHaveBeenCalledTimes(1);
        expect(addInAppNotification).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'budget' }));
        expect(JSON.parse(localStorage.getItem(NOTIF_PREFS_KEY)!).budgetAlerts).toBe(false);
    });

    it('falls back to the cached prefs when the prefs load fails', async () => {
        localStorage.setItem(NOTIF_PREFS_KEY, JSON.stringify(DEFAULT_NOTIF_PREFS));
        vi.mocked(notificationsAPI.getPrefs).mockRejectedValue(new Error('offline'));

        await runNotificationCheck();

        expect(addInAppNotification).toHaveBeenCalledWith(expect.objectContaining({ type: 'budget', id: expect.stringMatching(/^budget-c1-/) }));
    });
});
