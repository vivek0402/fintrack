'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
    LayoutDashboard, ArrowLeftRight, PieChart, MoreHorizontal,
    CalendarDays, Target, Flag, FileText, RefreshCw, Settings, X, LogOut,
    Users, Brain, CalendarClock
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';

const mainTabs = [
    { href: '/dashboard', icon: LayoutDashboard, label: 'Home' },
    { href: '/transactions', icon: ArrowLeftRight, label: 'Transactions' },
    { href: '/analytics', icon: PieChart, label: 'Analytics' },
];

const moreItems = [
    { href: '/calendar',     icon: CalendarDays,  label: 'Calendar' },
    { href: '/budgets',      icon: Target,        label: 'Budgets' },
    { href: '/goals',        icon: Flag,          label: 'Goals' },
    { href: '/reports',      icon: FileText,      label: 'Reports' },
    { href: '/forecast',     icon: CalendarClock, label: 'Forecast' },
    { href: '/personality',  icon: Brain,         label: 'Personality' },
    { href: '/recurring',    icon: RefreshCw,     label: 'Recurring' },
    { href: '/splits',       icon: Users,         label: 'Splits' },
    { href: '/profile',      icon: Settings,      label: 'Settings' },
];

const moreHrefs = moreItems.map(i => i.href);

export function BottomNav() {
    const pathname = usePathname();
    const router = useRouter();
    const { logout } = useAuthStore();
    const [showMore, setShowMore] = useState(false);

    const isActive = (href: string) => pathname === href || pathname.startsWith(href);
    const moreActive = !isActive('/dashboard') && !isActive('/transactions') && !isActive('/analytics');
    const isMoreActive = moreHrefs.includes(pathname);

    const handleMoreItemClick = (href: string) => {
        setShowMore(false);
        router.push(href);
    };

    const handleLogout = () => {
        setShowMore(false);
        logout();
        router.push('/login');
    };

    return (
        <>
            {/* More bottom sheet overlay */}
            {showMore && (
                <div
                    onClick={() => setShowMore(false)}
                    style={{
                        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
                        zIndex: 150, backdropFilter: 'blur(2px)',
                    }}
                />
            )}

            {/* More bottom sheet panel */}
            {showMore && (
                <div style={{
                    position: 'fixed', left: 0, right: 0,
                    bottom: 'calc(64px + env(safe-area-inset-bottom, 0px))',
                    background: 'var(--bg-secondary)',
                    borderTop: '1px solid var(--bg-border)',
                    borderRadius: '20px 20px 0 0',
                    zIndex: 200,
                    padding: '16px 16px 8px',
                    boxShadow: '0 -8px 32px rgba(0,0,0,0.4)',
                }}>
                    {/* Sheet header */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                        <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>More</span>
                        <button
                            onClick={() => setShowMore(false)}
                            style={{ background: 'var(--bg-hover)', border: 'none', borderRadius: '50%', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-secondary)' }}
                        >
                            <X size={14} />
                        </button>
                    </div>

                    {/* Grid of items */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '16px' }}>
                        {moreItems.map(({ href, icon: Icon, label }) => {
                            const isActive = pathname === href;
                            return (
                                <button
                                    key={href}
                                    onClick={() => handleMoreItemClick(href)}
                                    style={{
                                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px',
                                        padding: '14px 8px', borderRadius: '14px', border: 'none', cursor: 'pointer',
                                        background: isActive ? 'var(--accent-blue-bg)' : 'var(--bg-card)',
                                        color: isActive ? 'var(--accent-blue)' : 'var(--text-secondary)',
                                        transition: 'all 0.2s',
                                    }}
                                >
                                    <Icon size={22} />
                                    <span style={{ fontSize: '0.72rem', fontWeight: isActive ? 600 : 400 }}>{label}</span>
                                </button>
                            );
                        })}
                    </div>

                    {/* Logout row */}
                    <div style={{ borderTop: '1px solid var(--bg-border)', paddingTop: '12px' }}>
                        <button
                            onClick={handleLogout}
                            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '10px', border: '1px solid rgba(244,63,94,0.25)', background: 'rgba(244,63,94,0.08)', color: '#f87171', fontSize: '0.8rem', fontWeight: 500, cursor: 'pointer' }}
                        >
                            <LogOut size={15} />
                            Logout
                        </button>
                    </div>
                </div>
            )}

            {/* Bottom nav bar */}
            <nav style={{
                position: 'fixed', bottom: 0, left: 0, right: 0,
                background: 'var(--bg-secondary)',
                borderTop: '0.5px solid var(--bg-border)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-around',
                paddingTop: '8px',
                paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))',
                zIndex: 100,
                boxShadow: '0 -8px 32px rgba(0, 0, 0, 0.3)',
            }}>
                {mainTabs.map(({ href, icon: Icon, label }) => {
                    const active = isActive(href);
                    return (
                        <Link key={href} href={href} style={{ textDecoration: 'none' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', padding: '4px 16px' }}>
                                <div style={{ width: '20px', height: '3px', borderRadius: '2px', background: active ? 'var(--accent-blue)' : 'transparent', marginBottom: '2px' }} />
                                <Icon size={22} color={active ? 'var(--accent-blue)' : 'var(--text-secondary)'} />
                                <span style={{ fontSize: '11px', color: active ? 'var(--accent-blue)' : 'var(--text-secondary)', fontWeight: active ? 600 : 400 }}>{label}</span>
                            </div>
                        </Link>
                    );
                })}

                {/* More tab */}
                <button
                    onClick={() => setShowMore(v => !v)}
                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', padding: '4px 16px', border: 'none', background: 'transparent', cursor: 'pointer' }}
                >
                    <div style={{ width: '20px', height: '3px', borderRadius: '2px', background: moreActive || showMore ? 'var(--accent-blue)' : 'transparent', marginBottom: '2px' }} />
                    <MoreHorizontal size={22} color={moreActive || showMore ? 'var(--accent-blue)' : 'var(--text-secondary)'} />
                    <span style={{ fontSize: '11px', color: moreActive || showMore ? 'var(--accent-blue)' : 'var(--text-secondary)', fontWeight: moreActive || showMore ? 600 : 400 }}>More</span>
                </button>
            </nav>
        </>
    );
}
