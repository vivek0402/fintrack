'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { FinTrackNative } from '@/plugins/FinTrackNativePlugin';

export default function CapacitorBridge() {
  const router = useRouter();
  const pathname = usePathname();
  const { token, isLoading } = useAuthStore();

  // Keep a ref so the back-button closure always sees the current pathname
  // without needing to re-register the listener on every navigation.
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  // Android hardware/gesture back button — go home first, exit from home.
  // Lives here (not in AppLayout) because this component is mounted once at
  // the true app root and never remounts; AppLayout is re-created on every
  // page navigation, which used to leave a brief window with no listener
  // registered where a back press would fall through to the native default
  // (exit the app) instead of this handler.
  useEffect(() => {
    let cancelled = false;
    let handle: { remove: () => void } | null = null;

    const setup = async () => {
      try {
        const { Capacitor } = await import('@capacitor/core');
        if (!Capacitor.isNativePlatform() || cancelled) return;
        const { App } = await import('@capacitor/app');
        if (cancelled) return;
        handle = await App.addListener('backButton', () => {
          if (pathnameRef.current === '/dashboard') {
            App.exitApp();
          } else {
            router.replace('/dashboard');
          }
        });
      } catch { /* not in Capacitor environment */ }
    };

    setup();
    return () => {
      cancelled = true;
      handle?.remove();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // register once — listener is permanent for the app's lifecycle

  // Sync existing JWT to SharedPreferences once store hydrates —
  // handles the case where the user was already logged in before installing
  // the new APK (so setAuth was never called with the new plugin present).
  useEffect(() => {
    if (!isLoading && token) {
      FinTrackNative.saveToken({ token }).catch(() => {});
    }
  }, [isLoading, token]);

  // Handle widget→app navigation when the app is already running (onNewIntent).
  // Cold-start navigation is handled natively: MainActivity.onCreate redirects
  // the WebView directly to the target URL, so no event is needed there.
  useEffect(() => {
    const handleOpenAdd = () => router.push('/transactions?add=true');
    const handleOpenBudgets = () => router.push('/budgets');

    window.addEventListener('fintrack:openAdd', handleOpenAdd);
    window.addEventListener('fintrack:openBudgets', handleOpenBudgets);

    return () => {
      window.removeEventListener('fintrack:openAdd', handleOpenAdd);
      window.removeEventListener('fintrack:openBudgets', handleOpenBudgets);
    };
  }, [router]);

  return null;
}
