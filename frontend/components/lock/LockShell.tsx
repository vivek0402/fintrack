'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { COVER_ATTR } from '@/lib/appLock';

// Full-screen frame shared by the lock screen, PIN entry and PIN setup.
// Portalled to <body> and marked data-lock-root so the globals.css lock rule
// leaves it visible while hiding everything else except the ambient backdrop —
// the glass here always frosts the backdrop, never app content.
//
// `cover` is for flows opened from inside the app (Profile → Security): it
// hides the page underneath for as long as the shell is mounted.
export function LockShell({ children, footer, topAction, cover }: {
    children: React.ReactNode;
    footer?: React.ReactNode;
    topAction?: React.ReactNode;
    cover?: boolean;
}) {
    useEffect(() => {
        if (!cover) return;
        const html = document.documentElement;
        html.setAttribute(COVER_ATTR, '');
        return () => html.removeAttribute(COVER_ATTR);
    }, [cover]);

    if (typeof document === 'undefined') return null;

    return createPortal(
        <div
            data-lock-root=""
            role="dialog"
            aria-modal="true"
            style={{
                position: 'fixed', inset: 0, zIndex: 100000,
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                padding: 'calc(env(safe-area-inset-top) + var(--space-4)) var(--space-6) calc(env(safe-area-inset-bottom) + var(--space-6))',
                overflowY: 'auto', boxSizing: 'border-box',
                animation: 'fadeUp 200ms cubic-bezier(0.16, 1, 0.3, 1) both',
            }}
        >
            <div style={{ alignSelf: 'stretch', minHeight: 40, display: 'flex', justifyContent: 'flex-end' }}>{topAction}</div>
            <div style={{ flex: 1, width: '100%', maxWidth: 360, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-6)' }}>
                {children}
            </div>
            {footer && <div style={{ paddingTop: 'var(--space-6)' }}>{footer}</div>}
        </div>,
        document.body,
    );
}

export const lockLinkStyle: React.CSSProperties = {
    background: 'none', border: 'none', cursor: 'pointer',
    padding: 'var(--space-3) var(--space-4)', minHeight: 44,
    color: 'var(--accent)', fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 600,
};

export const lockTitleStyle: React.CSSProperties = {
    fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 24, lineHeight: 1.2,
    color: 'var(--text-primary)', margin: 0, textAlign: 'center',
};

export const lockSubtitleStyle: React.CSSProperties = {
    fontFamily: 'var(--font-body)', fontSize: 14, lineHeight: 1.5,
    color: 'var(--text-secondary)', margin: 0, textAlign: 'center', minHeight: 21,
};
