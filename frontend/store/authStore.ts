import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface User {
    id: string;
    full_name: string;
    email: string;
    currency: string;
}

interface AuthStore {
    user: User | null;
    token: string | null;
    isLoading: boolean;
    setAuth: (user: User, token: string) => void;
    logout: () => void;
    loadFromStorage: () => void;
}

export const useAuthStore = create<AuthStore>()(
    persist(
        (set) => ({
            user: null,
            token: null,
            isLoading: true,
            
            loadFromStorage: () => {
                // Handled automatically by Zustand's persist middleware
            },

            setAuth: (user, token) => {
                set({ user, token, isLoading: false });
            },

            logout: () => {
                set({ user: null, token: null, isLoading: false });
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
            // Only persist user and token, not loading state
            partialize: (state) => ({ user: state.user, token: state.token }),
            // Set isLoading to false once hydration is done
            onRehydrateStorage: () => (state) => {
                if (state) state.isLoading = false;
            },
        }
    )
);