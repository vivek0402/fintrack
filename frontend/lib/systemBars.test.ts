import { beforeEach, describe, expect, it, vi } from 'vitest';

const cap = vi.hoisted(() => ({
    native: true,
    setStyle: vi.fn<(opts: { style: string }) => Promise<void>>(() => Promise.resolve()),
}));

vi.mock('@capacitor/core', () => ({
    Capacitor: { isNativePlatform: () => cap.native },
    SystemBars: { setStyle: cap.setStyle },
    SystemBarsStyle: { Dark: 'DARK', Light: 'LIGHT', Default: 'DEFAULT' },
}));

const lock = vi.hoisted(() => ({ widgetSheet: false }));
vi.mock('@/lib/appLock', () => ({ inWidgetAddSheet: () => lock.widgetSheet }));

import { currentDocumentTheme, syncSystemBarsStyle, systemBarsStyleFor } from './systemBars';
import { useThemeStore } from '@/store/themeStore';

beforeEach(() => {
    cap.native = true;
    lock.widgetSheet = false;
    cap.setStyle.mockReset();
    cap.setStyle.mockImplementation(() => Promise.resolve());
});

describe('systemBarsStyleFor', () => {
    it('dark theme -> DARK style (light icons on a dark bar)', () => {
        expect(systemBarsStyleFor('dark')).toBe('DARK');
    });
    it('light theme -> LIGHT style (dark icons on a light bar)', () => {
        expect(systemBarsStyleFor('light')).toBe('LIGHT');
    });
});

describe('syncSystemBarsStyle', () => {
    it('sets the style on native', () => {
        syncSystemBarsStyle('light');
        expect(cap.setStyle).toHaveBeenCalledWith({ style: 'LIGHT' });
    });

    it('does nothing on the web', () => {
        cap.native = false;
        syncSystemBarsStyle('dark');
        expect(cap.setStyle).not.toHaveBeenCalled();
    });

    it('leaves the launcher bars alone under the widget add sheet', () => {
        lock.widgetSheet = true;
        syncSystemBarsStyle('dark');
        expect(cap.setStyle).not.toHaveBeenCalled();
    });

    it('swallows a rejection from an APK without the plugin', async () => {
        cap.setStyle.mockImplementation(() => Promise.reject(Object.assign(new Error('nope'), { code: 'UNIMPLEMENTED' })));
        expect(() => syncSystemBarsStyle('dark')).not.toThrow();
        await Promise.resolve();
    });

    it('swallows a synchronous throw', () => {
        cap.setStyle.mockImplementation(() => { throw new Error('boom'); });
        expect(() => syncSystemBarsStyle('dark')).not.toThrow();
    });
});

describe('theme store -> status bar', () => {
    it('setTheme restyles the bars to match', () => {
        useThemeStore.getState().setTheme('light');
        expect(cap.setStyle).toHaveBeenLastCalledWith({ style: 'LIGHT' });
        useThemeStore.getState().setTheme('dark');
        expect(cap.setStyle).toHaveBeenLastCalledWith({ style: 'DARK' });
    });

    it('loadTheme restyles the bars from the saved theme', () => {
        localStorage.setItem('fintrack-theme', 'light');
        useThemeStore.getState().loadTheme();
        expect(cap.setStyle).toHaveBeenLastCalledWith({ style: 'LIGHT' });
    });

    it('currentDocumentTheme reads <html data-theme>', () => {
        document.documentElement.setAttribute('data-theme', 'light');
        expect(currentDocumentTheme()).toBe('light');
        document.documentElement.setAttribute('data-theme', 'dark');
        expect(currentDocumentTheme()).toBe('dark');
    });
});
