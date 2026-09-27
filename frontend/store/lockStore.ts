import { create } from 'zustand';
import {
    DEFAULT_LOCK_SETTINGS, LOCKED_ATTR, LOCK_BG_AT_KEY, LOCK_BG_ELAPSED_KEY, LOCK_SESSION_KEY, LockSettings,
    clearLockStorage, readSettings, writeSettings,
} from '@/lib/appLock';
import { FinTrackNative } from '@/plugins/FinTrackNativePlugin';

function local(): Storage | null {
    try { return typeof window !== 'undefined' ? window.localStorage : null; } catch { return null; }
}
function session(): Storage | null {
    try { return typeof window !== 'undefined' ? window.sessionStorage : null; } catch { return null; }
}

/** Hides (or reveals) all app content via the <html> attribute globals.css keys off. */
export function setContentHidden(hidden: boolean): void {
    if (typeof document === 'undefined') return;
    document.documentElement.toggleAttribute(LOCKED_ATTR, hidden);
}

export function isContentHidden(): boolean {
    return typeof document !== 'undefined' && document.documentElement.hasAttribute(LOCKED_ATTR);
}

interface LockStore {
    settings: LockSettings;
    locked: boolean;
    // Bumped when the lock screen should (re)open the fingerprint prompt by
    // itself — on a real return from the background while already locked.
    promptNonce: number;
    requestPrompt: () => void;
    setSettings: (patch: Partial<LockSettings>) => void;
    lock: () => void;
    unlock: () => void;
    reset: () => void;
}

export const useLockStore = create<LockStore>((set, get) => ({
    // Read synchronously so the first client render already knows the lock
    // state. `locked` mirrors the decision the pre-hydration script in
    // app/layout.tsx made before first paint; AppLockGate re-checks it on mount.
    settings: readSettings(local()),
    locked: typeof document !== 'undefined' && document.documentElement.hasAttribute(LOCKED_ATTR),
    promptNonce: 0,
    requestPrompt: () => set({ promptNonce: get().promptNonce + 1 }),

    setSettings: (patch) => {
        const next = { ...get().settings, ...patch };
        writeSettings(local(), next);
        set({ settings: next });
    },

    lock: () => {
        try { session()?.removeItem(LOCK_SESSION_KEY); } catch { /* ignore */ }
        setContentHidden(true);
        set({ locked: true });
    },

    unlock: () => {
        try {
            session()?.setItem(LOCK_SESSION_KEY, '1');
            local()?.removeItem(LOCK_BG_AT_KEY);
            local()?.removeItem(LOCK_BG_ELAPSED_KEY);
        } catch { /* ignore */ }
        setContentHidden(false);
        set({ locked: false });
    },

    // Logout / "Forgot PIN" / lockout: forget everything, native side included.
    // If content is hidden right now (locked, or backgrounded), it stays
    // hidden: the caller is about to navigate to /login, and revealing it here
    // would paint the old page's balances for a frame first. AppLockGate
    // reveals once a logged-out route has rendered; a full reload starts
    // unhidden anyway since the head script finds no token.
    reset: () => {
        clearLockStorage(local(), session());
        set({ settings: { ...DEFAULT_LOCK_SETTINGS }, locked: false });
        FinTrackNative.clearLock().catch(() => {});
    },
}));

export const resetAppLock = () => useLockStore.getState().reset();
