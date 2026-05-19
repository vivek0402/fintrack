'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { FinTrackNative } from '@/plugins/FinTrackNativePlugin';

export default function CapacitorBridge() {
  const router = useRouter();
  const { token, isLoading } = useAuthStore();

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
