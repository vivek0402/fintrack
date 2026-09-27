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

describe('silent refresh with a second WebView on the same storage', () => {
    beforeEach(() => {
        localStorage.clear();
        refreshClient.post.mockReset();
        refreshClient.post.mockResolvedValue({ data: { token: 't3', refreshToken: 'r3' } });
        useAuthStore.setState({ token: 't1', refreshToken: 'r1', isLoading: false });
    });

    it('uses the refresh token the widget add sheet rotated, not its stale in-memory one', async () => {
        // The sheet refreshed while this WebView sat in the background.
        localStorage.setItem('fintrack-auth', JSON.stringify({ state: { token: 't2', refreshToken: 'r2' }, version: 0 }));
        await api.onError!({ response: { status: 401 }, config: { headers: {} } });
        expect(refreshClient.post).toHaveBeenCalledWith('/api/auth/refresh', { refresh_token: 'r2' });
        expect(useAuthStore.getState().refreshToken).toBe('r3');
    });

    it('uses its own when storage agrees', async () => {
        await api.onError!({ response: { status: 401 }, config: { headers: {} } });
        expect(refreshClient.post).toHaveBeenCalledWith('/api/auth/refresh', { refresh_token: 'r1' });
    });
});
