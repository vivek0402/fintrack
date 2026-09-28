import { beforeEach, describe, expect, it, vi } from 'vitest';

// Two axios instances: `api` (interceptors under test) and `refreshClient`.
const axiosMock = vi.hoisted(() => {
    const instances: Array<{
        post: ReturnType<typeof vi.fn>;
        call: ReturnType<typeof vi.fn>;
        onError?: (err: unknown) => Promise<unknown>;
    }> = [];
    const create = vi.fn(() => {
        const call = vi.fn(async () => ({ data: 'retried' }));
        const inst = Object.assign(call, {
            post: vi.fn(),
            call,
            interceptors: {
                request: { use: vi.fn() },
                response: { use: vi.fn((_ok: unknown, err: (e: unknown) => Promise<unknown>) => { inst.onError = err; }) },
            },
        }) as unknown as (typeof instances)[number];
        instances.push(inst);
        return inst;
    });
    return { instances, create };
});
const native = vi.hoisted(() => ({ value: true }));
vi.mock('@capacitor/core', async (orig) => {
    const actual = await orig<typeof import('@capacitor/core')>();
    return { ...actual, Capacitor: { ...actual.Capacitor, isNativePlatform: () => native.value } };
});
vi.mock('axios', () => ({ default: { create: axiosMock.create } }));

vi.mock('@/plugins/FinTrackNativePlugin', () => ({
    FinTrackNative: {
        saveToken: vi.fn(async () => {}),
        clearToken: vi.fn(async () => {}),
        clearLock: vi.fn(async () => {}),
        clearWidgetToken: vi.fn(async () => {}),
    },
}));

import './api';
import { useAuthStore } from '@/store/authStore';

const [api, refreshClient] = axiosMock.instances;

const X = { id: 'u1', full_name: 'X', email: 'x@b.c', currency: 'INR' };
const Y = { id: 'u2', full_name: 'Y', email: 'y@b.c', currency: 'INR' };
const save = (state: object) => localStorage.setItem('fintrack-auth', JSON.stringify({ state, version: 0 }));
const fire401 = () => api.onError!({ response: { status: 401 }, config: { headers: {} } }).catch(() => {});

describe('silent refresh with a second WebView on the same storage', () => {
    beforeEach(() => {
        localStorage.clear();
        native.value = true;
        refreshClient.post.mockReset();
        refreshClient.post.mockResolvedValue({ data: { token: 't3', refreshToken: 'r3' } });
        useAuthStore.setState({ user: X, token: 't1', refreshToken: 'r1', isLoading: false });
        // jsdom can't navigate; forceLogout assigns window.location.href.
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    it('Android, same user: uses the refresh token the widget add sheet rotated', async () => {
        save({ user: X, token: 't2', refreshToken: 'r2' });
        await fire401();
        expect(refreshClient.post).toHaveBeenCalledWith('/api/auth/refresh', { refresh_token: 'r2' });
        expect(useAuthStore.getState().refreshToken).toBe('r3');
    });

    it('Android, another user saved: does not adopt it, and logs out', async () => {
        save({ user: Y, token: 'ty', refreshToken: 'ry' });
        await fire401();
        expect(refreshClient.post).not.toHaveBeenCalled();
        expect(useAuthStore.getState().token).toBeNull();
    });

    it('web: keeps the old behaviour, refreshing with its own token', async () => {
        native.value = false;
        save({ user: Y, token: 'ty', refreshToken: 'ry' });
        await fire401();
        expect(refreshClient.post).toHaveBeenCalledWith('/api/auth/refresh', { refresh_token: 'r1' });
    });

    it('uses its own when storage agrees', async () => {
        await fire401();
        expect(refreshClient.post).toHaveBeenCalledWith('/api/auth/refresh', { refresh_token: 'r1' });
    });
});
