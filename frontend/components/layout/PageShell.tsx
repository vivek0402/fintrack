'use client';

import React from 'react';
import { useIsMobile } from '@/hooks/useWindowSize';
import { type } from '@/lib/typography';

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
                borderBottom: '1px solid var(--border-subtle)',
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: 'var(--space-4)',
                flexWrap: 'wrap',
            }}>
                <div>
                    <h1 style={{ ...type.heading, margin: 0 }}>
                        {title}
                    </h1>
                    {subtitle && (
                        <p style={{ ...type.meta, margin: '4px 0 0 0' }}>
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
