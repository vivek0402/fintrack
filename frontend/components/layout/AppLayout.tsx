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
            <OfflineBanner />
            <Sidebar />
            <main
                key={pathname}
                style={{
                    marginLeft: isMobile ? '0' : '240px',
                    flex: 1,
                    minHeight: '100vh',
                    overflowX: 'hidden',
                    color: 'var(--text-primary)',
                    animation: 'pageEnter 0.2s ease-out forwards',
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
            {isMobile && <BottomNav />}

            {/* Mobile Add Transaction FAB */}
            {isMobile && !hideAddFabRoutes.some(r => pathname.startsWith(r)) && (
                <button
                    onClick={() => router.push('/transactions?add=true')}
                    style={{
                        position: 'fixed',
                        bottom: 'calc(72px + env(safe-area-inset-bottom, 0px) + 16px)',
                        right: '16px',
                        zIndex: 996,
                        width: '52px',
                        height: '52px',
                        borderRadius: '50%',
                        background: 'var(--accent)',
                        border: 'none',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 4px 20px var(--accent-subtle)',
                        animation: 'springIn 400ms cubic-bezier(0.34,1.56,0.64,1) both',
                    }}
                >
                    <Plus size={24} color="white" strokeWidth={2.5} />
                </button>
            )}

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
