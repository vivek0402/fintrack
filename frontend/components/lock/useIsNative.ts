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

/**
 * True when a native plugin call failed because the installed APK doesn't
 * have that method at all (Capacitor rejects with code 'UNIMPLEMENTED'):
 * the web code is served remotely, so it can be newer than the app.
 */
export function isUnimplementedError(err: unknown): boolean {
    return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 'UNIMPLEMENTED';
}

/** False during SSR/hydration, true once rendering on the client. */
export function useIsClient(): boolean {
    return useSyncExternalStore(subscribeNever, () => true, () => false);
}
