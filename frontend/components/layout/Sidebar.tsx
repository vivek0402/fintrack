'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
    LayoutDashboard, ArrowLeftRight, PieChart, Target,
    TrendingUp, LogOut, CalendarDays, RefreshCw,
    Settings, Flag, FileText
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useThemeStore } from '@/store/themeStore';
import { useIsMobile } from '@/hooks/useWindowSize';
import { GlobalSearch } from './GlobalSearch';
import { ThemeToggle } from '@/components/ui/ThemeToggle';

const navItems = [
    { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { href: '/transactions', icon: ArrowLeftRight, label: 'Transactions' },
    { href: '/calendar', icon: CalendarDays, label: 'Calendar' },
    { href: '/analytics', icon: PieChart, label: 'Analytics' },
    { href: '/budgets', icon: Target, label: 'Budgets' },
    { href: '/goals', icon: Flag, label: 'Goals' },
    { href: '/reports', icon: FileText, label: 'Reports' },
    { href: '/recurring', icon: RefreshCw, label: 'Recurring' },
    { href: '/profile', icon: Settings, label: 'Settings' },
];

export function Sidebar() {
    const pathname = usePathname();
    const router = useRouter();
    const { user, logout } = useAuthStore();
    const { loadTheme } = useThemeStore();
    const isMobile = useIsMobile();

    useEffect(() => { loadTheme(); }, []);

    if (isMobile) return null;

    const handleLogout = () => { logout(); router.push('/login'); };

    return (
        <aside style={{ width: '220px', minHeight: '100vh', background: 'var(--bg-secondary)', borderRight: '1px solid var(--bg-border)', display: 'flex', flexDirection: 'column', padding: '24px 12px', position: 'fixed', top: 0, left: 0, zIndex: 50 }}>

            {/* Logo */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '0 8px', marginBottom: '20px' }}>
                <div style={{ width: '36px', height: '36px', background: 'rgba(16,185,129,0.15)', borderRadius: '10px', border: '1px solid rgba(16,185,129,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <TrendingUp size={18} color="#10b981" />
                </div>
                <span style={{ fontFamily: 'Sora, sans-serif', fontWeight: 600, fontSize: '1rem', color: 'var(--text-primary)' }}>FinTrack</span>
            </div>

            <GlobalSearch />

            {/* Nav */}
            <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1 }}>
                {navItems.map(({ href, icon: Icon, label }) => {
                    const isActive = pathname === href;
                    return (
                        <Link key={href} href={href} style={{ textDecoration: 'none' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: '10px', background: isActive ? 'rgba(16,185,129,0.1)' : 'transparent', border: isActive ? '1px solid rgba(16,185,129,0.2)' : '1px solid transparent', color: isActive ? '#10b981' : 'var(--text-secondary)', fontSize: '0.875rem', fontWeight: isActive ? 500 : 400, transition: 'all 0.2s', cursor: 'pointer' }}>
                                <Icon size={17} />
                                {label}
                            </div>
                        </Link>
                    );
                })}
            </nav>

            {/* Bottom */}
            <div style={{ borderTop: '1px solid var(--bg-border)', paddingTop: '12px', marginTop: '12px' }}>
                <ThemeToggle />
                <div style={{ padding: '8px 12px', margin: '8px 0 4px' }}>
                    <p style={{ fontSize: '0.8rem', fontWeight: 500, color: 'var(--text-primary)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.full_name}</p>
                    <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', margin: '2px 0 0 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.email}</p>
                </div>
                <button onClick={handleLogout} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: '10px', background: 'transparent', border: '1px solid transparent', color: 'var(--text-secondary)', fontSize: '0.875rem', cursor: 'pointer', width: '100%', transition: 'all 0.2s' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(244,63,94,0.08)'; (e.currentTarget as HTMLElement).style.color = '#f87171'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)'; }}
                >
                    <LogOut size={17} />
                    Logout
                </button>
            </div>
        </aside>
    );
}