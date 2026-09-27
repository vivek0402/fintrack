import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/plugins/FinTrackNativePlugin', () => ({
    FinTrackNative: {
        saveToken: vi.fn(async () => {}),
        clearToken: vi.fn(async () => {}),
        clearLock: vi.fn(async () => {}),
        clearWidgetToken: vi.fn(async () => {}),
    },
}));

import { useAuthStore } from './authStore';
import { NOTIF_PREFS_KEY } from '@/lib/notificationPrefs';

describe('authStore.logout', () => {
    beforeEach(() => {
        localStorage.clear();
        useAuthStore.setState({
            user: { id: 'u1', full_name: 'A', email: 'a@b.c', currency: 'INR' },
            token: 't', refreshToken: 'r', isLoading: false,
        });
    });

    // Every logout path goes through here, including lib/api.ts forceLogout().
    it('drops the cached notification prefs so the next user on this device starts clean', () => {
        localStorage.setItem(NOTIF_PREFS_KEY, JSON.stringify({ budgetAlerts: false }));
        localStorage.setItem('unrelated', 'keep');
        useAuthStore.getState().logout();
        expect(localStorage.getItem(NOTIF_PREFS_KEY)).toBeNull();
        expect(localStorage.getItem('unrelated')).toBe('keep');
        expect(useAuthStore.getState().token).toBeNull();
    });
});
