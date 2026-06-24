import { create } from 'zustand';

export type Theme = 'dark' | 'light';

function applyAttributes(theme: Theme) {
    document.documentElement.setAttribute('data-theme', theme);
}

interface ThemeStore {
    theme: Theme;
    sidebarWidth: number;
    setTheme: (theme: Theme) => void;
    setSidebarWidth: (w: number) => void;
    loadTheme: () => void;
}

export const useThemeStore = create<ThemeStore>((set) => ({
    theme: 'dark',
    sidebarWidth: 220,
    setSidebarWidth: (w) => set({ sidebarWidth: w }),

    setTheme: (theme) => {
        localStorage.setItem('fintrack-theme', theme);
        applyAttributes(theme);
        set({ theme });
    },

    loadTheme: () => {
        const rawTheme = localStorage.getItem('fintrack-theme');
        // Migrate legacy 3-theme values ('pitch', 'navy', unrecognised) → 'dark'
        const theme: Theme = rawTheme === 'light' ? 'light' : 'dark';
        if (rawTheme !== theme) {
            localStorage.setItem('fintrack-theme', theme);
        }

        applyAttributes(theme);
        set({ theme });
    },
}));
