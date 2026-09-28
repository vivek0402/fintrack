'use client';

import { usePathname } from 'next/navigation';
import { AppLayout } from './AppLayout';
import { AmbientLighting } from './AmbientLighting';
import { StatusBarStrip } from './StatusBarStrip';
import { AppLockGate } from '@/components/lock/AppLockGate';

// Routes that render their own full-bleed UI with no sidebar/bottom-nav/FAB chrome.
// /widget-add: the Android widgets' add sheet over the home screen (it hides
// the ambient backdrop itself; it is lock-exempt, see lib/appLock.ts).
const noChromeRoutes = ['/', '/login', '/register', '/forgot-password', '/onboarding', '/widget-add'];
// The widget add sheet is drawn over the launcher, whose status bar is not ours
// to paint: no status-bar strip there (the sheet only needs the bottom inset).
const noStatusStripRoutes = ['/widget-add'];

// AppLockGate sits at the same position in both branches, so React keeps the
// one instance alive when navigating between bare and chromed routes.
export function AppLayoutGate({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const bare = noChromeRoutes.some(r => pathname === r || pathname.startsWith(r + '/'));
    const strip = !noStatusStripRoutes.some(r => pathname === r || pathname.startsWith(r + '/'));
    if (bare) {
        return (
            <>
                <AmbientLighting />
                {strip && <StatusBarStrip />}
                <AppLockGate />
                {/* Lifts page content above the fixed ambient backdrop, same reason
                    AppLayout's own <main> does this for the chromed routes. */}
                <div style={{ position: 'relative', zIndex: 1 }}>{children}</div>
            </>
        );
    }
    return (
        <>
            <AmbientLighting />
            <StatusBarStrip />
            <AppLockGate />
            <AppLayout>{children}</AppLayout>
        </>
    );
}
