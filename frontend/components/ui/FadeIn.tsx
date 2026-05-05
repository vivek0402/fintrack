'use client';

import React from 'react';

interface FadeInProps {
    children: React.ReactNode;
    style?: React.CSSProperties;
    delay?: number; // ms
}

/**
 * Wraps children with a smooth fadeUp entrance.
 * Use as the content wrapper that replaces a skeleton — it will animate
 * in each time it mounts (i.e. when the loading state flips to false).
 */
export function FadeIn({ children, style, delay = 0 }: FadeInProps) {
    return (
        <div style={{
            animation: `fadeUp 320ms cubic-bezier(0.22,1,0.36,1) ${delay}ms both`,
            ...style,
        }}>
            {children}
        </div>
    );
}
