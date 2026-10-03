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

// Shaped like the API: rows wrapped in { budgets } etc., numerics as strings.
const overBudget = { id: 'b1', category_id: 'c1', category_name: 'Food', amount: '1000.00', spent: '950.00', month: 8, year: 2026 };

describe('runNotificationCheck prefs', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
        vi.mocked(analyticsAPI.summary).mockResolvedValue({ data: { summary: { total_income: 0, total_expenses: 0 } } } as never);
        vi.mocked(budgetsAPI.getAll).mockResolvedValue({ data: { budgets: [overBudget] } } as never);
        vi.mocked(goalsAPI.getAll).mockResolvedValue({ data: { goals: [] } } as never);
        vi.mocked(recurringAPI.getAll).mockResolvedValue({ data: { recurring: [] } } as never);
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

describe('runNotificationCheck alerts (real API shapes)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
        vi.mocked(notificationsAPI.getPrefs).mockRejectedValue(new Error('offline'));
        vi.mocked(analyticsAPI.summary).mockResolvedValue({ data: { summary: { total_income: 0, total_expenses: 0 } } } as never);
        vi.mocked(budgetsAPI.getAll).mockResolvedValue({ data: { budgets: [] } } as never);
        vi.mocked(goalsAPI.getAll).mockResolvedValue({ data: { goals: [] } } as never);
        vi.mocked(recurringAPI.getAll).mockResolvedValue({ data: { recurring: [] } } as never);
    });

    it('names the budget by its category and reads string amounts', async () => {
        vi.mocked(budgetsAPI.getAll).mockResolvedValue({ data: { budgets: [overBudget] } } as never);
        await runNotificationCheck();
        expect(addInAppNotification).toHaveBeenCalledWith(expect.objectContaining({
            type: 'budget', title: 'Food budget at 95%', body: '₹50 remaining for the month',
        }));
    });

    it('alerts a bill due soon from next_due_date', async () => {
        const due = new Date(Date.now() + 2 * 86400000).toISOString().split('T')[0];
        vi.mocked(recurringAPI.getAll).mockResolvedValue({ data: { recurring: [
            { id: 'r1', description: 'Rent', amount: '15000.00', next_due_date: `${due}T00:00:00.000Z`, is_active: true },
        ] } } as never);
        await runNotificationCheck();
        expect(addInAppNotification).toHaveBeenCalledWith(expect.objectContaining({
            type: 'bill', id: `bill-r1-${due}`, body: '₹15,000 scheduled payment',
        }));
    });

    it('sends only the highest goal milestone reached, from saved_amount', async () => {
        vi.mocked(goalsAPI.getAll).mockResolvedValue({ data: { goals: [
            { id: 'g1', name: 'Trip', target_amount: '1000.00', saved_amount: '800.00', deadline: null, color: null, icon: null },
            { id: 'g2', name: 'New', target_amount: '1000.00', saved_amount: null, deadline: null, color: null, icon: null },
        ] } } as never);
        await runNotificationCheck();
        const goalCalls = vi.mocked(addInAppNotification).mock.calls.map(c => c[0]).filter(n => n.type === 'goal');
        expect(goalCalls.map(n => n.id)).toEqual(['goal-g1-75pct']);
        expect(goalCalls[0].body).toBe('₹800 of ₹1,000 saved');
    });
});
