'use client';

import { useCallback, useEffect, useLayoutEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
    LOCK_BG_AT_KEY, LOCK_SESSION_KEY, readTimestamp, shouldLockOnPageLoad, shouldLockOnResume,
} from '@/lib/appLock';
import { FinTrackNative } from '@/plugins/FinTrackNativePlugin';
import { useAuthStore } from '@/store/authStore';
import { setContentHidden, useLockStore } from '@/store/lockStore';
import { LockScreen } from './LockScreen';
import { isNativeApp, useIsClient } from './useIsNative';

// The page-load lock decision must run once per document, even if the gate
// remounts (AppLayoutGate swaps branches between bare and chromed routes).
let pageLoadHandled = false;

function local(): Storage | null {
    try { return window.localStorage; } catch { return null; }
}

function decideOnPageLoad() {
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
    });

    if (lock) store.lock();
    else if (store.locked) store.unlock();
    else setContentHidden(false);

    if (isNative) {
        // MainActivity already applied FLAG_SECURE natively on cold start; this
        // keeps the native flag in step with the JS settings either way.
        FinTrackNative.setSecureFlag({ enabled: store.settings.enabled && store.settings.hideRecents }).catch(() => {});
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
    const isClient = useIsClient();
    const locked = useLockStore(s => s.locked);
    const promptNonce = useLockStore(s => s.promptNonce);
    const unlock = useLockStore(s => s.unlock);

    useLayoutEffect(() => {
        if (pageLoadHandled) return;
        pageLoadHandled = true;
        decideOnPageLoad();
    }, []);

    useEffect(() => {
        if (!isNativeApp()) return;
        let cancelled = false;
        let handle: { remove: () => void } | null = null;

        (async () => {
            try {
                const { App } = await import('@capacitor/app');
                if (cancelled) return;
                // Capacitor fires isActive=false from onStop (actually left the
                // app), and isActive=true from every onResume — including the
                // one after the fingerprint dialog, which has no matching stop.
                handle = await App.addListener('appStateChange', ({ isActive }) => {
                    const store = useLockStore.getState();
                    const loggedIn = !!useAuthStore.getState().token;
                    if (!store.settings.enabled || !loggedIn) return;
                    const storage = local();

                    if (!isActive) {
                        try { storage?.setItem(LOCK_BG_AT_KEY, String(Date.now())); } catch { /* ignore */ }
                        // Hide content now, while nobody is looking, so coming
                        // back past the grace period can't flash it before the
                        // resume handler runs. Undone below if within grace.
                        setContentHidden(true);
                        return;
                    }

                    const backgroundedAt = readTimestamp(storage, LOCK_BG_AT_KEY);
                    if (store.locked) {
                        if (backgroundedAt !== null) {
                            try { storage?.removeItem(LOCK_BG_AT_KEY); } catch { /* ignore */ }
                            store.requestPrompt();
                        }
                        return;
                    }
                    if (shouldLockOnResume({ settings: store.settings, loggedIn, isNative: true, backgroundedAt, now: Date.now() })) {
                        store.lock();
                    } else {
                        try { storage?.removeItem(LOCK_BG_AT_KEY); } catch { /* ignore */ }
                        setContentHidden(false);
                    }
                });
                if (cancelled) handle.remove();
            } catch { /* not in Capacitor */ }
        })();

        return () => {
            cancelled = true;
            handle?.remove();
        };
    }, []);

    const onForgot = useCallback(() => {
        // logout() also resets the lock (settings, PIN hash, FLAG_SECURE).
        useAuthStore.getState().logout();
        router.replace('/login');
    }, [router]);

    if (!isClient || !locked) return null;
    return <LockScreen mode="unlock" promptKey={promptNonce} onSuccess={unlock} onForgot={onForgot} />;
}
