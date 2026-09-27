import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { FinTrackNative } from '@/plugins/FinTrackNativePlugin';
import { resetAppLock } from '@/store/lockStore';
import { signOutWidgets } from '@/lib/widgets';

// lib/notificationPrefs.ts's NOTIF_PREFS_KEY. Not imported: that module
// imports lib/api.ts, which imports this store (authStore.test.ts pins the
// two together).
const NOTIF_PREFS_KEY = 'fintrack-notif-prefs';

// zustand persist key; lib/lockHeadScript.ts reads it too.
const AUTH_STORAGE_KEY = 'fintrack-auth';

/**
 * The tokens as currently saved in localStorage, which can be newer than
 * this document's in-memory copy: the Android widget add sheet
 * (/widget-add/) is a second WebView on the same storage, and can rotate the
 * refresh token or log out while the app sits in the background.
 * Null when storage is unreadable.
 */
export function readPersistedTokens(): { token: string | null; refreshToken: string | null } | null {
    try {
        if (typeof window === 'undefined') return null;
        const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
        const state = raw ? (JSON.parse(raw) as { state?: { token?: unknown; refreshToken?: unknown } })?.state : null;
        return {
            token: typeof state?.token === 'string' ? state.token : null,
            refreshToken: typeof state?.refreshToken === 'string' ? state.refreshToken : null,
        };
    } catch {
        return null;
    }
}

/** Logged in here, but another WebView (the widget add sheet) has since logged out. */
export function signedOutElsewhere(): boolean {
    if (!useAuthStore.getState().token) return false;
    const persisted = readPersistedTokens();
    return persisted !== null && persisted.token === null;
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
                set({ user, token, refreshToken: refreshToken ?? get().refreshToken, isLoading: false });
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