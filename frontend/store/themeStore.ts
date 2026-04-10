import { create } from 'zustand';

export type Theme = 'dark' | 'light';

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
        const raw = localStorage.getItem('fintrack-theme');
        // Migrate old 3-theme values: 'pitch', 'navy', or unrecognised → 'dark'
        const theme: Theme = raw === 'light' ? 'light' : 'dark';
        if (raw !== theme) {
            localStorage.setItem('fintrack-theme', theme);
        }
        document.documentElement.setAttribute('data-theme', theme);
        set({ theme });
    },
}));
