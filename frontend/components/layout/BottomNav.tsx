'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
    LayoutDashboard, ArrowLeftRight, PieChart, MoreHorizontal,
    Target, Trophy, X, Settings, Users, FolderOpen,
    Wallet, CalendarDays, FileText, TrendingUp, Brain, Receipt,
    Banknote, RefreshCw, ShoppingCart, SplitSquareHorizontal, Heart, Award, PiggyBank, Briefcase, LineChart, Sparkles, Landmark, Building2, Gauge,
    Flame, Calculator, CalendarRange, Lightbulb, Flag, Archive, Bot,
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';

const mainTabs = [
    { href: '/dashboard',    icon: LayoutDashboard, label: 'Home' },
    { href: '/transactions', icon: ArrowLeftRight,  label: 'Transactions' },
    { href: '/analytics',    icon: PieChart,        label: 'Analytics' },
];

// All sections shown in the More sheet
const moreSections = [
    {
        label: 'Finance',
        items: [
            { href: '/accounts',  icon: Wallet,        label: 'Accounts'  },
            { href: '/net-worth', icon: LineChart,     label: 'Net Worth' },
            { href: '/wealth-intelligence', icon: Sparkles, label: 'Wealth Intelligence' },
            { href: '/budgets',   icon: Target,        label: 'Budgets'   },
            { href: '/goals',     icon: Trophy,        label: 'Goals'     },
            { href: '/investments', icon: Briefcase,   label: 'Investments' },
            { href: '/calendar',  icon: CalendarDays,  label: 'Calendar'  },
            { href: '/reports',       icon: FileText,  label: 'Reports'       },
            { href: '/health-score',  icon: Heart,     label: 'Health Score'  },
            { href: '/year-review',   icon: Award,     label: 'Year Review'   },
            { href: '/savings-plan',  icon: PiggyBank, label: 'Savings Plan'  },
        ],
    },
    {
        label: 'AI & Insights',
        items: [
            { href: '/ai-advisor',           icon: Bot,           label: 'AI Advisor'    },
            { href: '/insights',             icon: Brain,         label: 'Insights'      },
            { href: '/forecast',             icon: TrendingUp,    label: 'Forecast'      },
            { href: '/personality',          icon: Brain,         label: 'Personality'   },
            { href: '/tax-estimate',         icon: Receipt,       label: 'Tax Estimate'  },
            { href: '/salary-intelligence',  icon: Banknote,      label: 'Salary AI'     },
        ],
    },
    {
        label: 'Groups & Splits',
        items: [
            { href: '/groups',           icon: FolderOpen,           label: 'Groups'    },
            { href: '/splits',           icon: SplitSquareHorizontal, label: 'Splits'   },
            { href: '/recurring',        icon: RefreshCw,            label: 'Recurring' },
            { href: '/one-time-expenses', icon: ShoppingCart,        label: 'One-Time'  },
        ],
    },
    {
        label: 'Debt',
        items: [
            { href: '/loans', icon: Building2, label: 'Loans' },
            { href: '/debt-intelligence', icon: Gauge, label: 'Debt Intelligence' },
        ],
    },
    {
        label: 'Planning',
        items: [
            { href: '/fire',       icon: Flame,        label: 'FIRE Calculator' },
            { href: '/fire',       icon: Calculator,   label: 'SIP Optimizer' },
            { href: '/cash-flow',  icon: CalendarRange, label: 'Cash Flow' },
            { href: '/scenarios',  icon: Lightbulb,    label: 'Scenarios' },
            { href: '/milestones', icon: Flag,         label: 'Milestones' },
        ],
    },
    {
        label: 'Tax & Documents',
        items: [
            { href: '/tax',       icon: Landmark, label: 'Tax'       },
            { href: '/documents', icon: Archive,  label: 'Documents' },
        ],
    },
];

const allMoreHrefs = moreSections.flatMap(s => s.items.map(i => i.href));

export function BottomNav() {
    const pathname  = usePathname();
    const router    = useRouter();
    const { logout } = useAuthStore();

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
                    style={{ position: 'fixed', inset: 0, zIndex: 998, backgroundColor: 'rgba(0,0,0,0.35)', opacity: moreOpen ? 1 : 0, transition: 'opacity 0.2s ease', pointerEvents: moreOpen ? 'all' : 'none' }}
                />
            )}

            {/* More sheet */}
            {rendered && (
                <div ref={sheetRef} style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 999, backgroundColor: 'var(--bg-card)', borderRadius: '20px 20px 0 0', borderTop: '1px solid var(--border)', paddingBottom: 'calc(16px + env(safe-area-inset-bottom))', maxHeight: '82vh', overflowY: 'auto', transform: moreOpen ? 'translateY(0)' : 'translateY(100%)', opacity: moreOpen ? 1 : 0, transition: 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.2s ease' }}>

                    {/* Handle */}
                    <div ref={handleRef} style={{ width: '40px', height: '4px', borderRadius: '2px', backgroundColor: 'var(--text-muted)', margin: '12px auto 8px', transformOrigin: 'center' }} />

                    {/* Header */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 20px 12px' }}>
                        <span style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>More</span>
                        <button type="button" onClick={() => setMoreOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <X size={20} />
                        </button>
                    </div>

                    {/* Sections */}
                    {moreSections.map((section, sIdx) => (
                        <div key={section.label}>
                            {/* Section label */}
                            <p style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '8px 20px 4px', margin: 0, fontFamily: 'var(--font-body)' }}>
                                {section.label}
                            </p>

                            {/* Items */}
                            {section.items.map(({ href, icon: Icon, label }) => {
                                const active = isActive(href);
                                return (
                                    <button key={`${section.label}-${label}`} type="button" onClick={() => handleNavigate(href)}
                                        style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '12px 20px', width: '100%', border: 'none', background: active ? 'var(--accent-light)' : 'transparent', cursor: 'pointer', transition: 'background 0.12s' }}
                                        onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
                                        onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
                                        {/* Icon container */}
                                        <div style={{ width: '38px', height: '38px', borderRadius: '10px', backgroundColor: active ? 'var(--accent)' : 'var(--bg-alt)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                            <Icon size={18} color={active ? 'white' : 'var(--text-secondary)'} />
                                        </div>
                                        {/* Label */}
                                        <span style={{ fontSize: '15px', fontWeight: active ? 600 : 500, color: active ? 'var(--accent)' : 'var(--text-primary)', fontFamily: 'var(--font-body)' }}>
                                            {label}
                                        </span>
                                    </button>
                                );
                            })}

                            {/* Divider between sections */}
                            {sIdx < moreSections.length - 1 && (
                                <div style={{ height: '1px', background: 'var(--border)', margin: '8px 20px 4px' }} />
                            )}
                        </div>
                    ))}

                    {/* Settings row (standalone at bottom) */}
                    <div style={{ height: '1px', background: 'var(--border)', margin: '8px 20px 4px' }} />
                    <button type="button" onClick={() => handleNavigate('/profile')}
                        style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '12px 20px', width: '100%', border: 'none', background: isActive('/profile') ? 'var(--accent-light)' : 'transparent', cursor: 'pointer', transition: 'background 0.12s' }}
                        onMouseEnter={e => { if (!isActive('/profile')) (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
                        onMouseLeave={e => { if (!isActive('/profile')) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
                        <div style={{ width: '38px', height: '38px', borderRadius: '10px', backgroundColor: isActive('/profile') ? 'var(--accent)' : 'var(--bg-alt)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <Settings size={18} color={isActive('/profile') ? 'white' : 'var(--text-secondary)'} />
                        </div>
                        <span style={{ fontSize: '15px', fontWeight: isActive('/profile') ? 600 : 500, color: isActive('/profile') ? 'var(--accent)' : 'var(--text-primary)', fontFamily: 'var(--font-body)' }}>
                            Settings
                        </span>
                    </button>
                </div>
            )}

            {/* Bottom nav bar */}
            <nav style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'var(--bg-card)', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-around', paddingTop: '6px', paddingBottom: 'calc(10px + env(safe-area-inset-bottom, 0px))', zIndex: 997, boxShadow: '0 -4px 20px rgba(0,0,0,0.08)' }}>
                {mainTabs.map(({ href, icon: Icon, label }) => {
                    const active = isActive(href);
                    return (
                        <a key={href} href={href} onClick={e => { e.preventDefault(); router.push(href); }}
                            style={{ textDecoration: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', padding: '2px 16px' }}>
                            <div key={active ? 'active' : 'inactive'} style={{ padding: '5px 14px', borderRadius: '20px', background: active ? 'var(--accent)' : 'transparent', transition: 'background 200ms ease', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: active ? 'popIn 380ms cubic-bezier(0.34,1.56,0.64,1) both' : undefined }}>
                                <Icon size={22} color={active ? 'white' : 'var(--text-muted)'} />
                            </div>
                            <span style={{ fontSize: '11px', color: active ? 'var(--accent)' : 'var(--text-muted)', fontWeight: active ? 600 : 400, transition: 'color 200ms ease', fontFamily: 'var(--font-body)' }}>
                                {label}
                            </span>
                        </a>
                    );
                })}

                {/* More button */}
                <button ref={moreButtonRef} type="button" onClick={handleMoreButtonClick}
                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', padding: '2px 16px', border: 'none', background: 'transparent', cursor: 'pointer' }}>
                    <div key={moreOpen ? 'open' : 'closed'} style={{ padding: '5px 14px', borderRadius: '20px', background: moreActive || moreOpen ? 'var(--accent)' : 'transparent', transition: 'background 200ms ease', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: moreOpen ? 'popIn 380ms cubic-bezier(0.34,1.56,0.64,1) both' : undefined }}>
                        <MoreHorizontal size={22} color={moreActive || moreOpen ? 'white' : 'var(--text-muted)'} />
                    </div>
                    <span style={{ fontSize: '11px', color: moreActive || moreOpen ? 'var(--accent)' : 'var(--text-muted)', fontWeight: moreActive || moreOpen ? 600 : 400, transition: 'color 200ms ease', fontFamily: 'var(--font-body)' }}>
                        More
                    </span>
                </button>
            </nav>
        </>
    );
}
