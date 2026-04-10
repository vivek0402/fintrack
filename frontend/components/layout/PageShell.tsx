'use client';

import React from 'react';
import { useIsMobile } from '@/hooks/useWindowSize';

interface PageShellProps {
    title: string;
    subtitle?: string;
    headerRight?: React.ReactNode;
    children: React.ReactNode;
}

export function PageShell({ title, subtitle, headerRight, children }: PageShellProps) {
    const isMobile = useIsMobile();

    return (
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
            {/* Page Header */}
            <div style={{
                padding: `var(--space-6) var(--space-6) var(--space-4)`,
                borderBottom: '1px solid var(--bg-border)',
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: 'var(--space-4)',
                flexWrap: 'wrap',
            }}>
                <div>
                    <h1 style={{
                        fontFamily: "'Cabinet Grotesk', 'Sora', sans-serif",
                        fontSize: isMobile ? '18px' : '22px',
                        fontWeight: 700,
                        color: 'var(--text-primary)',
                        margin: 0,
                        lineHeight: 1.2,
                    }}>
                        {title}
                    </h1>
                    {subtitle && (
                        <p style={{
                            fontFamily: "'Satoshi', 'DM Sans', sans-serif",
                            fontSize: '13px',
                            fontWeight: 400,
                            color: 'var(--text-secondary)',
                            margin: '4px 0 0 0',
                        }}>
                            {subtitle}
                        </p>
                    )}
                </div>
                {headerRight && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexShrink: 0, flexWrap: 'wrap' }}>
                        {headerRight}
                    </div>
                )}
            </div>

            {/* Content */}
            <div style={{
                padding: isMobile ? 'var(--space-4)' : 'var(--space-6)',
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-6)',
            }}>
                {children}
            </div>
        </div>
    );
}
