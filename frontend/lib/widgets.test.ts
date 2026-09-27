import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

let native = true;
vi.mock('@capacitor/core', () => ({
    Capacitor: { isNativePlatform: () => native },
}));

vi.mock('@/plugins/FinTrackNativePlugin', () => ({
    FinTrackNative: {
        hasWidgets: vi.fn(async () => ({ present: true })),
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

    it('matches every route that writes transactions', () => {
        const writes: [string, string][] = [
            ['post', '/api/import/bank-statement/job-1/confirm'],
            ['post', '/api/recurring/process'],
            ['post', '/api/splits'],
            ['put', '/api/splits/s1'],
            ['delete', '/api/splits/s1'],
            ['post', '/api/groups/g1/splits'],
            ['put', '/api/groups/g1/splits/s1'],
            ['post', '/api/groups/g1/transactions/t1'],
            ['delete', '/api/groups/g1'],
            ['post', '/api/credit-cards/7/pay'],
            ['post', '/api/credit-cards/7/convert-to-emi'],
            ['post', '/api/one-time-expenses/e1/items'],
            ['put', '/api/one-time-expenses/e1/items/i1'],
            ['delete', '/api/one-time-expenses/e1'],
            ['post', '/api/personal-loans'],
            ['post', '/api/personal-loans/l1/repayments'],
            ['delete', '/api/personal-loans/l1'],
            ['patch', '/api/accounts/3/set-default'],
            ['delete', '/api/accounts/3'],
            ['post', '/api/budgets'],
            ['delete', '/api/budgets/b1'],
        ];
        for (const [method, url] of writes) {
            expect([method, url, isTransactionWrite(method, url)]).toEqual([method, url, true]);
        }
    });

    it('accepts absolute URLs from plain fetch() callers', () => {
        expect(isTransactionWrite('DELETE', 'https://api.example/api/one-time-expenses/e1/items/i1')).toBe(true);
        expect(isTransactionWrite('GET', 'https://api.example/api/one-time-expenses')).toBe(false);
    });

    it('ignores routes that do not touch transactions', () => {
        expect(isTransactionWrite('post', '/api/import/bank-statement')).toBe(false);      // upload only
        expect(isTransactionWrite('post', '/api/recurring')).toBe(false);                  // schedule only
        expect(isTransactionWrite('put', '/api/credit-cards/7')).toBe(false);              // card details
        expect(isTransactionWrite('post', '/api/goals')).toBe(false);
    });

    it('ignores reads and other resources', () => {
        expect(isTransactionWrite('get', '/api/transactions')).toBe(false);
        expect(isTransactionWrite('get', '/api/transactions/suggest')).toBe(false);
        expect(isTransactionWrite('post', '/api/transactions-archive')).toBe(false);
        expect(isTransactionWrite('post', '/api/categories')).toBe(false);
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

    it('discards the minted token if the user logged out while it was in flight', async () => {
        let auth: string | null = 'user-1';
        let finishMint: (t: string) => void = () => {};
        const issue = vi.fn(() => new Promise<string>(r => { finishMint = r; }));
        const pending = ensureWidgetToken(issue, () => auth);
        await vi.waitFor(() => expect(issue).toHaveBeenCalled());
        auth = null; // logout (which already cleared the native widget token)
        finishMint('widget-jwt-for-user-1');
        await pending;
        expect(plugin.saveWidgetToken).not.toHaveBeenCalled();
    });

    it('discards it too if a different user signed in meanwhile', async () => {
        let auth: string | null = 'user-1';
        const issue = vi.fn(async () => { auth = 'user-2'; return 'widget-jwt-for-user-1'; });
        await ensureWidgetToken(issue, () => auth);
        expect(plugin.saveWidgetToken).not.toHaveBeenCalled();
    });

    it('saves it when the same user is still signed in', async () => {
        const issue = vi.fn(async () => 'widget-jwt');
        await ensureWidgetToken(issue, () => 'user-1');
        expect(plugin.saveWidgetToken).toHaveBeenCalledWith({ token: 'widget-jwt' });
    });

    it('mints nothing when no widget is on the home screen', async () => {
        plugin.hasWidgets.mockResolvedValueOnce({ present: false });
        const issue = vi.fn(async () => 'widget-jwt');
        await ensureWidgetToken(issue);
        expect(issue).not.toHaveBeenCalled();
        expect(plugin.hasWidgetToken).not.toHaveBeenCalled();
        expect(plugin.saveWidgetToken).not.toHaveBeenCalled();
        expect(plugin.refreshWidgets).not.toHaveBeenCalled();
    });

    it('mints nothing against an older APK without hasWidgets', async () => {
        plugin.hasWidgets.mockRejectedValueOnce(new Error('not implemented'));
        const issue = vi.fn(async () => 'widget-jwt');
        await ensureWidgetToken(issue);
        expect(issue).not.toHaveBeenCalled();
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
