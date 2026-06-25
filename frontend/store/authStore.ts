import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { FinTrackNative } from '@/plugins/FinTrackNativePlugin';

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
                set({ user: null, token: null, refreshToken: null, isLoading: false });
                FinTrackNative.clearToken().catch(() => {});
            },
        }),
        {
            name: 'fintrack-auth',
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