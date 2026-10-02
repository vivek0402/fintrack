import { create } from 'zustand';
import { syncSystemBarsStyle } from '@/lib/systemBars';

export type Theme = 'dark' | 'light';
/** How the mobile More panel lists pages: an icon grid, or rows with live figures. */
export type MoreMenuStyle = 'grid' | 'list';

const MORE_STYLE_KEY = 'fintrack-more-style';

function applyAttributes(theme: Theme) {
    document.documentElement.setAttribute('data-theme', theme);
    // Android status-bar icons follow the app theme, not the device's night mode.
    syncSystemBarsStyle(theme);
}

interface ThemeStore {
    theme: Theme;
    sidebarCollapsed: boolean;
    moreMenuStyle: MoreMenuStyle;
    setTheme: (theme: Theme) => void;
    setMoreMenuStyle: (style: MoreMenuStyle) => void;
    loadMoreMenuStyle: () => void;
    toggleSidebarCollapsed: () => void;
    loadTheme: () => void;
    loadSidebarCollapsed: () => void;
}

export const useThemeStore = create<ThemeStore>((set, get) => ({
    theme: 'dark',
    sidebarCollapsed: false,
    moreMenuStyle: 'grid',

    setMoreMenuStyle: (style) => {
        try { localStorage.setItem(MORE_STYLE_KEY, style); } catch { /* storage unavailable */ }
        set({ moreMenuStyle: style });
    },

    loadMoreMenuStyle: () => {
        let saved: string | null = null;
        try { saved = localStorage.getItem(MORE_STYLE_KEY); } catch { /* storage unavailable */ }
        set({ moreMenuStyle: saved === 'list' ? 'list' : 'grid' });
    },

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
