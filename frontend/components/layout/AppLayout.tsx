'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Sparkles } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { BottomNav } from './BottomNav';
import { FAB } from '@/components/ui/FAB';
import { WalkthroughTour } from '@/components/ui/WalkthroughTour';
import { useIsMobile } from '@/hooks/useWindowSize';
import { useThemeStore } from '@/store/themeStore';
import { useAuthStore } from '@/store/authStore';

const hideFabRoutes = ['/login', '/register', '/onboarding', '/ai-chat', '/profile'];
const hideHelpRoutes = ['/login', '/register', '/onboarding', '/verify-otp'];

export function AppLayout({ children }: { children: React.ReactNode }) {
    const isMobile = useIsMobile();
    const { loadTheme } = useThemeStore();
    const pathname = usePathname();
    const router = useRouter();
    const [collapsed, setCollapsed] = useState(false);
    const [aiFabHover, setAiFabHover] = useState(false);
    const [showTour, setShowTour] = useState(false);
    const { user } = useAuthStore();

    useEffect(() => { loadTheme(); }, []);

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

    return (
        <div className="page-glow" style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-primary)' }}>
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
                    background: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    animation: 'pageEnter 0.2s ease-out forwards',
                }}
            >
                {children}
            </main>
            {isMobile && <BottomNav />}
            {isMobile && !hideFabRoutes.some(r => pathname.startsWith(r)) && <FAB />}

            {/* Help / Tour button */}
            {!hideHelpRoutes.some(r => pathname.startsWith(r)) && (
                <button
                    type="button"
                    onClick={() => setShowTour(true)}
                    style={{
                        position: 'fixed',
                        bottom: 'calc(172px + env(safe-area-inset-bottom))',
                        right: '20px',
                        width: '36px',
                        height: '36px',
                        borderRadius: '50%',
                        background: 'var(--bg-card)',
                        border: '1px solid var(--bg-border)',
                        color: 'var(--text-secondary)',
                        fontSize: '16px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                        zIndex: 500,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'border-color 0.15s, color 0.15s',
                    }}
                    onMouseEnter={e => {
                        (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent-blue)';
                        (e.currentTarget as HTMLElement).style.color = 'var(--accent-blue)';
                    }}
                    onMouseLeave={e => {
                        (e.currentTarget as HTMLElement).style.borderColor = 'var(--bg-border)';
                        (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)';
                    }}
                >
                    ?
                </button>
            )}

            {/* Desktop AI Chat FAB */}
            {!isMobile && !hideFabRoutes.some(r => pathname.startsWith(r)) && (
                <div style={{ position: 'fixed', bottom: '32px', right: '32px', zIndex: 500 }}>
                    {aiFabHover && (
                        <div style={{ position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)', marginBottom: '8px', backgroundColor: 'var(--bg-card)', border: '1px solid var(--bg-border)', borderRadius: '6px', padding: '4px 10px', fontSize: '12px', color: 'var(--text-primary)', whiteSpace: 'nowrap', pointerEvents: 'none' }}>
                            AI Chat
                        </div>
                    )}
                    <button
                        onClick={() => router.push('/ai-chat')}
                        onMouseEnter={() => setAiFabHover(true)}
                        onMouseLeave={() => setAiFabHover(false)}
                        style={{
                            width: '52px', height: '52px', borderRadius: '50%',
                            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                            border: 'none', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            boxShadow: aiFabHover ? '0 6px 28px rgba(99,102,241,0.6)' : '0 4px 20px rgba(99,102,241,0.4)',
                            transform: aiFabHover ? 'scale(1.1)' : 'scale(1)',
                            transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                        }}
                    >
                        <Sparkles size={22} color="white" />
                    </button>
                </div>
            )}
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
