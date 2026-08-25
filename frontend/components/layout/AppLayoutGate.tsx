'use client';

import { usePathname } from 'next/navigation';
import { AppLayout } from './AppLayout';
import { AmbientLighting } from './AmbientLighting';

// Routes that render their own full-bleed UI with no sidebar/bottom-nav/FAB chrome.
const noChromeRoutes = ['/', '/login', '/register', '/forgot-password', '/onboarding'];

export function AppLayoutGate({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const bare = noChromeRoutes.some(r => pathname === r || pathname.startsWith(r + '/'));
    if (bare) {
        return (
            <>
                <AmbientLighting />
                {/* Lifts page content above the fixed ambient backdrop, same reason
                    AppLayout's own <main> does this for the chromed routes. */}
                <div style={{ position: 'relative', zIndex: 1 }}>{children}</div>
            </>
        );
    }
    return (
        <>
            <AmbientLighting />
            <AppLayout>{children}</AppLayout>
        </>
    );
}
