'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
    LayoutDashboard, ArrowLeftRight, PieChart, MoreHorizontal,
    Target, Trophy, X, Settings, Users, FolderOpen, MessageSquare,
    Wallet,
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';

const mainTabs = [
    { href: '/dashboard',    icon: LayoutDashboard, label: 'Home' },
    { href: '/transactions', icon: ArrowLeftRight,  label: 'Transactions' },
    { href: '/analytics',    icon: PieChart,        label: 'Analytics' },
];

const moreGridItems = [
    { href: '/accounts', icon: Wallet,        label: 'Accounts' },
    { href: '/goals',    icon: Trophy,        label: 'Goals' },
    { href: '/budgets',  icon: Target,        label: 'Budgets' },
    { href: '/ai-chat',  icon: MessageSquare, label: 'AI Chat' },
    { href: '/groups',   icon: FolderOpen,    label: 'Groups' },
    { href: '/profile',  icon: Settings,      label: 'Settings' },
];

export function BottomNav() {
    const pathname = usePathname();
    const router = useRouter();
    const { logout } = useAuthStore();

    const [moreOpen, setMoreOpen] = useState(false);
    const [rendered, setRendered] = useState(false);
    const [visible, setVisible] = useState(false);

    const isActive = (href: string) => pathname === href || pathname.startsWith(href);
    const moreActive = !mainTabs.some(t => isActive(t.href));

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

    return (
        <>
            {/* Backdrop */}
            {rendered && (
                <div
                    onClick={() => setMoreOpen(false)}
                    style={{
                        position: 'fixed',
                        inset: 0,
                        zIndex: 998,
                        backgroundColor: 'rgba(0,0,0,0.35)',
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
                    borderTop: '1px solid var(--border)',
                    paddingBottom: 'calc(16px + env(safe-area-inset-bottom))',
                    maxHeight: '85vh',
                    overflowY: 'auto',
                    transform: moreOpen ? 'translateY(0)' : 'translateY(100%)',
                    opacity: moreOpen ? 1 : 0,
                    transition: 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1), opacity 0.2s ease',
                }}>

                    {/* Drag handle */}
                    <div style={{
                        width: '40px',
                        height: '4px',
                        borderRadius: '2px',
                        backgroundColor: 'var(--border)',
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
                            fontWeight: 700,
                            color: 'var(--text-primary)',
                            fontFamily: 'var(--font-display)',
                        }}>
                            More
                        </span>
                        <button
                            type="button"
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

                    {/* 2×3 grid */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(3, 1fr)',
                        gap: '12px',
                        padding: '8px 20px 8px',
                    }}>
                        {moreGridItems.map(({ href, icon: Icon, label }, idx) => {
                            const active = isActive(href);
                            return (
                                <button
                                    key={href}
                                    type="button"
                                    onClick={() => handleMoreItemClick(href)}
                                    style={{
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        gap: '8px',
                                        padding: '16px 8px',
                                        borderRadius: '14px',
                                        border: `1px solid ${active ? 'var(--accent-border)' : 'var(--border)'}`,
                                        background: active ? 'var(--accent-light)' : 'var(--bg-alt)',
                                        cursor: 'pointer',
                                        opacity: visible ? 1 : 0,
                                        transform: visible ? 'translateY(0)' : 'translateY(16px)',
                                        transition: `background 0.15s, border-color 0.15s, opacity 0.25s ease ${idx * 40}ms, transform 0.25s ease ${idx * 40}ms`,
                                    }}
                                >
                                    <div style={{
                                        width: '44px',
                                        height: '44px',
                                        borderRadius: '12px',
                                        background: active ? 'var(--accent)' : 'var(--bg-hover)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                    }}>
                                        <Icon size={20} color={active ? 'white' : 'var(--text-secondary)'} />
                                    </div>
                                    <span style={{
                                        fontSize: '12px',
                                        fontWeight: active ? 600 : 500,
                                        color: active ? 'var(--accent)' : 'var(--text-primary)',
                                        fontFamily: 'var(--font-body)',
                                        lineHeight: 1,
                                    }}>
                                        {label}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Bottom nav bar */}
            <nav style={{
                position: 'fixed',
                bottom: 0,
                left: 0,
                right: 0,
                background: 'var(--bg-card)',
                borderTop: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-around',
                paddingTop: '6px',
                paddingBottom: 'calc(10px + env(safe-area-inset-bottom, 0px))',
                zIndex: 997,
                boxShadow: '0 -8px 32px rgba(0, 0, 0, 0.12)',
            }}>
                {mainTabs.map(({ href, icon: Icon, label }) => {
                    const active = isActive(href);
                    return (
                        <a
                            key={href}
                            href={href}
                            onClick={e => { e.preventDefault(); router.push(href); }}
                            style={{ textDecoration: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', padding: '2px 16px' }}
                        >
                            {/* Icon pill */}
                            <div
                                key={active ? 'active' : 'inactive'}
                                style={{
                                    padding: '5px 14px',
                                    borderRadius: '20px',
                                    background: active ? 'var(--accent)' : 'transparent',
                                    transition: 'background 200ms ease',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    animation: active ? 'popIn 380ms cubic-bezier(0.34,1.56,0.64,1) both' : undefined,
                                }}
                            >
                                <Icon size={22} color={active ? 'white' : 'var(--text-muted)'} />
                            </div>
                            <span style={{
                                fontSize: '11px',
                                color: active ? 'var(--accent)' : 'var(--text-muted)',
                                fontWeight: active ? 600 : 400,
                                transition: 'color 200ms ease',
                                fontFamily: 'var(--font-body)',
                            }}>
                                {label}
                            </span>
                        </a>
                    );
                })}

                {/* More button */}
                <button
                    type="button"
                    onClick={() => setMoreOpen(v => !v)}
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '3px',
                        padding: '2px 16px',
                        border: 'none',
                        background: 'transparent',
                        cursor: 'pointer',
                    }}
                >
                    <div
                        key={moreOpen ? 'open' : 'closed'}
                        style={{
                            padding: '5px 14px',
                            borderRadius: '20px',
                            background: moreActive || moreOpen ? 'var(--accent)' : 'transparent',
                            transition: 'background 200ms ease',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            animation: moreOpen ? 'popIn 380ms cubic-bezier(0.34,1.56,0.64,1) both' : undefined,
                        }}
                    >
                        <MoreHorizontal size={22} color={moreActive || moreOpen ? 'white' : 'var(--text-muted)'} />
                    </div>
                    <span style={{
                        fontSize: '11px',
                        color: moreActive || moreOpen ? 'var(--accent)' : 'var(--text-muted)',
                        fontWeight: moreActive || moreOpen ? 600 : 400,
                        transition: 'color 200ms ease',
                        fontFamily: 'var(--font-body)',
                    }}>
                        More
                    </span>
                </button>
            </nav>
        </>
    );
}
