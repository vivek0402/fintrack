import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core';
import { inWidgetAddSheet } from '@/lib/appLock';

type AppTheme = 'dark' | 'light';

/**
 * Status-bar icon style for an app theme. Capacitor names the style after the
 * BAR, not the icons (core-plugins.d.ts): `Dark` = light icons for a dark
 * background, `Light` = dark icons for a light background. Left alone the
 * plugin follows the device's night mode, which is wrong whenever the app's
 * theme differs from the system's.
 */
export function systemBarsStyleFor(theme: AppTheme): SystemBarsStyle {
    return theme === 'light' ? SystemBarsStyle.Light : SystemBarsStyle.Dark;
}

/**
 * Point the native status/navigation bar icons at the app theme. No-op on the
 * web; never throws (older APKs without the SystemBars plugin reject, and the
 * widget add sheet sits over the launcher, whose bars are not ours to restyle).
 */
export function syncSystemBarsStyle(theme: AppTheme): void {
    try {
        if (!Capacitor.isNativePlatform() || inWidgetAddSheet()) return;
        SystemBars.setStyle({ style: systemBarsStyleFor(theme) }).catch(() => {});
    } catch { /* not in a Capacitor environment */ }
}

/** The theme the pre-hydration script in app/layout.tsx put on <html>. */
export function currentDocumentTheme(): AppTheme {
    try {
        return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    } catch {
        return 'dark';
    }
}
