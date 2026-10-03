import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
    getAppPrefs: vi.fn(),
    patchAppPref: vi.fn(async () => ({ data: {} })),
}));
vi.mock('@/lib/api', () => ({ profileAPI: api }));

import { syncAppPrefs } from './appPrefs';
import { getNotPaid, setNotPaid } from './cardNotPaid';
import { rememberAccount } from './accountMemory';

beforeEach(() => {
    localStorage.clear();
    api.getAppPrefs.mockReset();
    api.patchAppPref.mockClear();
});
afterEach(() => vi.useRealTimers());

describe('syncAppPrefs', () => {
    it('server copy wins over this device, including a card cleared elsewhere', async () => {
        localStorage.setItem('fintrack-cc-not-paid-3', '["2026-06-15"]');
        localStorage.setItem('fintrack-cc-not-paid-9', '["2026-05-15"]');
        localStorage.setItem('fintrack-account-memory-u1', '{"byDesc":{"swiggy":1},"byMethod":{}}');
        api.getAppPrefs.mockResolvedValue({ data: { prefs: {
            cc_not_paid: { 3: ['2026-07-15'] },
            account_memory: { byDesc: { swiggy: 2 }, byMethod: { UPI: 2 } },
        } } });
        await syncAppPrefs('u1');
        expect([...getNotPaid(3)]).toEqual(['2026-07-15']);
        expect([...getNotPaid(9)]).toEqual([]);
        expect(JSON.parse(localStorage.getItem('fintrack-account-memory-u1')!)).toEqual({ byDesc: { swiggy: 2 }, byMethod: { UPI: 2 } });
        expect(api.patchAppPref).not.toHaveBeenCalled();
    });

    it('pushes up what this device saved before syncing existed', async () => {
        localStorage.setItem('fintrack-cc-not-paid-3', '["2026-06-15"]');
        localStorage.setItem('fintrack-account-memory-u1', '{"byDesc":{"swiggy":1},"byMethod":{}}');
        api.getAppPrefs.mockResolvedValue({ data: { prefs: {} } });
        await syncAppPrefs('u1');
        expect(api.patchAppPref).toHaveBeenCalledWith('cc_not_paid', { 3: ['2026-06-15'] });
        expect(api.patchAppPref).toHaveBeenCalledWith('account_memory', { byDesc: { swiggy: 1 }, byMethod: {} });
    });

    it('offline: leaves the local copy alone', async () => {
        localStorage.setItem('fintrack-cc-not-paid-3', '["2026-06-15"]');
        api.getAppPrefs.mockRejectedValue(new Error('Network Error'));
        await syncAppPrefs('u1');
        expect([...getNotPaid(3)]).toEqual(['2026-06-15']);
        expect(api.patchAppPref).not.toHaveBeenCalled();
    });
});

describe('local changes are pushed', () => {
    it('setNotPaid sends every card, coalescing quick taps into one request', () => {
        vi.useFakeTimers();
        setNotPaid(3, '2026-06-15', true);
        setNotPaid(4, '2026-07-15', true);
        setNotPaid(3, '2026-06-15', false);
        expect(api.patchAppPref).not.toHaveBeenCalled();
        vi.advanceTimersByTime(1000);
        expect(api.patchAppPref).toHaveBeenCalledTimes(1);
        expect(api.patchAppPref).toHaveBeenCalledWith('cc_not_paid', { 4: ['2026-07-15'] });
        expect(localStorage.getItem('fintrack-cc-not-paid-3')).toBeNull();
    });

    it('rememberAccount sends the account memory', () => {
        vi.useFakeTimers();
        rememberAccount('u1', { description: 'Swiggy', type: 'expense', paymentMethod: 'UPI', accountId: 2 });
        vi.advanceTimersByTime(1000);
        expect(api.patchAppPref).toHaveBeenCalledWith('account_memory', { byDesc: { swiggy: 2 }, byMethod: { UPI: 2 } });
    });
});
