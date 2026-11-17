'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { type } from '@/lib/typography';
import { TextAction } from './CardParts';
import { useToastStore, type Toast } from '@/store/toastStore';

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const t = requestAnimationFrame(() => setVisible(true));
        return () => cancelAnimationFrame(t);
    }, []);

    const dotColor: Record<string, string> = {
        success: 'var(--color-inc)',
        error:   'var(--color-exp)',
        info:    'var(--text-muted)',
        undo:    'var(--text-muted)',
    };

    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-3)',
            padding: 'var(--space-3) var(--space-4)',
            background: 'var(--bg-surface-2)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-card)',
            minWidth: 260,
            maxWidth: 380,
            opacity: visible ? 1 : 0,
            transform: visible ? 'translateY(0) scale(1)' : 'translateY(12px) scale(0.97)',
            transition: 'opacity 220ms ease, transform 220ms cubic-bezier(0.34,1.56,0.64,1)',
        }}>
            <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: dotColor[toast.type] }} />
            <span style={{ ...type.body, color: 'var(--text-primary)', flex: 1 }}>
                {toast.message}
            </span>
            {toast.type === 'undo' && toast.onUndo && (
                <TextAction onClick={() => { toast.onUndo!(); onDismiss(); }}>
                    {toast.undoLabel ?? 'Undo'}
                </TextAction>
            )}
            <TextAction quiet aria-label="Close notification" onClick={onDismiss}>Close</TextAction>
        </div>
    );
}

export function ToastContainer() {
    const { toasts, dismiss } = useToastStore();
    const [mounted, setMounted] = useState(false);
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- mount flag to defer client-only render (createPortal to document.body) past hydration; standard SSR guard idiom.
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
                ? { bottom: 'calc(72px + var(--sa-bottom) + 12px)', left: '50%', transform: 'translateX(-50%)' }
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
