'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { FinTrackNative } from '@/plugins/FinTrackNativePlugin';
import { widgetAPI } from '@/lib/api';
import { ensureWidgetToken } from '@/lib/widgets';
import { closeQuickAdd } from '@/lib/widgetAdd';
import { inQuickAddActivity, inWidgetAddSheet } from '@/lib/appLock';
import { currentDocumentTheme, syncSystemBarsStyle } from '@/lib/systemBars';

const issueWidgetToken = async () => (await widgetAPI.issueToken()).data.token;
// Identity check for ensureWidgetToken's logout race: the signed-in user's id
// (stable across the 15-minute access-token rotation, null once logged out).
const currentUserId = () => {
  const { token, user } = useAuthStore.getState();
  return token ? (user?.id ?? token) : null;
};

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
          // The widget add sheet's own activity: Back closes it.
          if (inQuickAddActivity()) {
            closeQuickAdd();
          } else if (pathnameRef.current === '/dashboard') {
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

  // Status-bar icons match the app theme from the first paint, including the
  // bare routes (login, onboarding, lock) that never mount AppLayout's
  // loadTheme. Later theme changes sync through the theme store.
  useEffect(() => {
    syncSystemBarsStyle(currentDocumentTheme());
  }, []);

  // Sync existing JWT to SharedPreferences once store hydrates —
  // handles the case where the user was already logged in before installing
  // the new APK (so setAuth was never called with the new plugin present).
  useEffect(() => {
    if (!isLoading && token) {
      FinTrackNative.saveToken({ token }).catch(() => {});
    }
  }, [isLoading, token]);

  // Home-screen widgets, once per signed-in app session: hand them a
  // widget-scoped token if they have none, and refresh them (the app-start
  // refresh). Re-arms after logout so the next sign-in sets them up again.
  // Not re-run on every silent token refresh (the access token rotates every
  // 15 minutes).
  // Not from the widget add sheet: a few-second WebView the app's own session
  // already keeps the widgets set up for (it asks for a refresh on save).
  const widgetsReadyRef = useRef(false);
  useEffect(() => {
    if (isLoading || inWidgetAddSheet()) return;
    if (!token) {
      widgetsReadyRef.current = false;
      return;
    }
    if (widgetsReadyRef.current) return;
    widgetsReadyRef.current = true;
    ensureWidgetToken(issueWidgetToken, currentUserId);
  }, [isLoading, token]);

  // ...and on every resume, so a widget placed while the app was running gets
  // its token the next time the app is opened (and existing ones refresh).
  useEffect(() => {
    let cancelled = false;
    let handle: { remove: () => void } | null = null;

    const setup = async () => {
      try {
        const { Capacitor } = await import('@capacitor/core');
        if (!Capacitor.isNativePlatform() || cancelled) return;
        const { App } = await import('@capacitor/app');
        if (cancelled) return;
        handle = await App.addListener('resume', () => {
          if (!useAuthStore.getState().token || inWidgetAddSheet()) return;
          ensureWidgetToken(issueWidgetToken, currentUserId);
        });
        if (cancelled) handle.remove();
      } catch { /* not in Capacitor environment */ }
    };

    setup();
    return () => {
      cancelled = true;
      handle?.remove();
    };
  }, []);

  // Handle widget→app navigation when the app is already running (onNewIntent).
  // Cold-start navigation is handled natively: MainActivity.onCreate redirects
  // the WebView directly to the target URL, so no event is needed there.
  useEffect(() => {
    const handleOpenAdd = () => router.push('/transactions?add=true');
    const handleOpenQuickAdd = () => router.push('/transactions?quickAdd=1');
    const handleOpenBudgets = () => router.push('/budgets');
    const handleOpenDashboard = () => router.push('/dashboard');

    window.addEventListener('fintrack:openAdd', handleOpenAdd);
    window.addEventListener('fintrack:openQuickAdd', handleOpenQuickAdd);
    window.addEventListener('fintrack:openBudgets', handleOpenBudgets);
    window.addEventListener('fintrack:openDashboard', handleOpenDashboard);

    return () => {
      window.removeEventListener('fintrack:openAdd', handleOpenAdd);
      window.removeEventListener('fintrack:openQuickAdd', handleOpenQuickAdd);
      window.removeEventListener('fintrack:openBudgets', handleOpenBudgets);
      window.removeEventListener('fintrack:openDashboard', handleOpenDashboard);
    };
  }, [router]);

  return null;
}
