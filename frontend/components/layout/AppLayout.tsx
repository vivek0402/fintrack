'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Sparkles, Plus } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { BottomNav } from './BottomNav';
import { WalkthroughTour } from '@/components/ui/WalkthroughTour';
import { useIsMobile } from '@/hooks/useWindowSize';
import { useThemeStore } from '@/store/themeStore';
import { useAuthStore } from '@/store/authStore';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { ToastContainer } from '@/components/ui/ToastContainer';
import { ThemePicker } from '@/components/ui/ThemePicker';
import { RedesignAnnouncement } from '@/components/ui/RedesignAnnouncement';

const hideFabRoutes = ['/login', '/register', '/onboarding', '/ai-chat', '/profile'];
const hideAddFabRoutes = ['/login', '/register', '/onboarding', '/ai-chat', '/transactions'];

// --bg-glow is already a full rgba(...) value in the token system so it can be
// dropped directly into a gradient stop — no getComputedStyle needed.
function buildGlowBackground(theme: string): string {
    if (theme === 'dark') {
        return [
            'radial-gradient(ellipse 70% 55% at 95% 0%,  var(--bg-glow), transparent 52%)',
            'radial-gradient(ellipse 55% 45% at 5% 100%, var(--bg-glow), transparent 52%)',
            '#000000',
        ].join(', ');
    }
    return [
        'radial-gradient(ellipse 100% 50% at 50% -5%, var(--bg-glow), transparent 50%)',
        'var(--bg-page)',
    ].join(', ');
}

export function AppLayout({ children }: { children: React.ReactNode }) {
    const isMobile = useIsMobile();
    const { loadTheme, theme } = useThemeStore();
    const pathname = usePathname();
    const router = useRouter();
    const [collapsed, setCollapsed] = useState(false);
    const [aiFabHover, setAiFabHover] = useState(false);
    const [addFabHover, setAddFabHover] = useState(false);
    const [showTour, setShowTour] = useState(false);
    const { user } = useAuthStore();

    useEffect(() => { loadTheme(); }, []);

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
        const stored = localStorage.getItem('sidebar-collapsed');
        if (stored === 'true') setCollapsed(true);
    }, []);

    const handleToggle = () => {
        setCollapsed(v => {
            const next = !v;
            localStorage.setItem('sidebar-collapsed', String(next));
            return next;
        });
    };

    const sidebarWidth = collapsed ? '64px' : '220px';
    const glowBackground = buildGlowBackground(theme);

    return (
        <div
            className="page-glow"
            style={{
                display: 'flex',
                minHeight: '100vh',
                background: glowBackground,
                backgroundAttachment: 'fixed',
                transition: 'background 0.5s ease',
            }}
        >
            <style>{`
                .fintrack-card {
                    transition: transform 150ms ease-out, box-shadow 150ms ease-out;
                }
                .fintrack-card:hover {
                    transform: translateY(-2px);
                }
            `}</style>
            <Sidebar collapsed={collapsed} onToggle={handleToggle} />
            <main
                key={pathname}
                style={{
                    marginLeft: isMobile ? '0' : sidebarWidth,
                    transition: 'margin-left 0.2s ease',
                    flex: 1,
                    paddingTop: isMobile ? '16px' : '28px',
                    paddingRight: isMobile ? '16px' : '32px',
                    paddingBottom: isMobile ? 'calc(160px + env(safe-area-inset-bottom))' : '28px',
                    paddingLeft: isMobile ? '16px' : '32px',
                    minHeight: '100vh',
                    overflowX: 'hidden',
                    color: 'var(--text-primary)',
                    animation: 'pageEnter 0.2s ease-out forwards',
                }}
            >
                <ErrorBoundary>{children}</ErrorBoundary>
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
                        boxShadow: '0 4px 20px var(--accent-tint)',
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
                            backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)',
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
                            boxShadow: addFabHover ? '0 6px 28px var(--accent-tint)' : '0 4px 20px var(--accent-border)',
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
                            backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)',
                            borderRadius: '6px', padding: '4px 10px', fontSize: '12px',
                            color: 'var(--text-primary)', whiteSpace: 'nowrap', pointerEvents: 'none',
                        }}>
                            AI Chat
                        </div>
                    )}
                    <button
                        onClick={() => router.push('/ai-chat')}
                        onMouseEnter={() => setAiFabHover(true)}
                        onMouseLeave={() => setAiFabHover(false)}
                        style={{
                            width: '52px', height: '52px', borderRadius: '50%',
                            background: 'linear-gradient(135deg, var(--accent-2), var(--accent-3))',
                            border: 'none', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            boxShadow: aiFabHover ? '0 6px 28px var(--accent-tint)' : '0 4px 20px var(--accent-border)',
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
            <ThemePicker />
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
