import { create } from 'zustand';

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

export const useAuthStore = create<AuthStore>((set) => ({
    user: null,
    token: null,
    isLoading: true,

    setAuth: (user, token) => {
        localStorage.setItem('fintrack_token', token);
        localStorage.setItem('fintrack_user', JSON.stringify(user));
        set({ user, token, isLoading: false });
    },

    logout: () => {
        localStorage.removeItem('fintrack_token');
        localStorage.removeItem('fintrack_user');
        set({ user: null, token: null, isLoading: false });
    },

    loadFromStorage: () => {
        try {
            const token = localStorage.getItem('fintrack_token');
            const user = localStorage.getItem('fintrack_user');
            if (token && user) {
                set({ token, user: JSON.parse(user), isLoading: false });
            } else {
                set({ isLoading: false });
            }
        } catch {
            set({ isLoading: false });
        }
    },
}));