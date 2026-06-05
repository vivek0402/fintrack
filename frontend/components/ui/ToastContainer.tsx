'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react';
import { useToastStore, type Toast } from '@/store/toastStore';

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const t = requestAnimationFrame(() => setVisible(true));
        return () => cancelAnimationFrame(t);
    }, []);

    const colors: Record<string, { bg: string; border: string; icon: string }> = {
        success: { bg: 'rgba(0,229,160,0.12)', border: 'rgba(0,229,160,0.25)', icon: 'var(--accent-green)' },
        error:   { bg: 'rgba(244,63,94,0.12)',  border: 'rgba(244,63,94,0.25)',  icon: 'var(--accent-red)' },
        info:    { bg: 'var(--surface-2)',       border: 'var(--bg-border)',      icon: 'var(--accent-blue)' },
        undo:    { bg: 'var(--surface-2)',       border: 'var(--bg-border)',      icon: 'var(--text-primary)' },
    };

    const c = colors[toast.type];

    const Icon = toast.type === 'success' ? CheckCircle
               : toast.type === 'error'   ? AlertCircle
               : Info;

    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '12px 14px',
            background: c.bg,
            border: `1px solid ${c.border}`,
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-modal)',
            minWidth: '260px',
            maxWidth: '380px',
            opacity: visible ? 1 : 0,
            transform: visible ? 'translateY(0) scale(1)' : 'translateY(12px) scale(0.97)',
            transition: 'opacity 220ms ease, transform 220ms cubic-bezier(0.34,1.56,0.64,1)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
        }}>
            <Icon size={16} color={c.icon} style={{ flexShrink: 0 }} />
            <span style={{
                flex: 1,
                fontSize: '13px',
                fontFamily: "'Satoshi', 'DM Sans', sans-serif",
                fontWeight: 500,
                color: 'var(--text-primary)',
                lineHeight: 1.4,
            }}>
                {toast.message}
            </span>
            {toast.type === 'undo' && toast.onUndo && (
                <button
                    type="button"
                    onClick={() => { toast.onUndo!(); onDismiss(); }}
                    style={{
                        padding: '4px 10px',
                        borderRadius: 'var(--radius-sm)',
                        background: 'var(--accent-blue)',
                        border: 'none',
                        color: '#fff',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        fontFamily: "'Satoshi', 'DM Sans', sans-serif",
                        flexShrink: 0,
                    }}
                >
                    {toast.undoLabel ?? 'Undo'}
                </button>
            )}
            <button
                type="button"
                onClick={onDismiss}
                style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--text-muted)',
                    padding: '2px',
                    display: 'flex',
                    alignItems: 'center',
                    flexShrink: 0,
                }}
            >
                <X size={14} />
            </button>
        </div>
    );
}

export function ToastContainer() {
    const { toasts, dismiss } = useToastStore();
    const [mounted, setMounted] = useState(false);
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        setMounted(true);
        const check = () => setIsMobile(window.innerWidth <= 768);
        check();
        window.addEventListener('resize', check);
        return () => window.removeEventListener('resize', check);
    }, []);

    if (!mounted || toasts.length === 0) return null;

    return createPortal(
        <div style={{
            position: 'fixed',
            ...(isMobile
                ? { bottom: 'calc(72px + env(safe-area-inset-bottom, 0px) + 12px)', left: '50%', transform: 'translateX(-50%)' }
                : { bottom: '28px', right: '28px', left: 'auto', transform: 'none' }
            ),
            zIndex: 9998,
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            alignItems: isMobile ? 'center' : 'flex-end',
            pointerEvents: 'none',
        }}>
            {toasts.map(t => (
                <div key={t.id} style={{ pointerEvents: 'all' }}>
                    <ToastItem toast={t} onDismiss={() => dismiss(t.id)} />
                </div>
            ))}
        </div>,
        document.body
    );
}
