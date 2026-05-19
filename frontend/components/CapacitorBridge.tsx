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

  useEffect(() => {
    const navigateAdd = () => router.push('/transactions?add=true');
    const navigateBudgets = () => router.push('/budgets');

    const handleOpenAdd = () => {
      (window as any).__fintrackPending = null;
      navigateAdd();
    };
    const handleOpenBudgets = () => {
      (window as any).__fintrackPending = null;
      navigateBudgets();
    };

    window.addEventListener('fintrack:openAdd', handleOpenAdd);
    window.addEventListener('fintrack:openBudgets', handleOpenBudgets);

    // Fallback: pick up the pending action if the event fired before this
    // listener was registered (React hydration slower than the 600ms delay)
    const pending = (window as any).__fintrackPending as string | undefined;
    if (pending) {
      (window as any).__fintrackPending = null;
      if (pending === 'fintrack:openAdd') navigateAdd();
      else if (pending === 'fintrack:openBudgets') navigateBudgets();
    }

    return () => {
      window.removeEventListener('fintrack:openAdd', handleOpenAdd);
      window.removeEventListener('fintrack:openBudgets', handleOpenBudgets);
    };
  }, [router]);

  return null;
}
