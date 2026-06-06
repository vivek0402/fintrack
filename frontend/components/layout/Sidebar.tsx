'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
    LayoutDashboard, ArrowLeftRight, PieChart, Target,
    TrendingUp, LogOut, CalendarDays, RefreshCw,
    Settings, Flag, FileText, Users, Brain, CalendarClock,
    ChevronLeft, ChevronRight, FolderOpen, MessageSquare, Receipt, Banknote,
    Wallet, Heart, Award,
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useThemeStore } from '@/store/themeStore';
import { useIsMobile } from '@/hooks/useWindowSize';
import { GlobalSearch } from './GlobalSearch';

const navItems = [
    { href: '/dashboard',           icon: LayoutDashboard, label: 'Dashboard' },
    { href: '/transactions',        icon: ArrowLeftRight,  label: 'Transactions' },
    { href: '/accounts',            icon: Wallet,          label: 'Accounts' },
    { href: '/calendar',            icon: CalendarDays,    label: 'Calendar' },
    { href: '/analytics',           icon: PieChart,        label: 'Analytics' },
    { href: '/budgets',             icon: Target,          label: 'Budgets' },
    { href: '/goals',               icon: Flag,            label: 'Goals' },
    { href: '/reports',             icon: FileText,        label: 'Reports' },
    { href: '/health-score',        icon: Heart,           label: 'Health Score' },
    { href: '/year-review',         icon: Award,           label: 'Year Review' },
    { href: '/forecast',            icon: CalendarClock,   label: 'Forecast' },
    { href: '/personality',         icon: Brain,           label: 'Personality' },
    { href: '/tax-estimate',        icon: Receipt,         label: 'Tax Estimate' },
    { href: '/salary-intelligence', icon: Banknote,        label: 'Salary AI' },
    { href: '/ai-chat',             icon: MessageSquare,   label: 'AI Chat' },
    { href: '/recurring',           icon: RefreshCw,       label: 'Recurring' },
    { href: '/one-time-expenses',   icon: Receipt,         label: 'One-Time' },
    { href: '/splits',              icon: Users,           label: 'Splits' },
    { href: '/groups',              icon: FolderOpen,      label: 'Groups' },
    { href: '/profile',             icon: Settings,        label: 'Settings' },
];

interface SidebarProps {
    collapsed: boolean;
    onToggle: () => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
    const pathname = usePathname();
    const router = useRouter();
    const { user, logout } = useAuthStore();
    const { loadTheme } = useThemeStore();
    const isMobile = useIsMobile();

    useEffect(() => { loadTheme(); }, []);

    if (isMobile) return null;

    const handleLogout = () => { logout(); router.push('/login'); };

    const initials = user?.full_name
        ? user.full_name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
        : '?';

    return (
        <aside style={{
            width: collapsed ? '64px' : '220px',
            transition: 'width 0.2s ease',
            overflow: 'hidden',
            minHeight: '100vh',
            background: 'var(--bg-card)',
            borderRight: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            padding: collapsed ? '20px 0' : '20px 12px',
            position: 'fixed',
            top: 0,
            left: 0,
            zIndex: 50,
            boxShadow: 'var(--shadow-card)',
        }}>

            {/* Collapse toggle */}
            <div style={{ display: 'flex', justifyContent: collapsed ? 'center' : 'flex-end', marginBottom: '4px' }}>
                <button
                    type="button"
                    onClick={onToggle}
                    title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                    style={{
                        backgroundColor: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'var(--text-secondary)',
                        padding: '4px',
                        borderRadius: '6px',
                        display: 'flex',
                        alignItems: 'center',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)'; }}
                >
                    {collapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
                </button>
            </div>

            {/* Logo */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '4px 10px',
                marginBottom: '18px',
                justifyContent: collapsed ? 'center' : 'flex-start',
            }}>
                <div style={{
                    width: '32px',
                    height: '32px',
                    flexShrink: 0,
                    background: 'var(--accent)',
                    borderRadius: '8px',
                    border: '1px solid var(--accent-border)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                }}>
                    <TrendingUp size={17} color="white" strokeWidth={2.5} />
                </div>
                {!collapsed && (
                    <span style={{
                        fontFamily: 'var(--font-display)',
                        fontWeight: 800,
                        fontSize: '1.05rem',
                        color: 'var(--text-primary)',
                        letterSpacing: '-0.02em',
                        whiteSpace: 'nowrap',
                    }}>
                        FinTrack
                    </span>
                )}
            </div>

            {!collapsed && <GlobalSearch />}

            {/* Nav items */}
            <nav style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1, marginTop: '4px' }}>
                {navItems.map(({ href, icon: Icon, label }) => {
                    const isActive = pathname === href || pathname.startsWith(href + '/');
                    return (
                        <Link key={href} href={href} style={{ textDecoration: 'none' }} title={collapsed ? label : undefined}>
                            <div
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: collapsed ? '0' : '10px',
                                    justifyContent: collapsed ? 'center' : undefined,
                                    padding: collapsed ? '9px 0' : '9px 12px',
                                    paddingLeft: !collapsed ? (isActive ? '9px' : '12px') : undefined,
                                    borderRadius: '10px',
                                    background: isActive ? 'var(--accent-light)' : 'transparent',
                                    borderLeft: !collapsed
                                        ? (isActive ? '3px solid var(--accent)' : '3px solid transparent')
                                        : 'none',
                                    color: isActive ? 'var(--accent)' : 'var(--text-muted)',
                                    fontSize: '0.86rem',
                                    fontWeight: isActive ? 600 : 400,
                                    transition: 'all var(--transition-fast)',
                                    cursor: 'pointer',
                                }}
                                onMouseEnter={e => {
                                    if (!isActive) {
                                        (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)';
                                        (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)';
                                        if (!collapsed) (e.currentTarget as HTMLElement).style.paddingLeft = '14px';
                                    }
                                }}
                                onMouseLeave={e => {
                                    if (!isActive) {
                                        (e.currentTarget as HTMLElement).style.background = 'transparent';
                                        (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)';
                                        if (!collapsed) (e.currentTarget as HTMLElement).style.paddingLeft = '12px';
                                    }
                                }}
                            >
                                <Icon size={16} color="currentColor" />
                                {!collapsed && label}
                            </div>
                        </Link>
                    );
                })}
            </nav>

            {/* Divider */}
            <div style={{
                height: '1px',
                background: 'linear-gradient(90deg, transparent, var(--border), transparent)',
                margin: '12px 0',
            }} />

            {/* User card + logout */}
            <div>
                {collapsed ? (
                    <div title={user?.full_name} style={{ display: 'flex', justifyContent: 'center', padding: '10px 0' }}>
                        <div style={{
                            width: '34px',
                            height: '34px',
                            borderRadius: '50%',
                            flexShrink: 0,
                            background: 'var(--accent)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontFamily: 'var(--font-display)',
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            color: 'white',
                        }}>
                            {initials}
                        </div>
                    </div>
                ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 10px 6px' }}>
                        <div style={{
                            width: '34px',
                            height: '34px',
                            borderRadius: '50%',
                            flexShrink: 0,
                            background: 'var(--accent)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontFamily: 'var(--font-display)',
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            color: 'white',
                        }}>
                            {initials}
                        </div>
                        <div style={{ minWidth: 0 }}>
                            <p style={{
                                fontSize: '0.8rem',
                                fontWeight: 600,
                                color: 'var(--text-primary)',
                                margin: 0,
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                            }}>
                                {user?.full_name}
                            </p>
                            <p style={{
                                fontSize: '0.68rem',
                                color: 'var(--text-muted)',
                                margin: '1px 0 0 0',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                            }}>
                                {user?.email}
                            </p>
                        </div>
                    </div>
                )}

                <button
                    type="button"
                    onClick={handleLogout}
                    title={collapsed ? 'Logout' : undefined}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: collapsed ? '0' : '10px',
                        justifyContent: collapsed ? 'center' : undefined,
                        padding: collapsed ? '9px 0' : '9px 12px',
                        width: '100%',
                        borderRadius: '10px',
                        background: 'transparent',
                        border: '1px solid transparent',
                        color: 'var(--text-secondary)',
                        fontSize: '0.86rem',
                        cursor: 'pointer',
                        transition: 'all var(--transition-fast)',
                    }}
                    onMouseEnter={e => {
                        const el = e.currentTarget as HTMLElement;
                        el.style.background = 'color-mix(in srgb, var(--color-exp) 10%, transparent)';
                        el.style.color = 'var(--color-exp)';
                        el.style.borderColor = 'color-mix(in srgb, var(--color-exp) 22%, transparent)';
                    }}
                    onMouseLeave={e => {
                        const el = e.currentTarget as HTMLElement;
                        el.style.background = 'transparent';
                        el.style.color = 'var(--text-secondary)';
                        el.style.borderColor = 'transparent';
                    }}
                >
                    <LogOut size={16} />
                    {!collapsed && 'Logout'}
                </button>
            </div>
        </aside>
    );
}
