import { create } from 'zustand';

export type Theme = 'dark' | 'pitch' | 'light';

interface ThemeStore {
    theme: Theme;
    setTheme: (theme: Theme) => void;
    loadTheme: () => void;
}

export const useThemeStore = create<ThemeStore>((set) => ({
    theme: 'dark',

    setTheme: (theme) => {
        localStorage.setItem('fintrack-theme', theme);
        document.documentElement.setAttribute('data-theme', theme);
        set({ theme });
    },

    loadTheme: () => {
        const saved = (localStorage.getItem('fintrack-theme') as Theme) || 'dark';
        document.documentElement.setAttribute('data-theme', saved);
        set({ theme: saved });
    },
}));