import { FinTrackNative } from '@/plugins/FinTrackNativePlugin';

// /widget-add/: the Android widgets' "+" opens this page in its own
// translucent activity (QuickAddActivity) over the home screen. It is a
// second WebView next to the app's own one, sharing its localStorage (auth,
// lock settings) but nothing in memory, so a few app-wide behaviours differ
// here: see AppLockGate, lockStore.unlock and CapacitorBridge.

export const WIDGET_ADD_PATH = '/widget-add';

export function isWidgetAddPath(pathname: string | null | undefined): boolean {
    const path = (pathname ?? '').replace(/\/+$/, '');
    return path === WIDGET_ADD_PATH || path.startsWith(WIDGET_ADD_PATH + '/');
}

/** True while this document is the widget add sheet. */
export function onWidgetAddPage(): boolean {
    try {
        return typeof window !== 'undefined' && isWidgetAddPath(window.location.pathname);
    } catch {
        return false;
    }
}

/** Finish the sheet, back to the home screen. Never throws. */
export async function closeQuickAdd(opts: { refreshWidgets?: boolean } = {}): Promise<void> {
    try {
        await FinTrackNative.closeQuickAdd(opts);
    } catch {
        /* not in the sheet's activity */
    }
}

/** Hand over to the full app and finish the sheet. Never throws. */
export async function openMainApp(): Promise<void> {
    try {
        await FinTrackNative.openMainApp();
    } catch {
        /* not in the sheet's activity */
    }
}
