'use client';

import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
    LOCK_BG_AT_KEY, LOCK_BG_ELAPSED_KEY, LOCK_SESSION_KEY, inWidgetAddSheet, isLockExemptRoute,
    readTimestamp, shouldLockOnPageLoad, shouldLockOnResume,
} from '@/lib/appLock';
import { FinTrackNative } from '@/plugins/FinTrackNativePlugin';
import { readPersistedAuth, signedOutElsewhere, useAuthStore } from '@/store/authStore';
import { isContentHidden, setContentHidden, useLockStore } from '@/store/lockStore';
import { LockScreen } from './LockScreen';
import { isNativeApp, useIsClient } from './useIsNative';

// The page-load lock decision must run once per document, even if the gate
// remounts (AppLayoutGate swaps branches between bare and chromed routes).
let pageLoadHandled = false;

// Routes a logged-out user lands on. Content hidden by a lock that was reset
// (logout while locked) is revealed only once one of these has rendered.
const LOGGED_OUT_ROUTES = ['/login', '/register', '/forgot-password'];

function local(): Storage | null {
    try { return window.localStorage; } catch { return null; }
}

function removeBgKeys(storage: Storage | null) {
    try {
        storage?.removeItem(LOCK_BG_AT_KEY);
        storage?.removeItem(LOCK_BG_ELAPSED_KEY);
    } catch { /* ignore */ }
}

function currentPath(): string {
    try { return window.location.pathname; } catch { return ''; }
}

function currentUserAgent(): string {
    try { return navigator.userAgent; } catch { return ''; }
}

async function nativeElapsed(): Promise<number | null> {
    try {
        const { ms } = await FinTrackNative.elapsedRealtime();
        return typeof ms === 'number' && Number.isFinite(ms) ? ms : null;
    } catch {
        return null;
    }
}

/** Runs once per page load, before the first hydrated paint. Exported for tests. */
export function decideOnPageLoad(): void {
    const store = useLockStore.getState();
    const isNative = isNativeApp();
    let sessionUnlocked = false;
    try { sessionUnlocked = window.sessionStorage.getItem(LOCK_SESSION_KEY) === '1'; } catch { /* ignore */ }

    const lock = shouldLockOnPageLoad({
        settings: store.settings,
        loggedIn: !!useAuthStore.getState().token,
        isNative,
        sessionUnlocked,
        backgroundedAt: readTimestamp(local(), LOCK_BG_AT_KEY),
        pathname: currentPath(),
        userAgent: currentUserAgent(),
    });

    if (lock) store.lock();
    else if (store.locked && !inWidgetAddSheet()) store.unlock();
    else {
        // An exempt route is simply not locked; it is never an unlock (no
        // session flag, no clearing the app's timestamps).
        if (store.locked) useLockStore.setState({ locked: false });
        setContentHidden(false);
    }

    if (isNative) {
        // MainActivity already applied FLAG_SECURE natively on cold start; this
        // keeps the native flag in step with the JS settings either way.
        FinTrackNative.setSecureFlag({ enabled: store.settings.enabled && store.settings.hideRecents }).catch(() => {});
    }
}

/**
 * Capacitor appStateChange handler. Exported for tests.
 * Capacitor fires isActive=false from onStop (actually left the app), and
 * isActive=true from every onResume — including the one after the
 * fingerprint dialog, which has no matching stop and so never locks.
 */
export async function handleAppStateChange(
    isActive: boolean,
    goTo: (path: string) => void = (path) => window.location.replace(path),
): Promise<void> {
    // The widget add sheet (a second WebView on the same storage) logged out
    // while we sat in the background (its API calls hit a dead session):
    // follow suit before anything is revealed. Content stays hidden until /login.
    if (isActive && !inWidgetAddSheet() && signedOutElsewhere()) {
        useAuthStore.getState().logout();
        goTo('/login');
        return;
    }
    // Pick up what the sheet may have saved meanwhile (a rotated refresh
    // token), so this WebView doesn't later write its stale copy back.
    if (isActive && !inWidgetAddSheet()) {
        const saved = readPersistedAuth();
        if (saved?.exists && saved.token) {
            try { await useAuthStore.persist.rehydrate(); } catch { /* keep memory */ }
        }
    }

    const store = useLockStore.getState();
    const loggedIn = !!useAuthStore.getState().token;
    if (!store.settings.enabled || !loggedIn) return;

    // Lock-exempt route (the widget add sheet): no lock, and never touch the
    // background timestamps. They are the full app's, and writing them here
    // would restart its grace period without an unlock.
    if (inWidgetAddSheet()) return;

    const storage = local();

    if (!isActive) {
        const at = Date.now();
        try {
            storage?.setItem(LOCK_BG_AT_KEY, String(at));
            storage?.removeItem(LOCK_BG_ELAPSED_KEY);
        } catch { /* ignore */ }
        // Hide content now, while nobody is looking, so coming back past the
        // grace period can't flash it before the resume handler runs.
        setContentHidden(true);
        const elapsed = await nativeElapsed();
        if (elapsed !== null && readTimestamp(storage, LOCK_BG_AT_KEY) === at) {
            try { storage?.setItem(LOCK_BG_ELAPSED_KEY, String(elapsed)); } catch { /* ignore */ }
        }
        return;
    }

    const backgroundedAt = readTimestamp(storage, LOCK_BG_AT_KEY);
    if (store.locked) {
        if (backgroundedAt !== null) {
            removeBgKeys(storage);
            store.requestPrompt();
        }
        return;
    }
    if (backgroundedAt === null) return; // e.g. resume after the fingerprint dialog

    const bgElapsed = readTimestamp(storage, LOCK_BG_ELAPSED_KEY);
    const nowElapsed = await nativeElapsed();
    // Another background/resume raced past us while awaiting; it decides.
    if (readTimestamp(storage, LOCK_BG_AT_KEY) !== backgroundedAt) return;
    const current = useLockStore.getState();
    if (current.locked) return;

    if (shouldLockOnResume({
        settings: current.settings, loggedIn: !!useAuthStore.getState().token, isNative: true,
        backgroundedAt, now: Date.now(), bgElapsed, nowElapsed,
    })) {
        current.lock();
    } else {
        removeBgKeys(storage);
        setContentHidden(false);
    }
}

/**
 * Persistent app-lock controller. Mounted in AppLayoutGate (which, unlike
 * AppLayout, survives navigation). Decides the cold-start lock before the
 * first hydrated paint, watches background/foreground, and renders the lock
 * screen over the ambient backdrop while locked. Inert on web.
 */
export function AppLockGate() {
    const router = useRouter();
    const pathname = usePathname();
    const isClient = useIsClient();
    const locked = useLockStore(s => s.locked);
    const promptNonce = useLockStore(s => s.promptNonce);
    const unlock = useLockStore(s => s.unlock);
    const token = useAuthStore(s => s.token);

    useLayoutEffect(() => {
        if (pageLoadHandled) return;
        pageLoadHandled = true;
        decideOnPageLoad();
    }, []);

    // A lock reset while content was hidden (Forgot PIN, 10th wrong PIN,
    // failed token refresh) leaves it hidden until the logged-out screen is
    // what's actually on screen.
    useEffect(() => {
        if (locked || token || !isContentHidden()) return;
        const path = (pathname ?? '').replace(/\/+$/, '');
        if (LOGGED_OUT_ROUTES.some(r => path === r || path.startsWith(r + '/'))) setContentHidden(false);
    }, [pathname, locked, token]);

    // Defence in depth: a client-side move off the exempt route carries no
    // unlocked state with it. Re-decide exactly as on a page load.
    // Layout effect so the re-lock lands before the new route's first paint.
    const prevPath = useRef(pathname);
    useLayoutEffect(() => {
        const prev = prevPath.current;
        prevPath.current = pathname;
        if (prev === pathname) return;
        const ua = currentUserAgent();
        if (isLockExemptRoute(prev, ua) && !isLockExemptRoute(pathname, ua)) decideOnPageLoad();
    }, [pathname]);

    useEffect(() => {
        if (!isNativeApp()) return;
        let cancelled = false;
        let handle: { remove: () => void } | null = null;

        (async () => {
            try {
                const { App } = await import('@capacitor/app');
                if (cancelled) return;
                handle = await App.addListener('appStateChange', ({ isActive }) => { handleAppStateChange(isActive); });
                if (cancelled) handle.remove();
            } catch { /* not in Capacitor */ }
        })();

        return () => {
            cancelled = true;
            handle?.remove();
        };
    }, []);

    const onForgot = useCallback(() => {
        // logout() also resets the lock (settings, PIN hash, key, FLAG_SECURE)
        // but keeps content hidden until /login renders.
        useAuthStore.getState().logout();
        router.replace('/login');
    }, [router]);

    // Only QuickAddActivity's WebView on exactly /widget-add is exempt: an
    // active lock anywhere else (MainActivity included) always shows.
    if (!isClient || !locked || isLockExemptRoute(pathname, currentUserAgent())) return null;
    return <LockScreen mode="unlock" promptKey={promptNonce} onSuccess={unlock} onForgot={onForgot} />;
}

/** Test hook: let decideOnPageLoad run again as if on a fresh document. */
export function __resetPageLoadForTests() {
    pageLoadHandled = false;
}
