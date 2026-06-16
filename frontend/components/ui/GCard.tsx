'use client';

import React from 'react';

interface GCardProps {
    children: React.ReactNode;
    padding?: string | number;
    style?: React.CSSProperties;
}

export function GCard({ children, padding = 'var(--space-4)', style }: GCardProps) {
    return (
        <div style={{
            background: 'var(--bg-surface-2)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-lg)',
            padding,
            ...style,
        }}>
            {children}
        </div>
    );
}
