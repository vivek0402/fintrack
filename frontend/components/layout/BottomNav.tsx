'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
    LayoutDashboard, ArrowLeftRight, PieChart, MoreHorizontal,
    Target, Trophy, X, Settings, LineChart,
    Briefcase, Bot, Gauge,
    Waves,
    Flame, GitBranch, PiggyBank, Compass,
    CreditCard, FolderOpen, Users, HelpCircle,
    FileText, Award, Brain,
} from 'lucide-react';
import { Tabs, TabPanel } from '@/components/ui/Tabs';

const mainTabs = [
    { href: '/dashboard',    icon: LayoutDashboard, label: 'Home' },
    { href: '/transactions', icon: ArrowLeftRight,  label: 'Money' },
    { href: '/ai-advisor',   icon: Bot,             label: 'AI Chat' },
    { href: '/analytics',    icon: PieChart,        label: 'Insights' },
];

// Grouped 2-column grids shown in the More sheet
const moreGroups = [
    {
        label: 'Understand',
        items: [
            { href: '/budgets',   icon: Target,    label: 'Budgets' },
            { href: '/net-worth', icon: LineChart, label: 'Net Worth' },
            { href: '/cash-flow', icon: Waves,     label: 'Cash Flow' },
            { href: '/reports',     icon: FileText, label: 'Reports' },
            { href: '/year-review', icon: Award,    label: 'Year Review' },
            { href: '/personality', icon: Brain,    label: 'Personality' },
        ],
    },
    {
        label: 'Grow',
        items: [
            { href: '/goals',             icon: Trophy,    label: 'Goals' },
            { href: '/investments',       icon: Briefcase, label: 'Investments' },
            { href: '/debt-intelligence', icon: Gauge,     label: 'Debt' },
            { href: '/fire',              icon: Flame,     label: 'FIRE' },
            { href: '/scenarios',         icon: GitBranch, label: 'Scenarios' },
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
            { href: '/accounts',  icon: CreditCard, label: 'Accounts' },
            { href: '/documents', icon: FolderOpen, label: 'Documents' },
            { href: '/groups',    icon: Users,      label: 'Groups' },
            { href: '/profile',   icon: Settings,   label: 'Profile' },
        ],
    },
];

const moreItems = moreGroups.flatMap(g => g.items);

export function BottomNav({ onOpenTour }: { onOpenTour?: () => void } = {}) {
    const pathname  = usePathname();
    const router    = useRouter();

    const [moreOpen, setMoreOpen]   = useState(false);
    const [panelMaxH, setPanelMaxH] = useState(0);
    const [activeGroupKey, setActiveGroupKey] = useState(moreGroups[0].label);
    const [direction, setDirection] = useState<1 | -1 | 0>(0);

    const panelRef        = useRef<HTMLDivElement>(null);
    const panelContentRef  = useRef<HTMLDivElement>(null);
    const backdropRef     = useRef<HTMLDivElement>(null);
    const handleRef       = useRef<HTMLDivElement>(null);
    const moreButtonRef   = useRef<HTMLButtonElement>(null);
    // Prevents the synthesised click event from toggling after a swipe-up gesture
    const swipeOpenedRef = useRef(false);

    const isActive   = (href: string) => pathname === href || pathname.startsWith(href);
    const moreActive = !mainTabs.some(t => isActive(t.href));

    // Opens the panel defaulted to the group containing the current route
    const openMorePanel = useCallback(() => {
        const owningGroup = moreGroups.find(g => g.items.some(i => pathname === i.href || pathname.startsWith(i.href)));
        setActiveGroupKey(owningGroup ? owningGroup.label : moreGroups[0].label);
        setDirection(0);
        setMoreOpen(true);
    }, [pathname]);

    // Card-morph: the dock's height grows to fit the panel's content, like the source library's
    // toolbarH + contentH morph — measured rather than animated via shared values.
    useLayoutEffect(() => {
        if (moreOpen && panelContentRef.current) {
            setPanelMaxH(panelContentRef.current.scrollHeight);
        } else {
            setPanelMaxH(0);
        }
    }, [moreOpen, activeGroupKey]);

    useEffect(() => {
        document.body.style.overflow = moreOpen ? 'hidden' : '';
        return () => { document.body.style.overflow = ''; };
    }, [moreOpen]);

    const handleGroupChange = (key: string) => {
        const oldIndex = moreGroups.findIndex(g => g.label === activeGroupKey);
        const newIndex = moreGroups.findIndex(g => g.label === key);
        setDirection(Math.sign(newIndex - oldIndex) as 1 | -1 | 0);
        setActiveGroupKey(key);
    };

    // Drag-down-to-close on the handle — shrinks the dock's morphed height instead of
    // translating a sheet, so it reads as the dock collapsing back into itself.
    useEffect(() => {
        const handle = handleRef.current;
        const panel  = panelRef.current;
        if (!handle || !panel || !moreOpen) return;

        let startY = 0;
        let lastY  = 0;
        let lastT  = 0;
        let vel    = 0; // px/ms positive = downward

        const onStart = (e: TouchEvent) => {
            startY = e.touches[0].clientY;
            lastY  = startY;
            lastT  = Date.now();
            vel    = 0;
            handle.style.transition = 'none';
            panel.style.transition  = 'none';
        };

        const onMove = (e: TouchEvent) => {
            const y  = e.touches[0].clientY;
            const dy = y - startY;
            const dt = Math.max(Date.now() - lastT, 1);
            vel   = (y - lastY) / dt;
            lastY = y;
            lastT = Date.now();

            if (dy > 0) {
                e.preventDefault();
                // Rubber-band resistance: panel shrinks ~78% of finger travel
                const resistedDy = dy * 0.78;
                panel.style.maxHeight = `${Math.max(0, panelMaxH - resistedDy)}px`;

                if (backdropRef.current) {
                    backdropRef.current.style.transition = 'none';
                    backdropRef.current.style.opacity = String(Math.max(0, 1 - resistedDy / 280));
                }

                const scale = Math.min(1.6, 1 + resistedDy / 90);
                handle.style.transform = `scaleX(${scale})`;
                handle.style.opacity   = String(Math.max(0.35, 1 - resistedDy / 180));
            }
        };

        const onEnd = () => {
            const dy = lastY - startY;

            // Spring-reset the handle
            handle.style.transition = 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.25s ease';
            handle.style.transform  = '';
            handle.style.opacity    = '';
            setTimeout(() => { handle.style.transition = ''; }, 400);

            if (dy > 100 || vel > 0.5) {
                if (backdropRef.current) {
                    backdropRef.current.style.transition = 'opacity 0.25s ease-in';
                    backdropRef.current.style.opacity    = '0';
                }
                panel.style.transition = 'max-height 0.28s cubic-bezier(0.4,0,1,1)';
                panel.style.maxHeight  = '0px';
                setTimeout(() => setMoreOpen(false), 280);
            } else {
                // Spring snap-back to the morphed height
                panel.style.transition = 'max-height 0.45s cubic-bezier(0.34, 1.56, 0.64, 1)';
                panel.style.maxHeight  = `${panelMaxH}px`;
                if (backdropRef.current) {
                    backdropRef.current.style.transition = 'opacity 0.3s ease';
                    backdropRef.current.style.opacity    = '1';
                }
                setTimeout(() => {
                    panel.style.transition = '';
                    if (backdropRef.current) backdropRef.current.style.transition = '';
                }, 450);
            }
        };

        handle.addEventListener('touchstart', onStart, { passive: true });
        handle.addEventListener('touchmove',  onMove,  { passive: false });
        handle.addEventListener('touchend',   onEnd,   { passive: true });

        return () => {
            handle.removeEventListener('touchstart', onStart);
            handle.removeEventListener('touchmove',  onMove);
            handle.removeEventListener('touchend',   onEnd);
        };
    }, [moreOpen, panelMaxH]);

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
                openMorePanel();
            }
        };

        btn.addEventListener('touchstart', onStart, { passive: true });
        btn.addEventListener('touchend',   onEnd,   { passive: true });
        return () => {
            btn.removeEventListener('touchstart', onStart);
            btn.removeEventListener('touchend',   onEnd);
        };
    }, [openMorePanel]);

    const handleMoreButtonClick = () => {
        if (swipeOpenedRef.current) { swipeOpenedRef.current = false; return; }
        if (moreOpen) { setMoreOpen(false); } else { openMorePanel(); }
    };

    const handleNavigate = (href: string) => {
        setMoreOpen(false);
        router.push(href);
    };

    const activeGroupItems = moreGroups.find(g => g.label === activeGroupKey)?.items ?? [];

    return (
        <>
            {/* Light dismiss-on-outside-tap layer — dim only, no blur/glass */}
            <div
                ref={backdropRef}
                onClick={() => setMoreOpen(false)}
                style={{ position: 'fixed', inset: 0, zIndex: 998, backgroundColor: 'rgba(0,0,0,0.45)', opacity: moreOpen ? 1 : 0, transition: 'opacity 0.2s ease', pointerEvents: moreOpen ? 'all' : 'none' }}
            />

            {/* Dock: a single surface whose height morphs to reveal the More panel above the tab row */}
            <nav style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 999, background: 'var(--bg-surface-1)', borderTop: '1px solid var(--border-subtle)', borderRadius: moreOpen ? 'var(--radius-lg) var(--radius-lg) 0 0' : '0px', overflow: 'hidden', transition: 'border-radius 320ms cubic-bezier(0.4,0,0.2,1)', paddingLeft: 'env(safe-area-inset-left, 0px)', paddingRight: 'env(safe-area-inset-right, 0px)' }}>

                {/* Morphing panel */}
                <div ref={panelRef} style={{ maxHeight: panelMaxH, overflow: 'hidden', transition: 'max-height 320ms cubic-bezier(0.4,0,0.2,1)' }}>
                    <div ref={panelContentRef}>
                        {/* Drag handle */}
                        <div ref={handleRef} style={{ width: '40px', height: '4px', borderRadius: '2px', backgroundColor: 'var(--border-visible)', margin: '12px auto 8px', transformOrigin: 'center' }} />

                        {/* Header */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 20px 12px' }}>
                            <span style={{ fontSize: 'var(--text-h2)', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>More</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                                {onOpenTour && (
                                    <button type="button" onClick={() => { setMoreOpen(false); onOpenTour(); }} title="Replay the app tour" aria-label="Replay the app tour"
                                        style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <HelpCircle size={20} />
                                    </button>
                                )}
                                <button type="button" onClick={() => setMoreOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <X size={20} />
                                </button>
                            </div>
                        </div>

                        {/* Category switcher */}
                        <div style={{ padding: '0 20px 12px' }}>
                            <Tabs
                                tabs={moreGroups.map(g => ({ key: g.label, label: g.label }))}
                                active={activeGroupKey}
                                onChange={handleGroupChange}
                            />
                        </div>

                        {/* Active group's 2-column grid — directional slide/scale/fade on switch, ported from the source library's panel motion (no blur) */}
                        <div style={{ padding: '0 20px 20px', overflow: 'hidden' }}>
                            <TabPanel tabKey={activeGroupKey} direction={direction}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
                                    {activeGroupItems.map(({ href, icon: Icon, label }) => {
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
                            </TabPanel>
                        </div>
                    </div>
                </div>

                {/* Divider — fades in as the dock morphs open, fades out as it collapses */}
                <div style={{ height: '1px', background: 'var(--border-subtle)', opacity: moreOpen ? 1 : 0, transition: 'opacity 280ms ease' }} />

                {/* Tab row — always docked at the bottom of the surface */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around', paddingTop: '6px', paddingBottom: 'calc(10px + env(safe-area-inset-bottom, 0px))' }}>
                    {mainTabs.map(({ href, icon: Icon, label }) => {
                        const active = isActive(href);
                        return (
                            <a key={href} href={href} onClick={e => { e.preventDefault(); router.push(href); }}
                                style={{ textDecoration: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', padding: '2px 6px', flex: 1, minWidth: 0 }}>
                                <div key={active ? 'active' : 'inactive'} style={{ padding: '5px 14px', borderRadius: 'var(--radius-full)', background: active ? 'var(--accent)' : 'transparent', transition: 'background 200ms ease', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: active ? 'popIn 380ms cubic-bezier(0.34,1.56,0.64,1) both' : undefined }}>
                                    <Icon size={22} color={active ? '#fff' : 'var(--text-muted)'} />
                                </div>
                                <span style={{ fontSize: 'var(--text-caption)', color: active ? 'var(--accent)' : 'var(--text-muted)', fontWeight: active ? 600 : 400, transition: 'color 200ms ease', fontFamily: 'var(--font-body)', whiteSpace: 'nowrap' }}>
                                    {label}
                                </span>
                            </a>
                        );
                    })}

                    {/* More button */}
                    <button ref={moreButtonRef} type="button" onClick={handleMoreButtonClick}
                        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', padding: '2px 6px', flex: 1, minWidth: 0, border: 'none', background: 'transparent', cursor: 'pointer' }}>
                        <div key={moreOpen ? 'open' : 'closed'} style={{ padding: '5px 14px', borderRadius: 'var(--radius-full)', background: moreActive || moreOpen ? 'var(--accent)' : 'transparent', transition: 'background 200ms ease', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: moreOpen ? 'popIn 380ms cubic-bezier(0.34,1.56,0.64,1) both' : undefined }}>
                            <MoreHorizontal size={22} color={moreActive || moreOpen ? '#fff' : 'var(--text-muted)'} />
                        </div>
                        <span style={{ fontSize: 'var(--text-caption)', color: moreActive || moreOpen ? 'var(--accent)' : 'var(--text-muted)', fontWeight: moreActive || moreOpen ? 600 : 400, transition: 'color 200ms ease', fontFamily: 'var(--font-body)', whiteSpace: 'nowrap' }}>
                            More
                        </span>
                    </button>
                </div>
            </nav>
        </>
    );
}
