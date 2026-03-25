'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter, usePathname } from 'next/navigation';
import { Plus, Sparkles } from 'lucide-react';

const HIDDEN_ROUTES = ['/login', '/register', '/onboarding', '/ai-chat'];

function useIsMobile() {
    const [isMobile, setIsMobile] = useState(false);
    useEffect(() => {
        const mq = window.matchMedia('(max-width: 768px)');
        setIsMobile(mq.matches);
        const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
        mq.addEventListener('change', handler);
        return () => mq.removeEventListener('change', handler);
    }, []);
    return isMobile;
}

export function FAB() {
    const router = useRouter();
    const pathname = usePathname();
    const isMobile = useIsMobile();
    const [mounted, setMounted] = useState(false);
    const [open, setOpen] = useState(false);
    const popupRef = useRef<HTMLDivElement>(null);

    useEffect(() => { setMounted(true); }, []);

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

    if (isMobile) {
        const mobileFab = (
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
                {/* Ask AI row */}
                <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span style={{
                        background: 'var(--bg-card)',
                        border: '0.5px solid var(--bg-border)',
                        borderRadius: '20px',
                        padding: '4px 10px',
                        fontSize: '11px',
                        color: 'var(--text-secondary)',
                        marginRight: '8px',
                        whiteSpace: 'nowrap',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                    }}>Ask AI</span>
                    <button
                        onClick={() => router.push('/ai-chat')}
                        style={{
                            width: '48px',
                            height: '48px',
                            borderRadius: '50%',
                            background: 'var(--bg-card)',
                            border: '1px solid var(--bg-border)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
                            flexShrink: 0,
                        }}
                    >
                        <Sparkles size={20} color="var(--accent-blue)" />
                    </button>
                </div>

                {/* Add Transaction row */}
                <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span style={{
                        background: 'var(--bg-card)',
                        border: '0.5px solid var(--bg-border)',
                        borderRadius: '20px',
                        padding: '4px 10px',
                        fontSize: '11px',
                        color: 'var(--text-secondary)',
                        marginRight: '8px',
                        whiteSpace: 'nowrap',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                    }}>Add</span>
                    <button
                        onClick={() => router.push('/transactions?add=true')}
                        style={{
                            width: '56px',
                            height: '56px',
                            borderRadius: '50%',
                            background: 'var(--accent-blue)',
                            border: 'none',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            boxShadow: '0 4px 16px rgba(59,130,246,0.4)',
                            flexShrink: 0,
                        }}
                    >
                        <Plus size={24} color="white" />
                    </button>
                </div>
            </div>
        );
        return createPortal(mobileFab, document.body);
    }

    // Desktop FAB
    const desktopFab = (
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
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
                opacity: open ? 1 : 0,
                pointerEvents: open ? 'auto' : 'none',
                transform: open ? 'translateY(0)' : 'translateY(8px)',
                transition: 'opacity 150ms ease, transform 150ms ease',
            }}>
                <button
                    onClick={() => { setOpen(false); router.push('/transactions?add=true'); }}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '10px 16px',
                        background: 'var(--bg-card)',
                        border: '0.5px solid var(--bg-border)',
                        borderRadius: '12px',
                        color: 'var(--text-primary)',
                        fontSize: '14px',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
                        fontFamily: 'DM Sans, sans-serif',
                    }}
                >
                    <span>➕</span>
                    <span>Add Transaction</span>
                </button>
                <button
                    onClick={() => { setOpen(false); router.push('/ai-chat'); }}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '10px 16px',
                        background: 'var(--bg-card)',
                        border: '0.5px solid var(--bg-border)',
                        borderRadius: '12px',
                        color: 'var(--text-primary)',
                        fontSize: '14px',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
                        fontFamily: 'DM Sans, sans-serif',
                    }}
                >
                    <span>✨</span>
                    <span>Ask AI</span>
                </button>
            </div>

            {/* Primary FAB button */}
            <button
                onClick={() => setOpen(prev => !prev)}
                style={{
                    width: '56px',
                    height: '56px',
                    borderRadius: '50%',
                    background: 'var(--accent-blue)',
                    border: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    boxShadow: '0 4px 16px rgba(59,130,246,0.4)',
                    transition: 'transform 150ms ease',
                    transform: open ? 'rotate(45deg)' : 'rotate(0deg)',
                }}
            >
                <Plus size={24} color="white" />
            </button>
        </div>
    );

    return createPortal(desktopFab, document.body);
}
