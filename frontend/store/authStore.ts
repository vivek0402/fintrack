import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { Capacitor } from '@capacitor/core';
import { FinTrackNative } from '@/plugins/FinTrackNativePlugin';
import { resetAppLock } from '@/store/lockStore';
import { signOutWidgets } from '@/lib/widgets';

// lib/notificationPrefs.ts's NOTIF_PREFS_KEY. Not imported: that module
// imports lib/api.ts, which imports this store (authStore.test.ts pins the
// two together).
const NOTIF_PREFS_KEY = 'fintrack-notif-prefs';

// zustand persist key; lib/lockHeadScript.ts reads it too.
const AUTH_STORAGE_KEY = 'fintrack-auth';

interface PersistedAuth {
    /** False when the key is absent (never written, or storage evicted): no evidence either way. */
    exists: boolean;
    userId: string | null;
    token: string | null;
    refreshToken: string | null;
}

/**
 * The auth state as currently saved in localStorage, which can be newer than
 * this document's in-memory copy: on Android the widget add sheet
 * (/widget-add/) is a second WebView on the same storage, and can rotate the
 * refresh token or log out while the app sits in the background.
 * Null when storage is unreadable.
 */
export function readPersistedAuth(): PersistedAuth | null {
    try {
        if (typeof window === 'undefined') return null;
        const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
        if (raw === null) return { exists: false, userId: null, token: null, refreshToken: null };
        const state = (JSON.parse(raw) as { state?: { token?: unknown; refreshToken?: unknown; user?: { id?: unknown } | null } })?.state;
        const id = state?.user?.id;
        return {
            exists: true,
            userId: typeof id === 'string' || typeof id === 'number' ? String(id) : null,
            token: typeof state?.token === 'string' ? state.token : null,
            refreshToken: typeof state?.refreshToken === 'string' ? state.refreshToken : null,
        };
    } catch {
        return null;
    }
}

function isNative(): boolean {
    try { return Capacitor.isNativePlatform(); } catch { return false; }
}

/**
 * Logged in here, but the saved state says otherwise: it was logged out
 * (key present, no token) or holds a different user. A missing key is not
 * evidence of a logout (e.g. evicted storage), so it never counts.
 */
export function signedOutElsewhere(): boolean {
    const { token, user } = useAuthStore.getState();
    if (!token) return false;
    const p = readPersistedAuth();
    if (!p || !p.exists) return false;
    if (!p.token) return true;
    return !!(p.userId && user?.id != null && p.userId !== String(user.id));
}

/**
 * Android only: the saved refresh token, if it belongs to `userId` and so may
 * be a newer rotation (by the widget add sheet) of the one in memory. Never
 * on the web: another tab's token could be a different login entirely, and
 * the web keeps its original one-token-per-tab refresh behaviour.
 */
export function persistedRefreshTokenFor(userId: string | number | null | undefined): string | null {
    if (!isNative() || userId == null) return null;
    const p = readPersistedAuth();
    if (!p?.exists || !p.token || p.userId !== String(userId)) return null;
    return p.refreshToken;
}

interface User {
    id: string;
    full_name: string;
    email: string;
    currency: string;
    onboarding_variant?: string;
}

interface AuthStore {
    user: User | null;
    token: string | null;
    refreshToken: string | null;
    isLoading: boolean;
    // refreshToken is optional — callers that are only refreshing the access
    // token after a profile edit (not a fresh login) omit it and keep the
    // existing one in the store.
    setAuth: (user: User, token: string, refreshToken?: string) => void;
    setTokens: (token: string, refreshToken: string) => void;
    logout: () => void;
    loadFromStorage: () => void;
}

export const useAuthStore = create<AuthStore>()(
    persist(
        (set, get) => ({
            user: null,
            token: null,
            refreshToken: null,
            isLoading: true,

            loadFromStorage: () => {
                // Handled automatically by Zustand's persist middleware
            },

            setAuth: (user, token, refreshToken) => {
                // No new refresh token (e.g. a profile edit re-issuing the access
                // token): keep the current one, which on Android may be the
                // saved rotation rather than this WebView's revoked copy.
                const keep = persistedRefreshTokenFor(user?.id) ?? get().refreshToken;
                set({ user, token, refreshToken: refreshToken ?? keep, isLoading: false });
                FinTrackNative.saveToken({ token }).catch(() => {});
            },

            // Used by the silent-refresh flow in lib/api.ts — updates only the
            // token pair, leaving the cached user object untouched.
            setTokens: (token, refreshToken) => {
                set({ token, refreshToken });
                FinTrackNative.saveToken({ token }).catch(() => {});
            },

            logout: () => {
                const previousToken = get().token;
                set({ user: null, token: null, refreshToken: null, isLoading: false });
                FinTrackNative.clearToken().catch(() => {});
                // Home-screen widgets: revoke their token (best effort) and
                // switch them to "Open FinTrack to set up", never leaving the
                // last user's numbers on the home screen.
                signOutWidgets(previousToken);
                // Every logout path (Sign Out, failed token refresh, "Forgot PIN")
                // also drops the app lock: its PIN hash, settings and FLAG_SECURE.
                resetAppLock();
                // Cached notification toggles belong to this user; don't hand
                // them to the next one on a shared device.
                try { localStorage.removeItem(NOTIF_PREFS_KEY); } catch { /* storage unavailable */ }
            },
        }),
        {
            name: AUTH_STORAGE_KEY,
            storage: createJSONStorage(() =>
                typeof window !== 'undefined' ? localStorage : ({
                    getItem: () => null,
                    setItem: () => {},
                    removeItem: () => {},
                } as unknown as Storage)
            ),
            // Only persist user and tokens, not loading state
            partialize: (state) => ({ user: state.user, token: state.token, refreshToken: state.refreshToken }),
            // Set isLoading to false once hydration is done
            onRehydrateStorage: () => (state) => {
                if (state) state.isLoading = false;
            },
        }
    )
);