'use client';

import { useEffect } from 'react';
import { NotificationBell } from './NotificationBell';
import { syncFCMTokenFromNative } from '@/lib/notifications';

export function NotificationCenter() {
  useEffect(() => {
    syncFCMTokenFromNative();
  }, []);

  return <NotificationBell />;
}
