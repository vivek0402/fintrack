'use client';

import React, { useState } from 'react';

interface CardProps {
    children: React.ReactNode;
    padding?: string | number;
    elevated?: boolean;
    onClick?: () => void;
    style?: React.CSSProperties;
}

export function Card({ children, padding = 'var(--space-6)', elevated = false, onClick, style }: CardProps) {
    const [hovered, setHovered] = useState(false);

    const interactiveHovered = hovered && !!onClick;

    const baseStyle: React.CSSProperties = {
        background: interactiveHovered
            ? 'var(--bg-hover)'
            : elevated ? 'var(--bg-alt)' : 'var(--bg-card)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border)',
        padding,
        boxShadow: elevated ? 'var(--shadow-elevated)' : 'var(--shadow-card)',
        cursor: onClick ? 'pointer' : undefined,
        transition: onClick
            ? 'transform var(--transition-fast), box-shadow var(--transition-fast), background var(--transition-fast)'
            : undefined,
        transform: interactiveHovered ? 'translateY(-1px)' : undefined,
        ...style,
    };

    return (
        <div
            style={baseStyle}
            onClick={onClick}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
        >
            {children}
        </div>
    );
}
