import { describe, it, expect, beforeEach, vi } from 'vitest';
vi.mock('@/lib/systemBars', () => ({ syncSystemBarsStyle: vi.fn() }));
import { useThemeStore } from './themeStore';

beforeEach(() => { localStorage.clear(); useThemeStore.setState({ moreMenuStyle: 'grid' }); });

describe('More menu layout preference', () => {
    it('defaults to the grid', () => {
        useThemeStore.getState().loadMoreMenuStyle();
        expect(useThemeStore.getState().moreMenuStyle).toBe('grid');
    });

    it('remembers the choice across app launches', () => {
        useThemeStore.getState().setMoreMenuStyle('list');
        useThemeStore.setState({ moreMenuStyle: 'grid' });   // fresh launch
        useThemeStore.getState().loadMoreMenuStyle();
        expect(useThemeStore.getState().moreMenuStyle).toBe('list');
    });
});
