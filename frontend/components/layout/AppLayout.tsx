'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Sparkles, Plus } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { BottomNav } from './BottomNav';
import { WalkthroughTour } from '@/components/ui/WalkthroughTour';
import { OfflineBanner } from '@/components/ui/OfflineBanner';
import { useIsMobile } from '@/hooks/useWindowSize';
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

const hideFabRoutes = ['/login', '/register', '/onboarding', '/ai-advisor', '/profile'];
const hideAddFabRoutes = ['/login', '/register', '/onboarding', '/ai-advisor', '/transactions'];

export function AppLayout({ children }: { children: React.ReactNode }) {
    const isMobile = useIsMobile();
    const { loadTheme } = useThemeStore();
    const pathname = usePathname();
    const router = useRouter();
    const [aiFabHover, setAiFabHover] = useState(false);
    const [addFabHover, setAddFabHover] = useState(false);
    const [showTour, setShowTour] = useState(false);
    const { user } = useAuthStore();

    useEffect(() => { loadTheme(); }, []);

    useEffect(() => {
        initPushNotifications();
        runNotificationCheck();
    }, []);

    // Android hardware/gesture back button now lives in CapacitorBridge (mounted
    // once at the true app root) — AppLayout remounts on every page navigation,
    // which used to leave a registration gap on every nav where a back press
    // would fall through to the native default (exit) instead of our handler.

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
            {/* Ambient backdrop — income and expense curves blown up behind the whole
                app. This is what the glass surfaces frost; without it the blur has
                nothing to sample and the panels read as flat tinted rectangles. */}
            <div className="ambient-curves" aria-hidden="true">
                <svg viewBox="0 0 1200 1000" preserveAspectRatio="none">
                    <defs>
                        <filter id="ambGlow" x="-60%" y="-60%" width="220%" height="220%">
                            <feGaussianBlur stdDeviation="40" />
                        </filter>
                        <linearGradient id="ambInc" x1="0" y1="1" x2="1" y2="0">
                            <stop offset="0%" stopColor="var(--color-inc)" />
                            <stop offset="100%" stopColor="var(--accent)" />
                        </linearGradient>
                        <linearGradient id="ambExp" x1="0" y1="1" x2="1" y2="0">
                            <stop offset="0%" stopColor="var(--color-exp)" />
                            <stop offset="100%" stopColor="var(--color-warn)" />
                        </linearGradient>
                        <linearGradient id="ambFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.10" />
                            <stop offset="100%" stopColor="var(--color-inc)" stopOpacity="0" />
                        </linearGradient>
                    </defs>
                    <path d="M-40,950 C200,920 380,830 560,760 C800,665 980,540 1240,470" fill="none"
                        stroke="url(#ambExp)" strokeWidth="30" opacity="0.26" filter="url(#ambGlow)" />
                    <path d="M-40,860 C200,810 360,620 540,560 C790,478 960,270 1240,180" fill="none"
                        stroke="url(#ambInc)" strokeWidth="32" opacity="0.30" filter="url(#ambGlow)" />
                    <path d="M-40,860 C200,810 360,620 540,560 C790,478 960,270 1240,180 L1240,1040 L-40,1040 Z"
                        fill="url(#ambFill)" />
                    <path d="M-40,950 C200,920 380,830 560,760 C800,665 980,540 1240,470" fill="none"
                        stroke="url(#ambExp)" strokeWidth="3" opacity="0.46" />
                    <path d="M-40,860 C200,810 360,620 540,560 C790,478 960,270 1240,180" fill="none"
                        stroke="url(#ambInc)" strokeWidth="3.5" opacity="0.62" />
                </svg>
            </div>
            <OfflineBanner />
            <Sidebar onOpenTour={() => setShowTour(true)} />
            <main
                key={pathname}
                style={{
                    marginLeft: isMobile ? '0' : '240px',
                    flex: 1,
                    minHeight: '100vh',
                    overflowX: 'hidden',
                    color: 'var(--text-primary)',
                    animation: 'pageEnter 0.2s ease-out forwards',
                    // Lifts page content above the fixed ambient backdrop, which is
                    // positioned and would otherwise paint over unpositioned content.
                    position: 'relative',
                    zIndex: 1,
                }}
            >
                <div style={{
                    maxWidth: isMobile ? undefined : '1280px',
                    margin: isMobile ? undefined : '0 auto',
                    padding: isMobile
                        ? '16px 16px calc(160px + env(safe-area-inset-bottom))'
                        : '32px 40px',
                }}>
                    <PageErrorBoundary><ErrorBoundary>{children}</ErrorBoundary></PageErrorBoundary>
                </div>
            </main>
            {/* The mobile add-transaction button now lives inside BottomNav, docked
                beside the pill, so the two move and morph as one unit. */}
            {isMobile && <BottomNav onOpenTour={() => setShowTour(true)} />}

            {/* Desktop Add Transaction FAB */}
            {!isMobile && !hideAddFabRoutes.some(r => pathname.startsWith(r)) && (
                <div style={{ position: 'fixed', bottom: '32px', right: '96px', zIndex: 500 }}>
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
                        onMouseLeave={() => setAddFabHover(false)}
                        aria-label="Add transaction"
                        style={{
                            width: '52px', height: '52px', borderRadius: '50%',
                            background: 'var(--accent)',
                            border: 'none', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            boxShadow: addFabHover ? '0 6px 28px var(--accent-subtle)' : '0 4px 20px var(--accent-border)',
                            transform: addFabHover ? 'scale(1.1)' : 'scale(1)',
                            transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                        }}
                    >
                        <Plus size={22} color="white" strokeWidth={2.5} />
                    </button>
                </div>
            )}

            {/* Desktop AI Chat FAB */}
            {!isMobile && !hideFabRoutes.some(r => pathname.startsWith(r)) && (
                <div style={{ position: 'fixed', bottom: '32px', right: '32px', zIndex: 500 }}>
                    {aiFabHover && (
                        <div style={{
                            position: 'absolute', bottom: '100%', left: '50%',
                            transform: 'translateX(-50%)', marginBottom: '8px',
                            backgroundColor: 'var(--bg-surface-1)', border: '1px solid var(--border-subtle)',
                            borderRadius: '6px', padding: '4px 10px', fontSize: '12px',
                            color: 'var(--text-primary)', whiteSpace: 'nowrap', pointerEvents: 'none',
                        }}>
                            AI Chat
                        </div>
                    )}
                    <button
                        onClick={() => router.push('/ai-advisor')}
                        onMouseEnter={() => setAiFabHover(true)}
                        onMouseLeave={() => setAiFabHover(false)}
                        aria-label="Open AI chat"
                        style={{
                            width: '52px', height: '52px', borderRadius: '50%',
                            background: 'var(--accent)',
                            border: 'none', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            boxShadow: aiFabHover ? '0 6px 28px var(--accent-subtle)' : '0 4px 20px var(--accent-border)',
                            transform: aiFabHover ? 'scale(1.1)' : 'scale(1)',
                            transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                            animation: 'softPulse 3s ease-in-out infinite',
                            animationPlayState: aiFabHover ? 'paused' : 'running',
                        }}
                    >
                        <Sparkles size={22} color="white" />
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
                userId={user?.id || ''}
            />
        </div>
    );
}
