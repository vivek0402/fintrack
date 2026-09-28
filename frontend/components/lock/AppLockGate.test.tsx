import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
    DEFAULT_LOCK_SETTINGS, LOCKED_ATTR, LOCK_BG_AT_KEY, LOCK_BG_ELAPSED_KEY, LOCK_SESSION_KEY, LockSettings,
} from '@/lib/appLock';
import { FinTrackNative } from '@/plugins/FinTrackNativePlugin';
import { useAuthStore } from '@/store/authStore';
import { useLockStore } from '@/store/lockStore';
import { AppLockGate, __resetPageLoadForTests, decideOnPageLoad, handleAppStateChange } from './AppLockGate';

const native = vi.hoisted(() => ({ value: true }));
const nav = vi.hoisted(() => ({ path: '/dashboard' }));
const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));

vi.mock('@capacitor/core', async (orig) => {
    const actual = await orig<typeof import('@capacitor/core')>();
    return { ...actual, Capacitor: { ...actual.Capacitor, isNativePlatform: () => native.value } };
});

vi.mock('@capacitor/app', () => ({
    App: { addListener: vi.fn(async () => ({ remove: vi.fn() })) },
}));

vi.mock('next/navigation', () => ({
    useRouter: () => router,
    usePathname: () => nav.path,
}));

vi.mock('@/plugins/FinTrackNativePlugin', () => ({
    FinTrackNative: {
        saveToken: vi.fn(async () => {}),
        clearToken: vi.fn(async () => {}),
        biometricStatus: vi.fn(async () => ({ status: 'available' })),
        authenticate: vi.fn(async () => ({ result: 'cancel' })),
        enableBiometricKey: vi.fn(async () => ({ ok: true })),
        deleteBiometricKey: vi.fn(async () => {}),
        elapsedRealtime: vi.fn(async () => ({ ms: 0 })),
        setSecureFlag: vi.fn(async () => {}),
        setPinHash: vi.fn(async () => {}),
        getPinHash: vi.fn(async () => ({ hash: null })),
        clearLock: vi.fn(async () => {}),
        clearWidgetToken: vi.fn(async () => {}),
        openMainApp: vi.fn(async () => {}),
    },
}));

const plugin = vi.mocked(FinTrackNative);
const html = document.documentElement;
const hidden = () => html.hasAttribute(LOCKED_ATTR);
const T0 = 1_700_000_000_000;

function setLock(patch: Partial<LockSettings> = {}) {
    useLockStore.setState({ settings: { ...DEFAULT_LOCK_SETTINGS, enabled: true, ...patch }, locked: false, promptNonce: 0 });
}

/** Background at T0 (elapsedRealtime `bgMs`), then resume at wall `now` (elapsedRealtime `nowMs`). */
async function awayAndBack(now: number, bgMs = 10_000, nowMs = bgMs + (now - T0)) {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(T0);
    plugin.elapsedRealtime.mockResolvedValueOnce({ ms: bgMs });
    await handleAppStateChange(false);
    expect(hidden()).toBe(true);
    clock.mockReturnValue(now);
    plugin.elapsedRealtime.mockResolvedValueOnce({ ms: nowMs });
    await handleAppStateChange(true);
}

beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    html.removeAttribute(LOCKED_ATTR);
    native.value = true;
    nav.path = '/dashboard';
    useAuthStore.setState({ token: 't', user: { id: 'u', full_name: 'A', email: 'a@x', currency: 'INR' } });
    setLock();
    __resetPageLoadForTests();
});

afterEach(() => {
    vi.restoreAllMocks();
    window.history.replaceState({}, '', '/');
});

describe('decideOnPageLoad', () => {
    it('locks a cold start when lock is on and someone is logged in', () => {
        decideOnPageLoad();
        expect(useLockStore.getState().locked).toBe(true);
        expect(hidden()).toBe(true);
    });

    it('does not re-prompt on an in-app reload of an unlocked session', () => {
        html.setAttribute(LOCKED_ATTR, '');
        useLockStore.setState({ locked: true });
        sessionStorage.setItem(LOCK_SESSION_KEY, '1');
        decideOnPageLoad();
        expect(useLockStore.getState().locked).toBe(false);
        expect(hidden()).toBe(false);
    });

    it('locks a reload that happened after leaving the app', () => {
        sessionStorage.setItem(LOCK_SESSION_KEY, '1');
        localStorage.setItem(LOCK_BG_AT_KEY, String(T0));
        decideOnPageLoad();
        expect(useLockStore.getState().locked).toBe(true);
    });

    it('never locks on web, and lifts a stray pre-hydration hide', () => {
        native.value = false;
        html.setAttribute(LOCKED_ATTR, '');
        decideOnPageLoad();
        expect(useLockStore.getState().locked).toBe(false);
        expect(hidden()).toBe(false);
    });

    it('never locks when logged out', () => {
        useAuthStore.setState({ token: null });
        decideOnPageLoad();
        expect(useLockStore.getState().locked).toBe(false);
    });

    it('keeps FLAG_SECURE in step with "Hide in recent apps"', () => {
        setLock({ hideRecents: true });
        decideOnPageLoad();
        expect(plugin.setSecureFlag).toHaveBeenCalledWith({ enabled: true });
    });
});

describe('appStateChange', () => {
    it('resuming within the grace period reveals the app without locking', async () => {
        await awayAndBack(T0 + 30_000);
        expect(useLockStore.getState().locked).toBe(false);
        expect(hidden()).toBe(false);
        expect(localStorage.getItem(LOCK_BG_AT_KEY)).toBeNull();
        expect(localStorage.getItem(LOCK_BG_ELAPSED_KEY)).toBeNull();
    });

    it('resuming past the grace period locks', async () => {
        await awayAndBack(T0 + 60_000);
        expect(useLockStore.getState().locked).toBe(true);
        expect(hidden()).toBe(true);
    });

    it('"Immediately" locks on any return', async () => {
        setLock({ graceMs: 0 });
        await awayAndBack(T0);
        expect(useLockStore.getState().locked).toBe(true);
    });

    it('a wall clock set backwards locks', async () => {
        await awayAndBack(T0 - 5_000, 10_000, 15_000);
        expect(useLockStore.getState().locked).toBe(true);
    });

    it('the monotonic clock catches a wall clock set back within the grace', async () => {
        // 10 minutes really passed; the wall clock claims 20 seconds.
        await awayAndBack(T0 + 20_000, 10_000, 610_000);
        expect(useLockStore.getState().locked).toBe(true);
    });

    it('a resume with no background before it (fingerprint dialog) does nothing', async () => {
        await handleAppStateChange(true);
        expect(useLockStore.getState().locked).toBe(false);
        expect(hidden()).toBe(false);
    });

    it('coming back while still locked re-opens the fingerprint prompt', async () => {
        useLockStore.getState().lock();
        await handleAppStateChange(false);
        await handleAppStateChange(true);
        expect(useLockStore.getState().locked).toBe(true);
        expect(useLockStore.getState().promptNonce).toBe(1);
        // A later resume with no background in between doesn't re-prompt.
        await handleAppStateChange(true);
        expect(useLockStore.getState().promptNonce).toBe(1);
    });

    it('does nothing when lock is off', async () => {
        setLock({ enabled: false });
        await handleAppStateChange(false);
        expect(hidden()).toBe(false);
        expect(localStorage.getItem(LOCK_BG_AT_KEY)).toBeNull();
    });
});

describe('logout while locked', () => {
    it('keeps content hidden until the login screen renders', () => {
        const { rerender } = render(<AppLockGate />);
        useLockStore.getState().lock();
        expect(hidden()).toBe(true);

        // "Forgot PIN" / 10th wrong PIN / failed token refresh all go through logout().
        useAuthStore.getState().logout();
        expect(useLockStore.getState().locked).toBe(false);
        expect(useLockStore.getState().settings.enabled).toBe(false);
        expect(plugin.clearLock).toHaveBeenCalled();
        rerender(<AppLockGate />);
        expect(hidden()).toBe(true); // still on the old page — balances must not paint

        nav.path = '/login/';
        rerender(<AppLockGate />);
        expect(hidden()).toBe(false);
    });

    it('a plain Sign Out from an unlocked app never hides anything', () => {
        sessionStorage.setItem(LOCK_SESSION_KEY, '1'); // this session was already unlocked
        render(<AppLockGate />);
        expect(hidden()).toBe(false);
        useAuthStore.getState().logout();
        expect(hidden()).toBe(false);
    });
});

// The widget add sheet (/widget-add/, QuickAddActivity) is a second WebView
// next to the app's, sharing localStorage but not memory.
describe('widget add sheet', () => {
    const onSheet = () => {
        window.history.replaceState({}, '', '/widget-add/');
        nav.path = '/widget-add';
    };

    it('with lock on, the sheet opens unlocked: no lock, no hidden content, no lock screen', () => {
        onSheet();
        localStorage.setItem(LOCK_BG_AT_KEY, String(T0)); // the app left long ago
        render(<AppLockGate />);
        expect(useLockStore.getState().locked).toBe(false);
        expect(hidden()).toBe(false);
        expect(screen.queryByText('Enter your PIN')).toBeNull();
        expect(screen.queryByText('FinTrack is locked')).toBeNull();
        expect(plugin.authenticate).not.toHaveBeenCalled();
    });

    it('never shows the lock screen even if the store says locked', () => {
        onSheet();
        useLockStore.setState({ locked: true });
        render(<AppLockGate />);
        expect(document.querySelector('[data-lock-root]')).toBeNull();
    });

    it("using the sheet leaves the app's lock timestamps, session flag and attempts alone", async () => {
        onSheet();
        localStorage.setItem(LOCK_BG_AT_KEY, String(T0));
        localStorage.setItem(LOCK_BG_ELAPSED_KEY, '5');
        localStorage.setItem('fintrack-lock-attempts', JSON.stringify({ failures: 3, cooldownUntil: null }));
        const before = { ...localStorage };
        decideOnPageLoad();
        await handleAppStateChange(false);
        await handleAppStateChange(true);
        expect(useLockStore.getState().locked).toBe(false);
        expect(localStorage.getItem(LOCK_BG_AT_KEY)).toBe(String(T0));
        expect(localStorage.getItem(LOCK_BG_ELAPSED_KEY)).toBe('5');
        expect({ ...localStorage }).toEqual(before);
        expect(sessionStorage.getItem(LOCK_SESSION_KEY)).toBeNull(); // never an "unlock"
        expect(plugin.elapsedRealtime).not.toHaveBeenCalled();
    });

    it("defence in depth: an unlock run on the sheet still can't clear the app's timestamp", () => {
        onSheet();
        localStorage.setItem(LOCK_BG_AT_KEY, String(T0));
        useLockStore.getState().unlock();
        expect(localStorage.getItem(LOCK_BG_AT_KEY)).toBe(String(T0));
    });

    it('the app itself still locks on cold start and past the grace period', async () => {
        // (onSheet not called: MainActivity's WebView on an app route)
        window.history.replaceState({}, '', '/dashboard/');
        decideOnPageLoad();
        expect(useLockStore.getState().locked).toBe(true);
        useLockStore.getState().unlock();
        await awayAndBack(T0 + 61_000);
        expect(useLockStore.getState().locked).toBe(true);
    });

    it('the app, resumed after the sheet logged out, logs out too before revealing anything', async () => {
        const goTo = vi.fn();
        // The sheet's logout saved a token-less state; this WebView still holds a token.
        localStorage.setItem('fintrack-auth', JSON.stringify({ state: { user: null, token: null, refreshToken: null }, version: 0 }));
        localStorage.removeItem(LOCK_BG_AT_KEY);
        await handleAppStateChange(true, goTo);
        expect(useAuthStore.getState().token).toBeNull();
        expect(goTo).toHaveBeenCalledWith('/login');
    });

    it('a normal resume with intact storage does not log out', async () => {
        const goTo = vi.fn();
        await handleAppStateChange(true, goTo);
        expect(useAuthStore.getState().token).toBe('t');
        expect(goTo).not.toHaveBeenCalled();
    });

    it('a resume with the auth key missing (evicted storage) does not log out', async () => {
        const goTo = vi.fn();
        localStorage.removeItem('fintrack-auth');
        await handleAppStateChange(true, goTo);
        expect(useAuthStore.getState().token).toBe('t');
        expect(goTo).not.toHaveBeenCalled();
    });

    it('resuming picks up a refresh token the sheet rotated', async () => {
        useAuthStore.setState({ refreshToken: 'R0' });
        localStorage.setItem('fintrack-auth', JSON.stringify({
            state: { user: useAuthStore.getState().user, token: 't1', refreshToken: 'R1' }, version: 0,
        }));
        await handleAppStateChange(true, vi.fn());
        expect(useAuthStore.getState().refreshToken).toBe('R1');
        expect(useAuthStore.getState().token).toBe('t1');
    });
});
