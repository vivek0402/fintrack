'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { LayoutDashboard, ArrowLeftRight, PieChart, MoreHorizontal, Plus } from 'lucide-react';
import { useTransitionNavigate } from '@/lib/viewTransition';
import { usePresence } from '@/hooks/usePresence';
import { useThemeStore } from '@/store/themeStore';
import { MorePanel } from './MorePanel';

const mainTabs = [
    { href: '/dashboard',    icon: LayoutDashboard, label: 'Home' },
    { href: '/transactions', icon: ArrowLeftRight,  label: 'Money' },
    { href: '/analytics',    icon: PieChart,        label: 'Insights' },
];

// Routes where the add-transaction button is suppressed — mirrors
// hideAddFabRoutes in AppLayout, which used to own this button before it
// moved into the dock beside the pill. /transactions used to be excluded
// (it had its own header add button) but now shows the same beside-pill
// button as every other page, for a uniform position across the app.
const hideAddRoutes = ['/login', '/register', '/onboarding', '/ai-advisor'];

// Matches .more-pop-exit in globals.css.
const MORE_EXIT_MS = 220;

export function BottomNav({ onOpenTour }: { onOpenTour?: () => void } = {}) {
    const pathname  = usePathname();
    const router    = useRouter();
    // Tab switches crossfade (lib/viewTransition.ts).
    const navigate  = useTransitionNavigate();
    const { moreMenuStyle, setMoreMenuStyle } = useThemeStore();

    const [moreOpen, setMoreOpen] = useState(false);
    // The card stays mounted while it plays its exit.
    const { rendered: moreRendered, closing: moreClosing } = usePresence(moreOpen, MORE_EXIT_MS);

    const popRef        = useRef<HTMLDivElement>(null);
    const handleRef     = useRef<HTMLDivElement>(null);
    const backdropRef   = useRef<HTMLDivElement>(null);
    const moreButtonRef = useRef<HTMLButtonElement>(null);
    // Prevents the synthesised click event from toggling after a swipe-up gesture
    const swipeOpenedRef = useRef(false);

    const isActive   = useCallback((href: string) => pathname === href || pathname.startsWith(href), [pathname]);
    const moreActive = !mainTabs.some(t => isActive(t.href));
    const showAdd    = !hideAddRoutes.some(r => pathname.startsWith(r));

    // The main tabs navigate via router.push, which never prefetches on its own;
    // warm their route chunks up front so tab switches don't wait on the network.
    useEffect(() => {
        mainTabs.forEach(t => router.prefetch(t.href));
    }, [router]);

    useEffect(() => {
        document.body.style.overflow = moreOpen ? 'hidden' : '';
        return () => { document.body.style.overflow = ''; };
    }, [moreOpen]);

    // Drag the grab handle down to close: the card follows the finger (with a
    // little resistance) and the dim fades with it; let go past the threshold
    // or with a flick and it closes, otherwise it springs back.
    useEffect(() => {
        const handle = handleRef.current;
        const pop    = popRef.current;
        if (!handle || !pop || !moreOpen) return;

        let startY = 0, lastY = 0, lastT = 0, vel = 0;

        const onStart = (e: TouchEvent) => {
            startY = lastY = e.touches[0].clientY;
            lastT = Date.now();
            vel = 0;
            pop.style.animation = 'none';
            pop.style.transition = 'none';
        };
        const onMove = (e: TouchEvent) => {
            const y = e.touches[0].clientY;
            const dt = Math.max(Date.now() - lastT, 1);
            vel = (y - lastY) / dt;
            lastY = y; lastT = Date.now();
            const dy = y - startY;
            if (dy <= 0) return;
            e.preventDefault();
            const resisted = dy * 0.85;
            pop.style.transform = `translateY(${resisted}px)`;
            if (backdropRef.current) {
                backdropRef.current.style.transition = 'none';
                backdropRef.current.style.opacity = String(Math.max(0, 1 - resisted / 320));
            }
        };
        const onEnd = () => {
            const dy = lastY - startY;
            if (dy > 90 || vel > 0.5) {
                // Hand off to the exit animation from where the finger left it.
                pop.style.setProperty('--more-from', `${Math.max(0, dy * 0.85)}px`);
                pop.style.transform = '';
                pop.style.transition = '';
                pop.style.animation = '';
                if (backdropRef.current) { backdropRef.current.style.transition = ''; backdropRef.current.style.opacity = ''; }
                setMoreOpen(false);
            } else {
                pop.style.transition = 'transform 380ms cubic-bezier(0.32, 0.72, 0, 1)';
                pop.style.transform = '';
                if (backdropRef.current) { backdropRef.current.style.transition = 'opacity 0.3s ease'; backdropRef.current.style.opacity = ''; }
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
    }, [moreOpen, moreRendered]);

    // Swipe-up on the More button to open the panel
    useEffect(() => {
        const btn = moreButtonRef.current;
        if (!btn) return;
        let startY = 0;
        const onStart = (e: TouchEvent) => { startY = e.touches[0].clientY; };
        const onEnd   = (e: TouchEvent) => {
            if (e.changedTouches[0].clientY - startY < -20) {
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
        setMoreOpen(o => !o);
    };

    const handleNavigate = (href: string) => {
        setMoreOpen(false);
        navigate(href);
    };

    return (
        // Shown on phones only, by CSS (.mobile-only), so the static HTML is
        // right for both sizes before the app loads.
        <div className="mobile-only">
            {/* Light dismiss-on-outside-tap layer — dim only, no blur/glass */}
            <div
                ref={backdropRef}
                onClick={() => setMoreOpen(false)}
                style={{ position: 'fixed', inset: 0, zIndex: 998, backgroundColor: 'rgba(0,0,0,0.45)', opacity: moreOpen ? 1 : 0, transition: 'opacity 0.24s ease', pointerEvents: moreOpen ? 'all' : 'none' }}
            />

            {/* Dock: floating pill + detached action button. The More card
                springs up above it as its own surface. */}
            <div style={{
                position: 'fixed', zIndex: 999,
                left: 'calc(12px + var(--sa-left))',
                right: 'calc(12px + var(--sa-right))',
                bottom: 'calc(14px + var(--sa-bottom))',
                display: 'flex', alignItems: 'flex-end', gap: '10px',
            }}>
            {moreRendered && (
                <MorePanel
                    ref={popRef}
                    handleRef={handleRef}
                    closing={moreClosing}
                    style={moreMenuStyle}
                    onStyleChange={setMoreMenuStyle}
                    isActive={isActive}
                    onNavigate={handleNavigate}
                    onClose={() => setMoreOpen(false)}
                    onOpenTour={onOpenTour ? () => { setMoreOpen(false); onOpenTour(); } : undefined}
                />
            )}

            <nav className="glass-surface glass-nav" style={{ flex: 1, minWidth: 0, borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around', paddingTop: '8px', paddingBottom: '8px' }}>
                    {mainTabs.map(({ href, icon: Icon, label }) => {
                        const active = isActive(href);
                        return (
                            <a key={href} href={href} className="press-shrink" onClick={e => { e.preventDefault(); navigate(href); }}
                                style={{ textDecoration: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', flex: 1, minWidth: 0 }}>
                                <div key={active ? 'active' : 'inactive'} style={{ width: '42px', height: '26px', borderRadius: 'var(--radius-md)', background: active ? 'rgba(255,255,255,0.15)' : 'transparent', boxShadow: active ? 'inset 0 1px 0 rgba(255,255,255,0.18)' : undefined, transition: 'background 200ms ease', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: active ? 'popIn 380ms cubic-bezier(0.34,1.56,0.64,1) both' : undefined }}>
                                    <Icon size={19} color={active ? 'var(--text-primary)' : 'var(--text-muted)'} fill={active ? 'currentColor' : 'none'} />
                                </div>
                                <span style={{ fontSize: 'var(--text-caption)', color: active ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: active ? 600 : 400, transition: 'color 200ms ease', fontFamily: 'var(--font-body)', whiteSpace: 'nowrap' }}>
                                    {label}
                                </span>
                            </a>
                        );
                    })}

                    {/* More button */}
                    <button ref={moreButtonRef} type="button" onClick={handleMoreButtonClick} aria-expanded={moreOpen} className="press-shrink"
                        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', flex: 1, minWidth: 0, border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }}>
                        <div key={moreOpen ? 'open' : 'closed'} style={{ width: '42px', height: '26px', borderRadius: 'var(--radius-md)', background: moreActive || moreOpen ? 'rgba(255,255,255,0.15)' : 'transparent', boxShadow: moreActive || moreOpen ? 'inset 0 1px 0 rgba(255,255,255,0.18)' : undefined, transition: 'background 200ms ease', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: moreOpen ? 'popIn 380ms cubic-bezier(0.34,1.56,0.64,1) both' : undefined }}>
                            <MoreHorizontal size={19} color={moreActive || moreOpen ? 'var(--text-primary)' : 'var(--text-muted)'} />
                        </div>
                        <span style={{ fontSize: 'var(--text-caption)', color: moreActive || moreOpen ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: moreActive || moreOpen ? 600 : 400, transition: 'color 200ms ease', fontFamily: 'var(--font-body)', whiteSpace: 'nowrap' }}>
                            More
                        </span>
                    </button>
                </div>
            </nav>

            {/* Add transaction — detached circle beside the pill. */}
            {showAdd && (
                <button
                    className="fab-btn"
                    type="button"
                    onClick={() => router.push('/transactions?add=true')}
                    aria-label="Add transaction"
                    style={{
                        width: '62px', height: '62px', flexShrink: 0,
                        borderRadius: 'var(--radius-full)', background: 'var(--accent)', border: 'none',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer', overflow: 'hidden', padding: 0,
                        boxShadow: '0 14px 30px -10px rgba(37,99,235,0.75), inset 0 1px 0 rgba(255,255,255,0.25)',
                    }}
                >
                    <Plus size={24} color="#fff" strokeWidth={2.5} />
                </button>
            )}
            </div>
        </div>
    );
}
