'use client';

import React from 'react';

interface BadgeProps {
    children: React.ReactNode;
    color?: string;   // text colour; defaults to var(--accent)
    bg?: string;      // background; defaults to var(--accent-subtle)
    style?: React.CSSProperties;
}

export function Badge({ children, color, bg, style }: BadgeProps) {
    return (
        <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '2px 8px',
            borderRadius: '999px',
            fontSize: '0.72rem',
            fontWeight: 600,
            background: bg ?? 'var(--accent-subtle)',
            color: color ?? 'var(--accent)',
            fontFamily: 'var(--font-body)',
            lineHeight: 1.4,
            whiteSpace: 'nowrap',
            ...style,
        }}>
            {children}
        </span>
    );
}
