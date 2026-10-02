'use client';

import { useEffect, useLayoutEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { BottomNav } from './BottomNav';
import { WalkthroughTour } from '@/components/ui/WalkthroughTour';
import { OfflineBanner } from '@/components/ui/OfflineBanner';
import { useThemeStore } from '@/store/themeStore';
import { useAuthStore } from '@/store/authStore';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { ToastContainer } from '@/components/ui/ToastContainer';
import { RedesignAnnouncement } from '@/components/ui/RedesignAnnouncement';
import { PageErrorBoundary } from '@/components/ui/PageErrorBoundary';
import { processQueue } from '@/lib/txQueue';
import { toast } from '@/store/toastStore';
import { initPushNotifications } from '@/lib/notifications';
import { runNotificationCheck } from '@/lib/notificationTrigger';
import { resolveViewTransition } from '@/lib/viewTransition';
import { usePrefetchTabData } from '@/hooks/queries';
import { recordMoreVisit } from '@/lib/morePins';
import { morePageHrefs } from './MorePanel';
import { useScrollRestoration } from '@/hooks/useScrollRestoration';

// /transactions used to be excluded -- it had its own header add button.
// That's gone now (removed along with the top bar's + icon), so the
// global desktop Add FAB shows here too, same as every other page. The
// page's own Quick Add FAB sits in the next slot along (see
// app/transactions/page.tsx).
const hideAddFabRoutes = ['/login', '/register', '/onboarding', '/ai-advisor'];

export function AppLayout({ children }: { children: React.ReactNode }) {
    const { loadTheme, loadSidebarCollapsed, loadMoreMenuStyle, sidebarCollapsed } = useThemeStore();
    const pathname = usePathname();
    const router = useRouter();
    const [addFabHover, setAddFabHover] = useState(false);
    const [addFabPressed, setAddFabPressed] = useState(false);
    const [showTour, setShowTour] = useState(false);
    const { user } = useAuthStore();
    // Warm Home / Money / Insights data so the first tap on each is instant.
    usePrefetchTabData();
    // Back/forward returns to where you were on that page.
    useScrollRestoration();

    useEffect(() => { loadTheme(); loadSidebarCollapsed(); loadMoreMenuStyle(); }, []);

    // The new route has committed: let a pending tab crossfade run.
    useLayoutEffect(() => { resolveViewTransition(); }, [pathname]);

    // Count visits to More pages; the most-visited become More's pinned shortcuts.
    useEffect(() => { recordMoreVisit(pathname, morePageHrefs); }, [pathname]);

    useEffect(() => {
        initPushNotifications();
        runNotificationCheck();
    }, []);

    // Android hardware/gesture back button lives in CapacitorBridge (mounted
    // once at the true app root), so it is registered independently of any
    // layout that may remount when crossing between bare and chromed routes.

    // Warm up the backend + Supabase on first app load (free-tier cold-start mitigation)
    useEffect(() => {
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/health`).catch(() => {});
    }, []);

    useEffect(() => {
        const u = user;
        if (!u?.id) return;
        const showKey = `fintrack-show-tour-${u.id}`;
        const doneKey = `fintrack-tour-done-${u.id}`;
        if (localStorage.getItem(showKey) === 'true') {
            localStorage.removeItem(showKey);
            setShowTour(true);
        } else if (!localStorage.getItem(doneKey)) {
            setShowTour(true);
        }
    }, [user?.id]);

    useEffect(() => {
        const handleOnline = async () => {
            try {
                const count = await processQueue();
                if (count > 0) toast.success(`${count} transaction${count > 1 ? 's' : ''} synced`);
            } catch { /* silent */ }
        };
        window.addEventListener('online', handleOnline);
        return () => window.removeEventListener('online', handleOnline);
    }, []);

    return (
        <div
            style={{
                display: 'flex',
                minHeight: '100vh',
                background: 'var(--bg-base)',
            }}
        >
            <style>{`
                @keyframes pulseDot {
                    0%,100% { opacity:1; transform:scale(1); }
                    50% { opacity:0.5; transform:scale(1.5); }
                }
            `}</style>
            <OfflineBanner />
            <Sidebar />
            {/* No key/entry animation on <main>: pages swap in place like native
                tabs instead of replaying a fade-and-slide on every navigation. */}
            {/* Phone vs desktop shell is decided by CSS media queries (.app-main
                in globals.css), not by useIsMobile: the static export's HTML is
                built without knowing the screen, so a JS check painted the
                desktop layout on phones until the app loaded. */}
            <main className="app-main" data-collapsed={sidebarCollapsed ? 'true' : undefined}>
                <div className="app-main-inner">
                    {/* Keyed so a crashed page's error state resets when you navigate away. */}
                    <PageErrorBoundary key={pathname}><ErrorBoundary>{children}</ErrorBoundary></PageErrorBoundary>
                </div>
            </main>
            {/* The mobile add-transaction button now lives inside BottomNav, docked
                beside the pill, so the two move and morph as one unit. */}
            <BottomNav onOpenTour={() => setShowTour(true)} />

            {/* Desktop Add Transaction FAB */}
            {!hideAddFabRoutes.some(r => pathname.startsWith(r)) && (
                <div className="desktop-only" style={{ position: 'fixed', bottom: '32px', right: '32px', zIndex: 500 }}>
                    {addFabHover && (
                        <div style={{
                            position: 'absolute', bottom: '100%', left: '50%',
                            transform: 'translateX(-50%)', marginBottom: '8px',
                            backgroundColor: 'var(--bg-surface-1)', border: '1px solid var(--border-subtle)',
                            borderRadius: '6px', padding: '4px 10px', fontSize: '12px',
                            color: 'var(--text-primary)', whiteSpace: 'nowrap', pointerEvents: 'none',
                        }}>
                            Add Transaction
                        </div>
                    )}
                    <button
                        onClick={() => router.push('/transactions?add=true')}
                        onMouseEnter={() => setAddFabHover(true)}
                        onMouseLeave={() => { setAddFabHover(false); setAddFabPressed(false); }}
                        onMouseDown={() => setAddFabPressed(true)}
                        onMouseUp={() => setAddFabPressed(false)}
                        aria-label="Add transaction"
                        style={{
                            width: '52px', height: '52px', borderRadius: '50%',
                            background: 'var(--accent)',
                            border: 'none', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            boxShadow: addFabHover ? '0 6px 28px var(--accent-subtle)' : '0 4px 20px var(--accent-border)',
                            transform: addFabPressed ? 'scale(0.93)' : addFabHover ? 'scale(1.1)' : 'scale(1)',
                            transition: 'transform 180ms cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.15s ease',
                        }}
                    >
                        <Plus size={22} color="white" strokeWidth={2.5} />
                    </button>
                </div>
            )}

            <RedesignAnnouncement />
            <ToastContainer />
            <WalkthroughTour
                isOpen={showTour}
                onClose={() => {
                    setShowTour(false);
                    if (user?.id) {
                        localStorage.setItem(`fintrack-tour-done-${user.id}`, 'true');
                    }
                }}
            />
        </div>
    );
}
