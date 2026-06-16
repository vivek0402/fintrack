'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
    LayoutDashboard, ArrowLeftRight, PieChart, Target,
    LogOut, CalendarDays, LineChart, Flag, Briefcase, Gauge, Bot, Settings,
    Repeat, Split, Receipt, Waves, Lightbulb, FileText, Award, HeartPulse,
    Landmark, Gem, Flame, GitBranch, Percent, Calculator, Wallet, PiggyBank,
    TrendingUp, Milestone, Sparkles, CreditCard, FolderOpen, Users,
    MoreHorizontal, ChevronUp,
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useThemeStore } from '@/store/themeStore';
import { useIsMobile } from '@/hooks/useWindowSize';
import { GlobalSearch } from './GlobalSearch';
import { NotificationBell } from '@/components/ui/NotificationBell';
import { InstallPWA } from '@/components/ui/InstallPWA';

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
        label: 'Track',
        items: [
            { href: '/recurring',         icon: Repeat,  label: 'Recurring' },
            { href: '/splits',            icon: Split,   label: 'Splits' },
            { href: '/one-time-expenses', icon: Receipt, label: 'One-Time Expenses' },
        ],
    },
    {
        label: 'Understand',
        items: [
            { href: '/net-worth',   icon: LineChart,    label: 'Net Worth' },
            { href: '/calendar',    icon: CalendarDays, label: 'Calendar' },
            { href: '/cash-flow',   icon: Waves,        label: 'Cash Flow' },
            { href: '/insights',    icon: Lightbulb,    label: 'Insights' },
            { href: '/reports',     icon: FileText,     label: 'Reports' },
            { href: '/year-review', icon: Award,        label: 'Year Review' },
            { href: '/health-score', icon: HeartPulse,  label: 'Health Score' },
        ],
    },
    {
        label: 'Grow',
        items: [
            { href: '/investments',         icon: Briefcase, label: 'Investments' },
            { href: '/debt-intelligence',   icon: Gauge,     label: 'Debt' },
            { href: '/loans',               icon: Landmark,  label: 'Loans' },
            { href: '/wealth-intelligence', icon: Gem,       label: 'Wealth Intelligence' },
            { href: '/fire',                icon: Flame,     label: 'FIRE' },
            { href: '/scenarios',           icon: GitBranch, label: 'Scenarios' },
        ],
    },
    {
        label: 'Plan',
        items: [
            { href: '/tax',                 icon: Percent,    label: 'Tax' },
            { href: '/tax-estimate',        icon: Calculator, label: 'Tax Estimate' },
            { href: '/salary-intelligence', icon: Wallet,     label: 'Salary Intelligence' },
            { href: '/savings-plan',        icon: PiggyBank,  label: 'Savings Plan' },
            { href: '/forecast',            icon: TrendingUp, label: 'Forecast' },
            { href: '/milestones',          icon: Milestone,  label: 'Milestones' },
        ],
    },
    {
        label: 'Tools',
        items: [
            { href: '/ai-advisor',  icon: Bot,           label: 'AI Advisor' },
            { href: '/personality', icon: Sparkles,      label: 'Personality' },
            { href: '/documents',   icon: FolderOpen,    label: 'Documents' },
            { href: '/groups',      icon: Users,         label: 'Groups' },
        ],
    },
];

const moreItems = moreGroups.flatMap(g => g.items);

export function Sidebar() {
    const pathname = usePathname();
    const router = useRouter();
    const { user, logout } = useAuthStore();
    const { loadTheme } = useThemeStore();
    const isMobile = useIsMobile();

    const [moreOpen, setMoreOpen] = useState(false);

    useEffect(() => { loadTheme(); }, []);

    // Auto-expand "More" if the active page lives in one of its groups
    useEffect(() => {
        if (moreItems.some(({ href }) => pathname === href || pathname.startsWith(href + '/'))) {
            setMoreOpen(true);
        }
    }, [pathname]);

    if (isMobile) return null;

    const handleLogout = () => { logout(); router.push('/login'); };

    const renderLink = ({ href, icon: Icon, label }: { href: string; icon: typeof LayoutDashboard; label: string }) => {
        const isActive = pathname === href || pathname.startsWith(href + '/');
        return (
            <Link key={href} href={href} style={{ textDecoration: 'none' }}>
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--space-3)',
                        padding: '9px var(--space-3)',
                        borderRadius: 'var(--radius-md)',
                        background: isActive ? 'var(--accent-subtle)' : 'transparent',
                        color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
                        fontSize: 'var(--text-body)',
                        fontWeight: isActive ? 600 : 400,
                        transition: 'all var(--transition-fast)',
                        cursor: 'pointer',
                    }}
                    onMouseEnter={e => {
                        if (!isActive) {
                            (e.currentTarget as HTMLElement).style.background = 'var(--bg-surface-2)';
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
                    <Icon size={17} color="currentColor" />
                    {label}
                </div>
            </Link>
        );
    };

    const initials = user?.full_name
        ? user.full_name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
        : '?';

    return (
        <aside style={{
            width: '240px',
            flexShrink: 0,
            height: '100vh',
            background: 'var(--bg-surface-1)',
            borderRight: '1px solid var(--border-subtle)',
            display: 'flex',
            flexDirection: 'column',
            padding: 'var(--space-6) var(--space-4)',
            position: 'fixed',
            top: 0,
            left: 0,
            zIndex: 50,
        }}>
            {/* Wordmark + notification bell */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 var(--space-2)',
                marginBottom: 'var(--space-6)',
            }}>
                <div style={{ display: 'flex', alignItems: 'baseline' }}>
                    <span style={{
                        fontFamily: 'var(--font-display)',
                        fontWeight: 800,
                        fontSize: '20px',
                        color: 'var(--text-primary)',
                        letterSpacing: '-0.02em',
                    }}>
                        Fin
                    </span>
                    <span style={{
                        fontFamily: 'var(--font-display)',
                        fontWeight: 500,
                        fontSize: '20px',
                        color: 'var(--accent)',
                        letterSpacing: '-0.02em',
                    }}>
                        Track
                    </span>
                </div>
                <NotificationBell panelAlign="left" />
            </div>

            <GlobalSearch />

            {/* Nav — scrollable */}
            <nav style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1, marginTop: 'var(--space-4)', overflowY: 'auto', overflowX: 'hidden' }}>
                {coreItems.map(renderLink)}

                {/* More toggle */}
                <button
                    type="button"
                    onClick={() => setMoreOpen(v => !v)}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 'var(--space-3)',
                        padding: '9px var(--space-3)',
                        marginTop: 'var(--space-1)',
                        borderRadius: 'var(--radius-md)',
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text-muted)',
                        fontSize: 'var(--text-body)',
                        fontFamily: 'var(--font-body)',
                        cursor: 'pointer',
                        transition: 'all var(--transition-fast)',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; }}
                >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                        <MoreHorizontal size={17} color="currentColor" />
                        More
                    </span>
                    <ChevronUp size={15} color="currentColor" style={{ transform: moreOpen ? 'rotate(0deg)' : 'rotate(180deg)', transition: 'transform var(--transition-fast)' }} />
                </button>

                {moreOpen && moreGroups.map(group => (
                    <div key={group.label} style={{ marginTop: 'var(--space-2)' }}>
                        <p style={{
                            fontSize: 'var(--text-label)',
                            fontWeight: 700,
                            color: 'var(--text-muted)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.08em',
                            margin: '0 0 var(--space-1) var(--space-3)',
                            fontFamily: 'var(--font-body)',
                        }}>
                            {group.label}
                        </p>
                        {group.items.map(renderLink)}
                    </div>
                ))}
            </nav>

            {/* Bottom section — fixed, never scrolls */}
            <div style={{ flexShrink: 0 }}>
                <div style={{
                    height: '1px',
                    background: 'var(--border-subtle)',
                    margin: 'var(--space-3) 0',
                }} />

                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-2) var(--space-2)' }}>
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
                        fontSize: '13px',
                        fontWeight: 700,
                        color: '#fff',
                    }}>
                        {initials}
                    </div>
                    <div style={{ minWidth: 0 }}>
                        <p style={{
                            fontSize: 'var(--text-body)',
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
                            fontSize: 'var(--text-caption)',
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

                <InstallPWA />

                <button
                    type="button"
                    onClick={handleLogout}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--space-3)',
                        padding: '9px var(--space-3)',
                        width: '100%',
                        borderRadius: 'var(--radius-md)',
                        background: 'transparent',
                        border: '1px solid transparent',
                        color: 'var(--text-secondary)',
                        fontSize: 'var(--text-body)',
                        fontFamily: 'var(--font-body)',
                        cursor: 'pointer',
                        transition: 'all var(--transition-fast)',
                    }}
                    onMouseEnter={e => {
                        const el = e.currentTarget as HTMLElement;
                        el.style.background = 'var(--color-exp-subtle)';
                        el.style.color = 'var(--color-exp)';
                    }}
                    onMouseLeave={e => {
                        const el = e.currentTarget as HTMLElement;
                        el.style.background = 'transparent';
                        el.style.color = 'var(--text-secondary)';
                    }}
                >
                    <LogOut size={17} />
                    Logout
                </button>
            </div>
        </aside>
    );
}
