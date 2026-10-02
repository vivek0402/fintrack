import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

// Light vibrations at a few key moments, Android app only. They follow the
// phone's own touch-vibration setting. A no-op in the browser/PWA, and never
// throws: a missing plugin (an APK built before it was added) or a device
// without a vibrator must not break the action that triggered it.

function native(): boolean {
    try { return Capacitor.isNativePlatform(); } catch { return false; }
}

function run(effect: () => Promise<void>) {
    if (!native()) return;
    effect().catch(() => { /* no plugin or no vibrator */ });
}

export const haptics = {
    /** A drag crossed its "let go to act" threshold (swipe-to-delete). */
    threshold: () => run(() => Haptics.impact({ style: ImpactStyle.Light })),
    /** Something was saved. */
    success: () => run(() => Haptics.notification({ type: NotificationType.Success })),
    /** Something was deleted (it can still be undone). */
    delete: () => run(() => Haptics.impact({ style: ImpactStyle.Medium })),
    /** A save failed. */
    error: () => run(() => Haptics.notification({ type: NotificationType.Error })),
};
