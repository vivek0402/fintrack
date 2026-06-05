'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter, usePathname } from 'next/navigation';
import { Plus, Sparkles } from 'lucide-react';

const HIDDEN_ROUTES = ['/login', '/register', '/onboarding', '/ai-chat', '/profile'];

export function FAB() {
    const router = useRouter();
    const pathname = usePathname();
    const [mounted, setMounted] = useState(false);
    const [isMobile, setIsMobile] = useState(false);
    const [open, setOpen] = useState(false);
    const popupRef = useRef<HTMLDivElement>(null);

    // Mount + immediate accurate mobile detection in one effect
    useEffect(() => {
        setMounted(true);
        const check = () => setIsMobile(window.innerWidth < 768);
        check();
        const mq = window.matchMedia('(max-width: 767px)');
        const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
        mq.addEventListener('change', handler);
        return () => mq.removeEventListener('change', handler);
    }, []);

    // Close desktop popup on outside click
    useEffect(() => {
        if (!open) return;
        const handler = (e: MouseEvent) => {
            if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    if (!mounted) return null;
    if (HIDDEN_ROUTES.some(r => pathname === r || pathname.startsWith(r + '/'))) return null;

    // ── Mobile: dual FAB above BottomNav ──────────────────────────────────────
    if (isMobile) {
        return createPortal(
            <div style={{
                position: 'fixed',
                bottom: 'calc(80px + env(safe-area-inset-bottom, 0px))',
                right: '20px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-end',
                gap: '8px',
                zIndex: 100,
            }}>
                {/* Ask AI */}
                <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span style={{
                        background: 'var(--bg-card)', border: '0.5px solid var(--bg-border)',
                        borderRadius: '20px', padding: '4px 10px', fontSize: '11px',
                        color: 'var(--text-secondary)', marginRight: '8px', whiteSpace: 'nowrap',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                    }}>Ask AI</span>
                    <button
                        onClick={() => router.push('/ai-chat')}
                        style={{
                            width: '48px', height: '48px', borderRadius: '50%',
                            background: 'var(--bg-card)', border: '1px solid var(--bg-border)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.25)', flexShrink: 0,
                        }}
                    >
                        <Sparkles size={20} color="var(--accent-blue)" />
                    </button>
                </div>

                {/* Add Transaction */}
                <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span style={{
                        background: 'var(--bg-card)', border: '0.5px solid var(--bg-border)',
                        borderRadius: '20px', padding: '4px 10px', fontSize: '11px',
                        color: 'var(--text-secondary)', marginRight: '8px', whiteSpace: 'nowrap',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                    }}>Add</span>
                    <button
                        onClick={() => router.push('/transactions?add=true')}
                        style={{
                            width: '56px', height: '56px', borderRadius: '50%',
                            background: 'var(--accent-blue)', border: 'none',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer', boxShadow: '0 4px 16px rgba(99,102,241,0.4)', flexShrink: 0,
                        }}
                    >
                        <Plus size={24} color="white" />
                    </button>
                </div>
            </div>,
            document.body
        );
    }

    // ── Desktop: single FAB + popup ───────────────────────────────────────────
    return createPortal(
        <div
            ref={popupRef}
            style={{
                position: 'fixed',
                bottom: '32px',
                right: '32px',
                zIndex: 100,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-end',
                gap: '8px',
            }}
        >
            {/* Popup menu */}
            <div style={{
                position: 'absolute',
                bottom: '64px',
                right: 0,
                background: 'var(--bg-card)',
                border: '1px solid var(--bg-border)',
                borderRadius: '12px',
                padding: '8px',
                minWidth: '180px',
                boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
                opacity: open ? 1 : 0,
                pointerEvents: open ? 'auto' : 'none',
                transform: open ? 'translateY(0) scale(1)' : 'translateY(6px) scale(0.97)',
                transition: 'opacity 150ms ease, transform 150ms ease',
            }}>
                {[
                    { label: '➕ Add Transaction', route: '/transactions?add=true' },
                    { label: '✨ Ask AI', route: '/ai-chat' },
                ].map(item => (
                    <button
                        key={item.route}
                        onClick={() => { setOpen(false); router.push(item.route); }}
                        style={{
                            width: '100%', display: 'flex', alignItems: 'center', gap: '8px',
                            padding: '10px 12px', border: 'none', borderRadius: '8px', cursor: 'pointer',
                            background: 'transparent', color: 'var(--text-primary)',
                            fontSize: '0.875rem', fontFamily: "'Satoshi', 'DM Sans', sans-serif", textAlign: 'left',
                            transition: 'background 0.1s',
                        }}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
                    >
                        {item.label}
                    </button>
                ))}
            </div>

            {/* Main FAB button */}
            <button
                onClick={() => setOpen(prev => !prev)}
                style={{
                    width: '56px', height: '56px', borderRadius: '50%',
                    background: 'var(--accent-blue)', border: 'none',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer', boxShadow: '0 4px 16px rgba(99,102,241,0.4)',
                    transition: 'transform 200ms ease',
                    transform: open ? 'rotate(45deg)' : 'rotate(0deg)',
                }}
            >
                <Plus size={24} color="white" />
            </button>
        </div>,
        document.body
    );
}
