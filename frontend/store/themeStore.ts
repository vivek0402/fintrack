import { create } from 'zustand';

export type Theme = 'dark' | 'light';
export type PaletteName = 'ember' | 'ocean' | 'violet' | 'forest' | 'rose';

const VALID_PALETTES: PaletteName[] = ['ember', 'ocean', 'violet', 'forest', 'rose'];

function applyAttributes(theme: Theme, palette: PaletteName) {
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.setAttribute('data-palette', palette);
}

interface ThemeStore {
    theme: Theme;
    palette: PaletteName;
    setTheme: (theme: Theme) => void;
    setPalette: (palette: PaletteName) => void;
    loadTheme: () => void;
}

export const useThemeStore = create<ThemeStore>((set, get) => ({
    theme: 'dark',
    palette: 'ocean',

    setTheme: (theme) => {
        localStorage.setItem('fintrack-theme', theme);
        applyAttributes(theme, get().palette);
        set({ theme });
    },

    setPalette: (palette) => {
        localStorage.setItem('fintrack-palette', palette);
        applyAttributes(get().theme, palette);
        set({ palette });
    },

    loadTheme: () => {
        const rawTheme = localStorage.getItem('fintrack-theme');
        // Migrate legacy 3-theme values ('pitch', 'navy', unrecognised) → 'dark'
        const theme: Theme = rawTheme === 'light' ? 'light' : 'dark';
        if (rawTheme !== theme) {
            localStorage.setItem('fintrack-theme', theme);
        }

        const rawPalette = localStorage.getItem('fintrack-palette');
        const palette: PaletteName =
            rawPalette && (VALID_PALETTES as string[]).includes(rawPalette)
                ? (rawPalette as PaletteName)
                : 'ocean';
        if (rawPalette !== palette) {
            localStorage.setItem('fintrack-palette', palette);
        }

        applyAttributes(theme, palette);
        set({ theme, palette });
    },
}));
