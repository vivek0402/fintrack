'use client';

import { usePathname } from 'next/navigation';
import { AppLayout } from './AppLayout';

// Routes that render their own full-bleed UI with no sidebar/bottom-nav/FAB chrome.
const noChromeRoutes = ['/', '/login', '/register', '/forgot-password', '/onboarding'];

export function AppLayoutGate({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const bare = noChromeRoutes.some(r => pathname === r || pathname.startsWith(r + '/'));
    if (bare) return <>{children}</>;
    return <AppLayout>{children}</AppLayout>;
}
