'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
    LayoutDashboard, ArrowLeftRight, PieChart, MoreHorizontal,
    Target, Trophy, X, Settings, CalendarDays, LineChart,
    Briefcase, RefreshCw, SplitSquareHorizontal, Landmark, Bot, Gauge,
    Receipt, Waves, Lightbulb, FileText, Award, HeartPulse,
    Gem, Flame, GitBranch, Percent, Calculator, Wallet, PiggyBank,
    TrendingUp, Milestone, Sparkles, CreditCard, FolderOpen, Users,
} from 'lucide-react';

const mainTabs = [
    { href: '/dashboard',    icon: LayoutDashboard, label: 'Home' },
    { href: '/transactions', icon: ArrowLeftRight,  label: 'Money' },
    { href: '/analytics',    icon: PieChart,        label: 'Insights' },
];

// Grouped 2-column grids shown in the More sheet
const moreGroups = [
    {
        label: 'Track',
        items: [
            { href: '/budgets',           icon: Target,                label: 'Budgets' },
            { href: '/recurring',         icon: RefreshCw,             label: 'Recurring' },
            { href: '/splits',            icon: SplitSquareHorizontal, label: 'Splits' },
            { href: '/one-time-expenses', icon: Receipt,               label: 'One-Time Expenses' },
        ],
    },
    {
        label: 'Understand',
        items: [
            { href: '/calendar',     icon: CalendarDays, label: 'Calendar' },
            { href: '/net-worth',    icon: LineChart,    label: 'Net Worth' },
            { href: '/cash-flow',    icon: Waves,        label: 'Cash Flow' },
            { href: '/insights',     icon: Lightbulb,    label: 'Insights' },
            { href: '/reports',      icon: FileText,     label: 'Reports' },
            { href: '/year-review',  icon: Award,        label: 'Year Review' },
            { href: '/health-score', icon: HeartPulse,   label: 'Health Score' },
        ],
    },
    {
        label: 'Grow',
        items: [
            { href: '/goals',               icon: Trophy,    label: 'Goals' },
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
            { href: '/accounts',    icon: CreditCard,    label: 'Accounts' },
            { href: '/documents',   icon: FolderOpen,    label: 'Documents' },
            { href: '/groups',      icon: Users,         label: 'Groups' },
            { href: '/profile',     icon: Settings,      label: 'Profile' },
        ],
    },
];

const moreItems = moreGroups.flatMap(g => g.items);

export function BottomNav() {
    const pathname  = usePathname();
    const router    = useRouter();

    const [moreOpen, setMoreOpen] = useState(false);
    const [rendered, setRendered] = useState(false);
    const [visible,  setVisible]  = useState(false);

    const sheetRef      = useRef<HTMLDivElement>(null);
    const backdropRef   = useRef<HTMLDivElement>(null);
    const handleRef     = useRef<HTMLDivElement>(null);
    const moreButtonRef = useRef<HTMLButtonElement>(null);
    // Prevents the synthesised click event from toggling after a swipe-up gesture
    const swipeOpenedRef = useRef(false);

    const isActive   = (href: string) => pathname === href || pathname.startsWith(href);
    const moreActive = !mainTabs.some(t => isActive(t.href));

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

    useEffect(() => {
        document.body.style.overflow = moreOpen ? 'hidden' : '';
        return () => { document.body.style.overflow = ''; };
    }, [moreOpen]);

    // Drag-down-to-close — attaches when the sheet is rendered
    useEffect(() => {
        const sheet = sheetRef.current;
        if (!sheet || !moreOpen) return;

        let startY = 0;
        let lastY  = 0;
        let lastT  = 0;
        let vel    = 0; // px/ms positive = downward

        const onStart = (e: TouchEvent) => {
            startY = e.touches[0].clientY;
            lastY  = startY;
            lastT  = Date.now();
            vel    = 0;
            if (handleRef.current) handleRef.current.style.transition = 'none';
        };

        const onMove = (e: TouchEvent) => {
            const y  = e.touches[0].clientY;
            const dy = y - startY;
            const dt = Math.max(Date.now() - lastT, 1);
            vel   = (y - lastY) / dt;
            lastY = y;
            lastT = Date.now();

            // Only intercept downward drag from top of scroll
            if (dy > 0 && sheet.scrollTop === 0) {
                e.preventDefault();
                // Rubber-band resistance: sheet moves ~78% of finger travel
                const resistedDy = dy * 0.78;
                sheet.style.transition = 'none';
                sheet.style.transform  = `translateY(${resistedDy}px)`;

                // Fade backdrop proportionally to drag distance
                if (backdropRef.current) {
                    backdropRef.current.style.transition = 'none';
                    backdropRef.current.style.opacity = String(Math.max(0, 1 - resistedDy / 280));
                }

                // Expand handle pill as a drag affordance
                if (handleRef.current) {
                    const scale = Math.min(1.6, 1 + resistedDy / 90);
                    handleRef.current.style.transform = `scaleX(${scale})`;
                    handleRef.current.style.opacity   = String(Math.max(0.35, 1 - resistedDy / 180));
                }
            }
        };

        const onEnd = () => {
            const dy = lastY - startY;

            // Spring-reset the handle
            if (handleRef.current) {
                handleRef.current.style.transition = 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.25s ease';
                handleRef.current.style.transform  = '';
                handleRef.current.style.opacity    = '';
                setTimeout(() => { if (handleRef.current) handleRef.current.style.transition = ''; }, 400);
            }

            if (dy > 100 || vel > 0.5) {
                // Animate out then unmount
                if (backdropRef.current) {
                    backdropRef.current.style.transition = 'opacity 0.25s ease-in';
                    backdropRef.current.style.opacity    = '0';
                }
                sheet.style.transition = 'transform 0.28s ease-in';
                sheet.style.transform  = 'translateY(100%)';
                setTimeout(() => setMoreOpen(false), 280);
            } else {
                // Spring snap-back
                sheet.style.transition = 'transform 0.45s cubic-bezier(0.34, 1.56, 0.64, 1)';
                sheet.style.transform  = '';
                if (backdropRef.current) {
                    backdropRef.current.style.transition = 'opacity 0.3s ease';
                    backdropRef.current.style.opacity    = '1';
                }
                setTimeout(() => {
                    sheet.style.transition = '';
                    if (backdropRef.current) backdropRef.current.style.transition = '';
                }, 450);
            }
        };

        sheet.addEventListener('touchstart', onStart, { passive: true });
        sheet.addEventListener('touchmove',  onMove,  { passive: false });
        sheet.addEventListener('touchend',   onEnd,   { passive: true });

        return () => {
            sheet.removeEventListener('touchstart', onStart);
            sheet.removeEventListener('touchmove',  onMove);
            sheet.removeEventListener('touchend',   onEnd);
        };
    }, [moreOpen]);

    // Swipe-up on the More button to open the sheet
    useEffect(() => {
        const btn = moreButtonRef.current;
        if (!btn) return;

        let startY = 0;

        const onStart = (e: TouchEvent) => { startY = e.touches[0].clientY; };
        const onEnd   = (e: TouchEvent) => {
            const dy = e.changedTouches[0].clientY - startY;
            if (dy < -20) {
                swipeOpenedRef.current = true;
                setMoreOpen(true);
            }
        };

        btn.addEventListener('touchstart', onStart, { passive: true });
        btn.addEventListener('touchend',   onEnd,   { passive: true });
        return () => {
            btn.removeEventListener('touchstart', onStart);
            btn.removeEventListener('touchend',   onEnd);
        };
    }, []);

    const handleMoreButtonClick = () => {
        if (swipeOpenedRef.current) { swipeOpenedRef.current = false; return; }
        setMoreOpen(v => !v);
    };

    const handleNavigate = (href: string) => {
        setMoreOpen(false);
        router.push(href);
    };

    return (
        <>
            {/* Backdrop */}
            {rendered && (
                <div
                    ref={backdropRef}
                    onClick={() => setMoreOpen(false)}
                    style={{ position: 'fixed', inset: 0, zIndex: 998, backgroundColor: 'rgba(0,0,0,0.7)', opacity: moreOpen ? 1 : 0, transition: 'opacity 0.2s ease', pointerEvents: moreOpen ? 'all' : 'none' }}
                />
            )}

            {/* More sheet */}
            {rendered && (
                <div ref={sheetRef} style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 999, backgroundColor: 'var(--bg-surface-1)', borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0', borderTop: '1px solid var(--border-subtle)', paddingBottom: 'calc(16px + env(safe-area-inset-bottom))', maxHeight: '82vh', overflowY: 'auto', transform: moreOpen ? 'translateY(0)' : 'translateY(100%)', opacity: moreOpen ? 1 : 0, transition: 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.2s ease' }}>

                    {/* Handle */}
                    <div ref={handleRef} style={{ width: '40px', height: '4px', borderRadius: '2px', backgroundColor: 'var(--border-visible)', margin: '12px auto 8px', transformOrigin: 'center' }} />

                    {/* Header */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 20px 12px' }}>
                        <span style={{ fontSize: 'var(--text-h2)', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>More</span>
                        <button type="button" onClick={() => setMoreOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <X size={20} />
                        </button>
                    </div>

                    {/* Grouped 2-column grids */}
                    {moreGroups.map(group => (
                        <div key={group.label} style={{ padding: '0 20px 20px' }}>
                            <p style={{
                                fontSize: 'var(--text-label)',
                                fontWeight: 700,
                                color: 'var(--text-muted)',
                                textTransform: 'uppercase',
                                letterSpacing: '0.08em',
                                margin: '0 0 var(--space-2)',
                                fontFamily: 'var(--font-body)',
                            }}>
                                {group.label}
                            </p>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                                {group.items.map(({ href, icon: Icon, label }) => {
                                    const active = isActive(href);
                                    return (
                                        <button key={href} type="button" onClick={() => handleNavigate(href)}
                                            style={{
                                                display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 'var(--space-2)',
                                                padding: 'var(--space-4)', borderRadius: 'var(--radius-md)',
                                                background: active ? 'var(--accent-subtle)' : 'var(--bg-surface-2)',
                                                border: `1px solid ${active ? 'var(--accent-border)' : 'var(--border-subtle)'}`,
                                                cursor: 'pointer', textAlign: 'left',
                                            }}>
                                            <Icon size={20} color={active ? 'var(--accent)' : 'var(--text-secondary)'} />
                                            <span style={{ fontSize: 'var(--text-body)', fontWeight: active ? 600 : 500, color: active ? 'var(--accent)' : 'var(--text-primary)', fontFamily: 'var(--font-body)' }}>
                                                {label}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Bottom nav bar */}
            <nav style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'var(--bg-surface-1)', borderTop: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-around', paddingTop: '6px', paddingBottom: 'calc(10px + env(safe-area-inset-bottom, 0px))', zIndex: 997 }}>
                {mainTabs.map(({ href, icon: Icon, label }) => {
                    const active = isActive(href);
                    return (
                        <a key={href} href={href} onClick={e => { e.preventDefault(); router.push(href); }}
                            style={{ textDecoration: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', padding: '2px 16px', flex: 1 }}>
                            <div key={active ? 'active' : 'inactive'} style={{ padding: '5px 14px', borderRadius: 'var(--radius-full)', background: active ? 'var(--accent)' : 'transparent', transition: 'background 200ms ease', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: active ? 'popIn 380ms cubic-bezier(0.34,1.56,0.64,1) both' : undefined }}>
                                <Icon size={22} color={active ? '#fff' : 'var(--text-muted)'} />
                            </div>
                            <span style={{ fontSize: 'var(--text-caption)', color: active ? 'var(--accent)' : 'var(--text-muted)', fontWeight: active ? 600 : 400, transition: 'color 200ms ease', fontFamily: 'var(--font-body)' }}>
                                {label}
                            </span>
                        </a>
                    );
                })}

                {/* More button */}
                <button ref={moreButtonRef} type="button" onClick={handleMoreButtonClick}
                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', padding: '2px 16px', flex: 1, border: 'none', background: 'transparent', cursor: 'pointer' }}>
                    <div key={moreOpen ? 'open' : 'closed'} style={{ padding: '5px 14px', borderRadius: 'var(--radius-full)', background: moreActive || moreOpen ? 'var(--accent)' : 'transparent', transition: 'background 200ms ease', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: moreOpen ? 'popIn 380ms cubic-bezier(0.34,1.56,0.64,1) both' : undefined }}>
                        <MoreHorizontal size={22} color={moreActive || moreOpen ? '#fff' : 'var(--text-muted)'} />
                    </div>
                    <span style={{ fontSize: 'var(--text-caption)', color: moreActive || moreOpen ? 'var(--accent)' : 'var(--text-muted)', fontWeight: moreActive || moreOpen ? 600 : 400, transition: 'color 200ms ease', fontFamily: 'var(--font-body)' }}>
                        More
                    </span>
                </button>
            </nav>
        </>
    );
}
