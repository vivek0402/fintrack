import { useSyncExternalStore } from 'react';
import { Capacitor } from '@capacitor/core';

const subscribeNever = () => () => {};

export function isNativeApp(): boolean {
    try { return Capacitor.isNativePlatform(); } catch { return false; }
}

/** True only inside the Android app. Hydration-safe: false on the server render. */
export function useIsNative(): boolean {
    return useSyncExternalStore(subscribeNever, isNativeApp, () => false);
}

/** False during SSR/hydration, true once rendering on the client. */
export function useIsClient(): boolean {
    return useSyncExternalStore(subscribeNever, () => true, () => false);
}
