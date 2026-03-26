'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Sidebar } from './Sidebar';
import { BottomNav } from './BottomNav';
import { FAB } from '@/components/ui/FAB';
import { useIsMobile } from '@/hooks/useWindowSize';
import { useThemeStore } from '@/store/themeStore';

const hideFabRoutes = ['/login', '/register', '/onboarding', '/ai-chat', '/profile'];

export function AppLayout({ children }: { children: React.ReactNode }) {
    const isMobile = useIsMobile();
    const { loadTheme } = useThemeStore();
    const pathname = usePathname();
    const [collapsed, setCollapsed] = useState(false);

    useEffect(() => { loadTheme(); }, []);

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
        </div>
    );
}
