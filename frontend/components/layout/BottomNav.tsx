'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
    LayoutDashboard, ArrowLeftRight, PieChart, MoreHorizontal,
    CalendarDays, Target, Trophy, BarChart2, RefreshCw, Settings, X, LogOut,
    Users, FolderOpen, ChevronRight, TrendingUp, Brain, MessageSquare,
    Receipt, Banknote, Wallet,
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';

const mainTabs = [
    { href: '/dashboard',    icon: LayoutDashboard, label: 'Home' },
    { href: '/transactions', icon: ArrowLeftRight,  label: 'Transactions' },
    { href: '/analytics',    icon: PieChart,        label: 'Analytics' },
];

const moreSections = [
    {
        label: 'FINANCE',
        items: [
            { href: '/accounts', icon: Wallet,       label: 'Accounts' },
            { href: '/calendar', icon: CalendarDays, label: 'Calendar' },
            { href: '/budgets',  icon: Target,       label: 'Budgets' },
            { href: '/goals',    icon: Trophy,       label: 'Goals' },
            { href: '/reports',  icon: BarChart2,    label: 'Reports' },
        ],
    },
    {
        label: 'GROUPS & SPLITS',
        items: [
            { href: '/recurring',          icon: RefreshCw,  label: 'Recurring' },
            { href: '/one-time-expenses', icon: Receipt,    label: 'One-Time' },
            { href: '/groups',            icon: FolderOpen, label: 'Groups' },
            { href: '/splits',            icon: Users,      label: 'Splits' },
        ],
    },
    {
        label: 'TOOLS',
        items: [
            { href: '/forecast',              icon: TrendingUp,    label: 'Forecast' },
            { href: '/personality',           icon: Brain,         label: 'Personality' },
            { href: '/tax-estimate',          icon: Receipt,       label: 'Tax' },
            { href: '/salary-intelligence',   icon: Banknote,      label: 'Salary AI' },
            { href: '/ai-chat',               icon: MessageSquare, label: 'AI Chat' },
            { href: '/profile',               icon: Settings,      label: 'Settings' },
        ],
    },
];

const moreHrefs = moreSections.flatMap(s => s.items.map(i => i.href));

// Pre-compute stagger indices so they're stable across renders
const sectionsWithIndex = (() => {
    let idx = 0;
    return moreSections.map(s => ({
        ...s,
        items: s.items.map(item => ({ ...item, staggerIdx: idx++ })),
    }));
})();

export function BottomNav() {
    const pathname = usePathname();
    const router = useRouter();
    const { logout } = useAuthStore();

    const [moreOpen, setMoreOpen] = useState(false);
    const [rendered, setRendered] = useState(false);
    const [visible, setVisible] = useState(false);

    const isActive = (href: string) => pathname === href || pathname.startsWith(href);
    const moreActive = !isActive('/dashboard') && !isActive('/transactions') && !isActive('/analytics');

    // Mount / unmount with slide animation
    useEffect(() => {
        if (moreOpen) {
            setRendered(true);
            requestAnimationFrame(() => setVisible(true));
        } else {
            setVisible(false);
            const t = setTimeout(() => setRendered(false), 300);
            return () => clearTimeout(t);
        }
    }, [moreOpen]);

    // Body scroll lock
    useEffect(() => {
        document.body.style.overflow = moreOpen ? 'hidden' : '';
        return () => { document.body.style.overflow = ''; };
    }, [moreOpen]);

    const handleMoreItemClick = (href: string) => {
        setMoreOpen(false);
        router.push(href);
    };

    const handleLogout = () => {
        setMoreOpen(false);
        logout();
        router.push('/login');
    };

    return (
        <>
            {/* Backdrop — blocks all background interaction */}
            {rendered && (
                <div
                    onClick={() => setMoreOpen(false)}
                    style={{
                        position: 'fixed',
                        inset: 0,
                        zIndex: 998,
                        backgroundColor: 'rgba(0,0,0,0.5)',
                        backdropFilter: 'blur(2px)',
                        WebkitBackdropFilter: 'blur(2px)',
                        opacity: moreOpen ? 1 : 0,
                        transition: 'opacity 0.2s ease',
                        pointerEvents: moreOpen ? 'all' : 'none',
                    }}
                />
            )}

            {/* More sheet */}
            {rendered && (
                <div style={{
                    position: 'fixed',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    zIndex: 999,
                    backgroundColor: 'var(--bg-card)',
                    borderRadius: '20px 20px 0 0',
                    borderTop: '1px solid var(--bg-border)',
                    paddingBottom: 'calc(16px + env(safe-area-inset-bottom))',
                    maxHeight: '85vh',
                    overflowY: 'auto',
                    transform: moreOpen ? 'translateY(0)' : 'translateY(100%)',
                    opacity: moreOpen ? 1 : 0,
                    transition: 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.2s ease',
                }}>
                    {/* Drag handle */}
                    <div style={{
                        width: '36px',
                        height: '4px',
                        borderRadius: '2px',
                        backgroundColor: 'var(--bg-border)',
                        margin: '12px auto 8px',
                    }} />

                    {/* Header */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '4px 20px 8px',
                    }}>
                        <span style={{
                            fontSize: '16px',
                            fontWeight: 600,
                            color: 'var(--text-primary)',
                            fontFamily: 'Sora, sans-serif',
                        }}>
                            More
                        </span>
                        <button
                            onClick={() => setMoreOpen(false)}
                            style={{
                                background: 'none',
                                border: 'none',
                                color: 'var(--text-muted)',
                                cursor: 'pointer',
                                padding: '4px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                            }}
                        >
                            <X size={20} />
                        </button>
                    </div>

                    {/* Sections */}
                    {sectionsWithIndex.map((section, sectionIdx) => (
                        <div key={section.label}>
                            {/* Section label */}
                            <p style={{
                                fontSize: '11px',
                                color: 'var(--text-muted)',
                                letterSpacing: '1px',
                                padding: '4px 20px',
                                marginTop: '8px',
                                marginBottom: 0,
                                fontFamily: 'DM Sans, sans-serif',
                                fontWeight: 500,
                            }}>
                                {section.label}
                            </p>

                            {/* Item rows */}
                            {section.items.map(({ href, icon: Icon, label, staggerIdx }) => {
                                const active = pathname === href;
                                return (
                                    <button
                                        key={href}
                                        onClick={() => handleMoreItemClick(href)}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '16px',
                                            padding: '14px 20px',
                                            borderRadius: '12px',
                                            cursor: 'pointer',
                                            backgroundColor: 'transparent',
                                            border: 'none',
                                            width: '100%',
                                            opacity: visible ? 1 : 0,
                                            transform: visible ? 'translateY(0)' : 'translateY(16px)',
                                            transition: `background-color 0.15s, opacity 0.25s ease ${staggerIdx * 35}ms, transform 0.25s ease ${staggerIdx * 35}ms`,
                                        }}
                                    >
                                        {/* Icon container */}
                                        <div style={{
                                            width: '40px',
                                            height: '40px',
                                            borderRadius: '10px',
                                            backgroundColor: active ? 'rgba(59,130,246,0.15)' : 'var(--bg-hover)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            flexShrink: 0,
                                        }}>
                                            <Icon size={18} color={active ? 'var(--accent-blue)' : 'var(--text-secondary)'} />
                                        </div>

                                        {/* Label */}
                                        <span style={{
                                            fontSize: '15px',
                                            fontWeight: 500,
                                            color: active ? 'var(--accent-blue)' : 'var(--text-primary)',
                                            flex: 1,
                                            textAlign: 'left',
                                            fontFamily: 'DM Sans, sans-serif',
                                        }}>
                                            {label}
                                        </span>

                                        {/* Chevron */}
                                        <ChevronRight size={16} color="var(--text-muted)" />
                                    </button>
                                );
                            })}

                            {/* Divider between sections */}
                            {sectionIdx < sectionsWithIndex.length - 1 && (
                                <div style={{
                                    height: '1px',
                                    backgroundColor: 'var(--bg-border)',
                                    margin: '4px 20px',
                                }} />
                            )}
                        </div>
                    ))}

                    {/* Logout */}
                    <div style={{
                        borderTop: '1px solid var(--bg-border)',
                        margin: '8px 0 0',
                        padding: '4px 20px 0',
                    }}>
                        <button
                            onClick={handleLogout}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                padding: '12px 0',
                                background: 'none',
                                border: 'none',
                                color: '#f87171',
                                fontSize: '14px',
                                fontWeight: 500,
                                cursor: 'pointer',
                                fontFamily: 'DM Sans, sans-serif',
                            }}
                        >
                            <LogOut size={16} />
                            Sign Out
                        </button>
                    </div>
                </div>
            )}

            {/* Bottom nav bar */}
            <nav style={{
                position: 'fixed',
                bottom: 0,
                left: 0,
                right: 0,
                background: 'var(--bg-secondary)',
                borderTop: '0.5px solid var(--bg-border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-around',
                paddingTop: '8px',
                paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))',
                zIndex: 997,
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
                    onClick={() => setMoreOpen(v => !v)}
                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', padding: '4px 16px', border: 'none', background: 'transparent', cursor: 'pointer' }}
                >
                    <div style={{ width: '20px', height: '3px', borderRadius: '2px', background: moreActive || moreOpen ? 'var(--accent-blue)' : 'transparent', marginBottom: '2px' }} />
                    <MoreHorizontal size={22} color={moreActive || moreOpen ? 'var(--accent-blue)' : 'var(--text-secondary)'} />
                    <span style={{ fontSize: '11px', color: moreActive || moreOpen ? 'var(--accent-blue)' : 'var(--text-secondary)', fontWeight: moreActive || moreOpen ? 600 : 400 }}>More</span>
                </button>
            </nav>
        </>
    );
}
