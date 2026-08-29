'use client';

import React, { useState } from 'react';

interface CardProps {
    children: React.ReactNode;
    padding?: string | number;
    elevated?: boolean;
    onClick?: () => void;
    style?: React.CSSProperties;
}

export function Card({ children, padding = '18px 20px', elevated = false, onClick, style }: CardProps) {
    const [hovered, setHovered] = useState(false);

    const interactiveHovered = hovered && !!onClick;

    // Glass by default (2026-08-26) -- every route is on the glass language now,
    // so the fill/border/shadow come from `.glass-surface` rather than being set
    // here. Only the states that differ from that baseline are set inline;
    // `undefined` is skipped by React, letting the class win.
    const baseStyle: React.CSSProperties = {
        background: interactiveHovered
            ? 'var(--glass-fill-2)'
            : elevated ? 'var(--glass-sheet-surface)' : undefined,
        borderRadius: 'var(--radius-lg)',
        padding,
        cursor: onClick ? 'pointer' : undefined,
        transition: onClick
            ? 'transform var(--transition-fast), box-shadow var(--transition-fast), background var(--transition-fast)'
            : undefined,
        transform: interactiveHovered ? 'translateY(-1px)' : undefined,
        ...style,
    };

    return (
        <div
            className="glass-surface"
            style={baseStyle}
            onClick={onClick}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
        >
            {children}
        </div>
    );
}
