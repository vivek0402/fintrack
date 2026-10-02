import { beforeEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({ value: false }));
vi.mock('@capacitor/core', async (orig) => {
    const actual = await orig<typeof import('@capacitor/core')>();
    return { ...actual, Capacitor: { ...actual.Capacitor, isNativePlatform: () => native.value } };
});

vi.mock('@/plugins/FinTrackNativePlugin', () => ({
    FinTrackNative: {
        saveToken: vi.fn(async () => {}),
        clearToken: vi.fn(async () => {}),
        clearLock: vi.fn(async () => {}),
        clearWidgetToken: vi.fn(async () => {}),
    },
}));

import { persistedRefreshTokenFor, readPersistedAuth, signedOutElsewhere, useAuthStore } from './authStore';
import { NOTIF_PREFS_KEY } from '@/lib/notificationPrefs';
import { queryClient, QUERY_CACHE_STORAGE_KEY } from '@/lib/queryClient';

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

    it("drops every cached server response, in memory and on disk, so the next user never sees this one's data", () => {
        queryClient.setQueryData(['transactions', 'u1', { month: 8, year: 2026 }], [{ id: 'a' }]);
        localStorage.setItem(QUERY_CACHE_STORAGE_KEY, '{"clientState":{}}');
        useAuthStore.getState().logout();
        expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
        expect(localStorage.getItem(QUERY_CACHE_STORAGE_KEY)).toBeNull();
    });
});

const X = { id: 'u1', full_name: 'X', email: 'x@b.c', currency: 'INR' };
const Y = { id: 'u2', full_name: 'Y', email: 'y@b.c', currency: 'INR' };
const save = (state: object) => localStorage.setItem('fintrack-auth', JSON.stringify({ state, version: 0 }));

describe('saved auth vs this WebView (Android widget add sheet)', () => {
    beforeEach(() => {
        localStorage.clear();
        native.value = true;
        useAuthStore.setState({ user: X, token: 't0', refreshToken: 'R0', isLoading: false });
    });

    it('reads the saved state', () => {
        save({ user: X, token: 't1', refreshToken: 'R1' });
        expect(readPersistedAuth()).toEqual({ exists: true, userId: 'u1', token: 't1', refreshToken: 'R1' });
        localStorage.clear();
        expect(readPersistedAuth()?.exists).toBe(false);
    });

    it('signed out elsewhere: saved state with no token, or another user', () => {
        expect(signedOutElsewhere()).toBe(false); // intact storage (same pair)
        save({ user: null, token: null, refreshToken: null });
        expect(signedOutElsewhere()).toBe(true);
        save({ user: Y, token: 'ty', refreshToken: 'Ry' });
        expect(signedOutElsewhere()).toBe(true);
    });

    it('a missing key (evicted storage) is not a logout', () => {
        localStorage.clear();
        expect(signedOutElsewhere()).toBe(false);
    });

    it('adopts a saved refresh token only for the same user, and only on Android', () => {
        save({ user: X, token: 't1', refreshToken: 'R1' });
        expect(persistedRefreshTokenFor('u1')).toBe('R1');
        expect(persistedRefreshTokenFor('u2')).toBeNull();
        native.value = false;
        expect(persistedRefreshTokenFor('u1')).toBeNull();
    });

    // The sheet rotates R0 -> R1 while the app holds R0 in memory; then a
    // profile save calls setAuth(user, token) with no refresh token.
    it('setAuth without a refresh token keeps the rotated R1, never writing back revoked R0', () => {
        save({ user: X, token: 't1', refreshToken: 'R1' });
        useAuthStore.getState().setAuth(X, 't2');
        expect(useAuthStore.getState().refreshToken).toBe('R1');
        expect(readPersistedAuth()?.refreshToken).toBe('R1');
    });

    it("on the web, setAuth keeps this tab's own refresh token as before", () => {
        native.value = false;
        save({ user: X, token: 't1', refreshToken: 'R1' });
        useAuthStore.getState().setAuth(X, 't2');
        expect(useAuthStore.getState().refreshToken).toBe('R0');
    });
});
