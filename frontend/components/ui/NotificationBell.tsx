'use client';

import { useEffect, useState, useRef } from 'react';
import { Bell, BellRing, Target, Flag, Receipt, BarChart3, Info } from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
    getCachedNotifications, getNotifications, markAllRead, clearAll,
    AppNotification, NotificationType,
} from '@/lib/notifications';

const TYPE_ICON: Record<NotificationType, React.ElementType> = {
    budget: Target,
    goal:   Flag,
    bill:   Receipt,
    summary: BarChart3,
    info:   Info,
};

const TYPE_COLOR: Record<NotificationType, string> = {
    budget:  'var(--color-warn)',
    goal:    'var(--accent)',
    bill:    'var(--color-exp)',
    summary: '#6366f1',
    info:    'var(--text-muted)',
};

function timeAgo(iso: string): string {
    const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (m < 1)  return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
}

interface Props {
    /** Side the panel opens toward. 'left' = panel left-aligns with the button (sidebar); 'right' = panel right-aligns (mobile top-right). */
    panelAlign?: 'left' | 'right';
}

export function NotificationBell({ panelAlign = 'left' }: Props) {
    const router = useRouter();
    const wrapRef = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState(false);
    const [items, setItems] = useState<AppNotification[]>(() => getCachedNotifications());

    const refresh = () => {
        getNotifications().then(({ notifications }) => setItems(notifications)).catch(() => {});
    };

    useEffect(() => {
        refresh();
        const handler = () => refresh();
        window.addEventListener('fintrack-notification', handler);
        return () => window.removeEventListener('fintrack-notification', handler);
    }, []);

    useEffect(() => {
        if (!open) return;
        const onDown = (e: MouseEvent) => {
            if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', onDown);
        return () => document.removeEventListener('mousedown', onDown);
    }, [open]);

    const unread = items.filter(n => !n.readAt).length;

    const handleToggle = () => {
        const next = !open;
        setOpen(next);
        if (next) { markAllRead().then(refresh).catch(() => {}); }
    };

    const handleClear = (e: React.MouseEvent) => {
        e.stopPropagation();
        setItems([]);
        clearAll().catch(() => refresh());
    };

    const handleItemClick = (n: AppNotification) => {
        setOpen(false);
        if (n.deepLink) router.push(n.deepLink);
    };

    return (
        <div ref={wrapRef} style={{ position: 'relative', flexShrink: 0 }}>

            {/* Bell button */}
            <button
                type="button"
                onClick={handleToggle}
                style={{
                    position: 'relative', width: 34, height: 34,
                    borderRadius: '50%', border: 'none',
                    background: open ? 'var(--accent-subtle)' : 'transparent',
                    cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: open ? 'var(--accent)' : 'var(--text-muted)',
                    transition: 'all 0.15s',
                }}
                onMouseEnter={e => { if (!open) (e.currentTarget as HTMLElement).style.background = 'color-mix(in srgb, var(--text-primary) 8%, transparent)'; }}
                onMouseLeave={e => { if (!open) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
                {unread > 0
                    ? <BellRing size={17} color="var(--accent)" />
                    : <Bell size={17} color="currentColor" />
                }
                {unread > 0 && (
                    <span style={{
                        position: 'absolute', top: 4, right: 4,
                        minWidth: 14, height: 14, borderRadius: 7,
                        background: 'var(--color-exp)', color: '#fff',
                        fontSize: '9px', fontWeight: 700, lineHeight: 1,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        padding: '0 3px', fontFamily: 'var(--font-mono)',
                    }}>
                        {unread > 9 ? '9+' : unread}
                    </span>
                )}
            </button>

            {/* Panel */}
            {open && (
                <div style={{
                    position: 'absolute',
                    top: 'calc(100% + 8px)',
                    ...(panelAlign === 'right' ? { right: 0 } : { left: 0 }),
                    width: 320,
                    background: 'var(--glass-sheet-surface)',
                    border: '1px solid var(--glass-border)',
                    borderRadius: 'var(--radius-lg)',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
                    zIndex: 300,
                    overflow: 'hidden',
                    animation: 'fadeUp 120ms ease forwards',
                }}>
                    {/* Header */}
                    <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '12px 16px', borderBottom: '1px solid var(--glass-border)',
                    }}>
                        <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>
                            Notifications
                        </span>
                        {items.length > 0 && (
                            <button type="button" onClick={handleClear}
                                style={{ background: 'none', border: 'none', fontSize: '11px', color: 'var(--text-muted)', cursor: 'pointer', padding: 0, fontFamily: 'var(--font-body)' }}>
                                Clear all
                            </button>
                        )}
                    </div>

                    {/* List */}
                    <div style={{ maxHeight: 360, overflowY: 'auto' }}>
                        {items.length === 0 ? (
                            <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px', fontFamily: 'var(--font-body)' }}>
                                <Bell size={24} style={{ display: 'block', margin: '0 auto 10px', opacity: 0.35 }} />
                                No notifications yet
                            </div>
                        ) : items.map(n => {
                            const Icon  = TYPE_ICON[n.type]  ?? Info;
                            const color = TYPE_COLOR[n.type] ?? 'var(--text-muted)';
                            return (
                                <button key={n.id} type="button" onClick={() => handleItemClick(n)}
                                    style={{
                                        width: '100%', textAlign: 'left',
                                        display: 'flex', alignItems: 'flex-start', gap: 12,
                                        padding: '12px 16px',
                                        background: n.readAt ? 'transparent' : 'color-mix(in srgb, var(--accent) 5%, transparent)',
                                        border: 'none', borderBottom: '1px solid var(--glass-border)',
                                        cursor: 'pointer', transition: 'background 0.15s',
                                    }}
                                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'color-mix(in srgb, var(--text-primary) 8%, transparent)'; }}
                                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = n.readAt ? 'transparent' : 'color-mix(in srgb, var(--accent) 5%, transparent)'; }}
                                >
                                    <div style={{
                                        width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                                        background: `color-mix(in srgb, ${color} 12%, transparent)`,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    }}>
                                        <Icon size={15} color={color} />
                                    </div>
                                    <div style={{ minWidth: 0, flex: 1 }}>
                                        <p style={{ margin: '0 0 2px', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-body)', lineHeight: 1.3 }}>
                                            {n.title}
                                        </p>
                                        <p style={{ margin: '0 0 4px', fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'var(--font-body)', lineHeight: 1.4 }}>
                                            {n.body}
                                        </p>
                                        <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                                            {timeAgo(n.createdAt)}
                                        </p>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
