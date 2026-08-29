'use client';

import React from 'react';

interface GCardProps {
    children: React.ReactNode;
    padding?: string | number;
    style?: React.CSSProperties;
}

export function GCard({ children, padding = 'var(--space-4)', style }: GCardProps) {
    // Glass by default (2026-08-26) -- fill/border/shadow come from
    // `.glass-surface`. Nested-inside-glass call sites pass a lighter
    // `.glass-field`-style override via the `style` prop, which wins.
    return (
        <div className="glass-surface" style={{
            borderRadius: 'var(--radius-lg)',
            padding,
            ...style,
        }}>
            {children}
        </div>
    );
}
