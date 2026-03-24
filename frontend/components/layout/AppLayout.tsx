'use client';

import { useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { BottomNav } from './BottomNav';
import { useIsMobile } from '@/hooks/useWindowSize';
import { useThemeStore } from '@/store/themeStore';

export function AppLayout({ children }: { children: React.ReactNode }) {
    const isMobile = useIsMobile();
    const { loadTheme } = useThemeStore();

    useEffect(() => { loadTheme(); }, []);

    return (
        <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-primary)' }}>
            <Sidebar />
            <main style={{ marginLeft: isMobile ? '0' : '220px', flex: 1, paddingTop: isMobile ? '16px' : '28px', paddingRight: isMobile ? '16px' : '32px', paddingBottom: isMobile ? 'calc(80px + env(safe-area-inset-bottom, 0px))' : '28px', paddingLeft: isMobile ? '16px' : '32px', minHeight: '100vh', overflowX: 'hidden', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
                {children}
            </main>
            {isMobile && <BottomNav />}
        </div>
    );
}