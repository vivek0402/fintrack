'use client';

import React, { useState } from 'react';

interface CardProps {
    children: React.ReactNode;
    /** Leave unset: `.fin-card` supplies the standard 20px (16 on phones). */
    padding?: string | number;
    elevated?: boolean;
    onClick?: () => void;
    className?: string;
    style?: React.CSSProperties;
}

/**
 * The app's one card (DESIGN.md "The card"). Glass, --radius-lg, standard
 * padding from `.fin-card`. Don't tint it, outline it, or nest another card
 * inside it; status belongs on the figure, a StatusDot or a bar.
 */
export function Card({ children, padding, elevated = false, onClick, className, style }: CardProps) {
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
            className={['glass-surface fin-card', onClick && 'pressable', className].filter(Boolean).join(' ')}
            style={baseStyle}
            onClick={onClick}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
        >
            {children}
        </div>
    );
}
