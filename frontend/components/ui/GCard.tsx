'use client';

import React from 'react';

interface GCardProps {
    children: React.ReactNode;
    padding?: string | number;
    style?: React.CSSProperties;
}

// Accent-tinted info surface. Background and border come from palette tokens,
// so dark mode automatically uses the rgba variants set in globals.css.
export function GCard({ children, padding = 'var(--space-4)', style }: GCardProps) {
    return (
        <div style={{
            background: 'var(--accent-light)',
            border: '1.5px solid var(--accent-border)',
            borderRadius: 'var(--radius-lg)',
            padding,
            ...style,
        }}>
            {children}
        </div>
    );
}
