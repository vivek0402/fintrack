import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

let native = true;
vi.mock('@capacitor/core', () => ({
    Capacitor: { isNativePlatform: () => native },
}));

vi.mock('@/plugins/FinTrackNativePlugin', () => ({
    FinTrackNative: {
        hasWidgetToken: vi.fn(async () => ({ present: false })),
        saveWidgetToken: vi.fn(async () => {}),
        clearWidgetToken: vi.fn(async () => {}),
        refreshWidgets: vi.fn(async () => {}),
    },
}));

import { FinTrackNative } from '@/plugins/FinTrackNativePlugin';
import { ensureWidgetToken, isTransactionWrite, refreshWidgets, signOutWidgets } from './widgets';

const plugin = vi.mocked(FinTrackNative);

describe('isTransactionWrite', () => {
    it('matches create, edit and delete of transactions', () => {
        expect(isTransactionWrite('post', '/api/transactions')).toBe(true);
        expect(isTransactionWrite('put', '/api/transactions/abc')).toBe(true);
        expect(isTransactionWrite('DELETE', '/api/transactions/abc')).toBe(true);
    });

    it('ignores reads and other resources', () => {
        expect(isTransactionWrite('get', '/api/transactions')).toBe(false);
        expect(isTransactionWrite('get', '/api/transactions/suggest')).toBe(false);
        expect(isTransactionWrite('post', '/api/transactions-archive')).toBe(false);
        expect(isTransactionWrite('post', '/api/budgets')).toBe(false);
        expect(isTransactionWrite(undefined, '/api/transactions')).toBe(false);
    });
});

describe('ensureWidgetToken', () => {
    beforeEach(() => {
        native = true;
        vi.clearAllMocks();
    });

    it('issues and stores a token when none is stored', async () => {
        plugin.hasWidgetToken.mockResolvedValueOnce({ present: false });
        const issue = vi.fn(async () => 'widget-jwt');
        await ensureWidgetToken(issue);
        expect(issue).toHaveBeenCalledTimes(1);
        expect(plugin.saveWidgetToken).toHaveBeenCalledWith({ token: 'widget-jwt' });
    });

    it('only refreshes when a token is already stored', async () => {
        plugin.hasWidgetToken.mockResolvedValueOnce({ present: true });
        const issue = vi.fn(async () => 'widget-jwt');
        await ensureWidgetToken(issue);
        expect(issue).not.toHaveBeenCalled();
        expect(plugin.refreshWidgets).toHaveBeenCalledTimes(1);
        expect(plugin.saveWidgetToken).not.toHaveBeenCalled();
    });

    it('swallows a failed issue request', async () => {
        const issue = vi.fn(async () => { throw new Error('401'); });
        await expect(ensureWidgetToken(issue)).resolves.toBeUndefined();
        expect(plugin.saveWidgetToken).not.toHaveBeenCalled();
    });

    it('does nothing on the web', async () => {
        native = false;
        const issue = vi.fn(async () => 'widget-jwt');
        await ensureWidgetToken(issue);
        expect(plugin.hasWidgetToken).not.toHaveBeenCalled();
        expect(issue).not.toHaveBeenCalled();
    });
});

describe('signOutWidgets', () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }));

    beforeEach(() => {
        native = true;
        vi.clearAllMocks();
        vi.stubGlobal('fetch', fetchMock);
        vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://api.example');
    });
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.unstubAllEnvs();
    });

    it('revokes with the outgoing access token and clears the native token', () => {
        signOutWidgets('access-jwt');
        expect(fetchMock).toHaveBeenCalledWith('https://api.example/api/widget/revoke', expect.objectContaining({
            method: 'POST',
            headers: { Authorization: 'Bearer access-jwt' },
            keepalive: true,
        }));
        expect(plugin.clearWidgetToken).toHaveBeenCalledTimes(1);
    });

    it('still clears the widgets when there is no access token to revoke with', () => {
        signOutWidgets(null);
        expect(fetchMock).not.toHaveBeenCalled();
        expect(plugin.clearWidgetToken).toHaveBeenCalledTimes(1);
    });

    it('never revokes from the web (would kill a phone\'s widgets)', () => {
        native = false;
        signOutWidgets('access-jwt');
        expect(fetchMock).not.toHaveBeenCalled();
        expect(plugin.clearWidgetToken).not.toHaveBeenCalled();
    });
});

describe('refreshWidgets', () => {
    beforeEach(() => {
        native = true;
        vi.clearAllMocks();
        vi.useFakeTimers();
    });
    afterEach(() => vi.useRealTimers());

    it('coalesces a burst of writes into one native refresh', () => {
        refreshWidgets();
        refreshWidgets();
        refreshWidgets();
        expect(plugin.refreshWidgets).not.toHaveBeenCalled();
        vi.advanceTimersByTime(2000);
        expect(plugin.refreshWidgets).toHaveBeenCalledTimes(1);
    });

    it('is a no-op on the web', () => {
        native = false;
        refreshWidgets();
        vi.advanceTimersByTime(2000);
        expect(plugin.refreshWidgets).not.toHaveBeenCalled();
    });
});
