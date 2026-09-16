import { create } from 'zustand';

export type Theme = 'dark' | 'light';

function applyAttributes(theme: Theme) {
    document.documentElement.setAttribute('data-theme', theme);
}

interface ThemeStore {
    theme: Theme;
    sidebarCollapsed: boolean;
    setTheme: (theme: Theme) => void;
    toggleSidebarCollapsed: () => void;
    loadTheme: () => void;
    loadSidebarCollapsed: () => void;
}

export const useThemeStore = create<ThemeStore>((set, get) => ({
    theme: 'dark',
    sidebarCollapsed: false,

    setTheme: (theme) => {
        localStorage.setItem('fintrack-theme', theme);
        applyAttributes(theme);
        set({ theme });
    },

    toggleSidebarCollapsed: () => {
        const next = !get().sidebarCollapsed;
        localStorage.setItem('fintrack-sidebar-collapsed', String(next));
        set({ sidebarCollapsed: next });
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

    loadSidebarCollapsed: () => {
        set({ sidebarCollapsed: localStorage.getItem('fintrack-sidebar-collapsed') === 'true' });
    },
}));
