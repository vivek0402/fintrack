'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
    LayoutDashboard, ArrowLeftRight, PieChart, Target,
    LogOut, LineChart, Flag, Briefcase, Gauge, Bot, Settings,
    Waves, PiggyBank, Compass,
    CreditCard, Users, Handshake,
    MoreHorizontal, ChevronUp,
    PanelLeftClose, PanelLeftOpen,
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useThemeStore } from '@/store/themeStore';
import { GlobalSearch } from './GlobalSearch';
import { useTransitionNavigate } from '@/lib/viewTransition';
import { InstallPWA } from '@/components/ui/InstallPWA';
import { type } from '@/lib/typography';

// Always-visible daily-driver set — keeps the primary nav short
const coreItems = [
    { href: '/dashboard',    icon: LayoutDashboard, label: 'Dashboard' },
    { href: '/transactions', icon: ArrowLeftRight,  label: 'Transactions' },
    { href: '/budgets',      icon: Target,          label: 'Budgets' },
    { href: '/analytics',    icon: PieChart,        label: 'Analytics' },
    { href: '/goals',        icon: Flag,            label: 'Goals' },
    { href: '/accounts',     icon: CreditCard,      label: 'Accounts' },
    { href: '/profile',      icon: Settings,        label: 'Settings' },
];

// Everything else — tucked behind "More", grouped for scannability
const moreGroups = [
    {
        label: 'Understand',
        items: [
            { href: '/net-worth', icon: LineChart, label: 'Net Worth' },
            { href: '/cash-flow', icon: Waves,     label: 'Cash Flow' },
        ],
    },
    {
        label: 'Grow',
        items: [
            { href: '/investments',       icon: Briefcase, label: 'Investments' },
            { href: '/debt-intelligence', icon: Gauge,     label: 'Debt' },
        ],
    },
    {
        label: 'Plan',
        items: [
            { href: '/planning',     icon: Compass,   label: 'Financial Plan' },
            { href: '/savings-plan', icon: PiggyBank, label: 'Savings Plan' },
        ],
    },
    {
        label: 'Tools',
        items: [
            { href: '/ai-advisor', icon: Bot,        label: 'AI Chat' },
            { href: '/groups',     icon: Users,      label: 'Groups' },
            { href: '/personal-loans', icon: Handshake, label: 'Personal Loans' },
        ],
    },
];

const moreItems = moreGroups.flatMap(g => g.items);

export function Sidebar() {
    const pathname = usePathname();
    const router = useRouter();
    const navigate = useTransitionNavigate();
    const { user, logout } = useAuthStore();
    const { loadTheme, sidebarCollapsed, toggleSidebarCollapsed, loadSidebarCollapsed } = useThemeStore();

    const [moreOpen, setMoreOpen] = useState(false);
    const [collapseTogglePressed, setCollapseTogglePressed] = useState(false);

    useEffect(() => { loadTheme(); loadSidebarCollapsed(); }, []);

    // Auto-expand "More" if the active page lives in one of its groups
    useEffect(() => {
        if (moreItems.some(({ href }) => pathname === href || pathname.startsWith(href + '/'))) {
            setMoreOpen(true);
        }
    }, [pathname]);

    const handleLogout = () => { logout(); router.push('/login'); };

    const renderLink = ({ href, icon: Icon, label }: { href: string; icon: typeof LayoutDashboard; label: string }) => {
        const isActive = pathname === href || pathname.startsWith(href + '/');
        return (
            <Link key={href} href={href} style={{ textDecoration: 'none' }} title={sidebarCollapsed ? label : undefined}
                onClick={e => {
                    // Plain left-clicks crossfade (lib/viewTransition.ts); new-tab
                    // and modified clicks keep the browser's default.
                    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                    e.preventDefault();
                    navigate(href);
                }}>
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
                        gap: sidebarCollapsed ? 0 : 'var(--space-3)',
                        padding: sidebarCollapsed ? '11px 0' : '11px var(--space-3)',
                        borderRadius: 'var(--radius-md)',
                        ...(isActive ? type.bodyStrong : type.body),
                        background: isActive ? 'var(--glass-fill-3)' : 'transparent',
                        transition: 'background var(--transition-fast), color var(--transition-fast)',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                    }}
                    onMouseEnter={e => {
                        if (!isActive) {
                            (e.currentTarget as HTMLElement).style.background = 'var(--glass-fill-2)';
                            (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)';
                        }
                    }}
                    onMouseLeave={e => {
                        if (!isActive) {
                            (e.currentTarget as HTMLElement).style.background = 'transparent';
                            (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)';
                        }
                    }}
                >
                    <Icon size={17} color="currentColor" style={{ flexShrink: 0 }} />
                    {!sidebarCollapsed && label}
                </div>
            </Link>
        );
    };

    const initials = user?.full_name
        ? user.full_name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
        : '?';

    return (
        // `.glass-nav-desktop` sits between the mobile pill's dense fill and a
        // plain `.glass-surface` card — landed on via a mockup comparison
        // (2026-09-16) after the fully-dense fill read as flat, not glass, in
        // practice. Border is set to a right edge only, so it overrides the
        // class's all-round border.
        // Hidden on phones by CSS (.desktop-only), so the static HTML is right
        // for both sizes before the app loads.
        <aside className="glass-surface glass-nav glass-nav-desktop desktop-only" style={{
            width: sidebarCollapsed ? '76px' : '240px',
            flexShrink: 0,
            height: 'calc(100vh - var(--sa-top))',
            border: 'none',
            borderRight: '1px solid var(--glass-border)',
            display: 'flex',
            flexDirection: 'column',
            padding: 'var(--space-6) var(--space-4)',
            position: 'fixed',
            top: 'var(--sa-top)',
            left: 0,
            zIndex: 50,
            transition: 'width 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
            overflow: 'visible',
        }}>
            {/* Collapse/expand toggle — floats on the sidebar's right border so
                it never competes with the header's own icons at either width. */}
            <button
                type="button"
                onClick={toggleSidebarCollapsed}
                title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                style={{
                    position: 'absolute',
                    top: '28px',
                    right: '-12px',
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    background: 'var(--bg-surface-2)',
                    border: '1px solid var(--border-visible)',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: 'var(--shadow-card)',
                    transform: collapseTogglePressed ? 'scale(0.93)' : 'scale(1)',
                    transition: 'background var(--transition-fast), color var(--transition-fast), transform 180ms cubic-bezier(0.34,1.56,0.64,1)',
                    zIndex: 51,
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-surface-3)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-surface-2)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)'; setCollapseTogglePressed(false); }}
                onMouseDown={() => setCollapseTogglePressed(true)}
                onMouseUp={() => setCollapseTogglePressed(false)}
            >
                {sidebarCollapsed ? <PanelLeftOpen size={13} /> : <PanelLeftClose size={13} />}
            </button>

            {/* Wordmark */}
            <div style={{
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
                padding: '0 var(--space-2)',
                marginBottom: 'var(--space-8)',
            }}>
                <span style={type.heading}>
                    Fin
                    {!sidebarCollapsed && <span style={{ fontWeight: 500, color: 'var(--accent-text)' }}>Track</span>}
                </span>
            </div>

            {!sidebarCollapsed && <GlobalSearch />}

            {/* Nav — scrollable */}
            <nav style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', flex: 1, minHeight: 0, marginTop: 'var(--space-5)', overflowY: 'auto', overflowX: 'hidden', overscrollBehavior: 'contain' }}>
                {coreItems.map(renderLink)}

                {/* More toggle */}
                <button
                    type="button"
                    onClick={() => setMoreOpen(v => !v)}
                    title={sidebarCollapsed ? 'More' : undefined}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: sidebarCollapsed ? 'center' : 'space-between',
                        gap: 'var(--space-3)',
                        padding: sidebarCollapsed ? '11px 0' : '11px var(--space-3)',
                        marginTop: 'var(--space-2)',
                        borderRadius: 'var(--radius-md)',
                        background: 'transparent',
                        border: 'none',
                        ...type.body,
                        cursor: 'pointer',
                        transition: 'color var(--transition-fast)',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)'; }}
                >
                    <span style={{ display: 'flex', alignItems: 'center', gap: sidebarCollapsed ? 0 : 'var(--space-3)' }}>
                        <MoreHorizontal size={17} color="currentColor" />
                        {!sidebarCollapsed && 'More'}
                    </span>
                    {!sidebarCollapsed && (
                        <ChevronUp size={15} color="currentColor" style={{ transform: moreOpen ? 'rotate(0deg)' : 'rotate(180deg)', transition: 'transform var(--transition-fast)' }} />
                    )}
                </button>

                {moreOpen && moreGroups.map(group => (
                    <div key={group.label} style={{ marginTop: 'var(--space-4)' }}>
                        {!sidebarCollapsed && (
                            <p style={{
                                ...type.meta,
                                color: 'var(--text-muted)',
                                margin: '0 0 var(--space-2) var(--space-3)',
                            }}>
                                {group.label}
                            </p>
                        )}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                            {group.items.map(renderLink)}
                        </div>
                    </div>
                ))}
            </nav>

            {/* Bottom section — fixed, never scrolls */}
            <div style={{ flexShrink: 0 }}>
                <div style={{
                    height: '1px',
                    background: 'var(--glass-border)',
                    margin: 'var(--space-5) 0',
                }} />

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: sidebarCollapsed ? 'center' : 'flex-start', gap: 'var(--space-3)', padding: 'var(--space-3) var(--space-2)' }} title={sidebarCollapsed ? (user?.full_name || user?.email) : undefined}>
                    <div style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '50%',
                        flexShrink: 0,
                        background: 'var(--accent)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        ...type.meta,
                        fontWeight: 500,
                        color: '#fff',
                    }}>
                        {initials}
                    </div>
                    {!sidebarCollapsed && (
                        <div style={{ minWidth: 0 }}>
                            <p style={{ ...type.bodyStrong, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {user?.full_name}
                            </p>
                            <p style={{ ...type.meta, color: 'var(--text-muted)', margin: '1px 0 0 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {user?.email}
                            </p>
                        </div>
                    )}
                </div>

                {!sidebarCollapsed && <InstallPWA />}

                <button
                    type="button"
                    onClick={handleLogout}
                    title={sidebarCollapsed ? 'Log out' : undefined}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
                        gap: sidebarCollapsed ? 0 : 'var(--space-3)',
                        padding: sidebarCollapsed ? '11px 0' : '11px var(--space-3)',
                        width: '100%',
                        borderRadius: 'var(--radius-md)',
                        background: 'transparent',
                        border: '1px solid transparent',
                        ...type.body,
                        cursor: 'pointer',
                        transition: 'background var(--transition-fast), color var(--transition-fast)',
                    }}
                    onMouseEnter={e => {
                        const el = e.currentTarget as HTMLElement;
                        el.style.background = 'var(--glass-fill-2)';
                        el.style.color = 'var(--text-primary)';
                    }}
                    onMouseLeave={e => {
                        const el = e.currentTarget as HTMLElement;
                        el.style.background = 'transparent';
                        el.style.color = 'var(--text-secondary)';
                    }}
                >
                    <LogOut size={17} />
                    {!sidebarCollapsed && 'Log out'}
                </button>
            </div>
        </aside>
    );
}
