'use client';

import React from 'react';
import { type } from '@/lib/typography';

interface EmptyStateProps {
    /** Accepted so existing callers compile; the empty state no longer draws an icon. */
    icon?: unknown;
    title: string;
    subtitle: string;
    action?: React.ReactNode;
    /** Accepted so existing callers compile; there is no animation any more. */
    animated?: boolean;
}

export function EmptyState({ title, subtitle, action }: EmptyStateProps) {
    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: 'var(--space-8) var(--space-6)',
            textAlign: 'center',
        }}>
            <p style={{ ...type.title, margin: 0 }}>{title}</p>
            <p style={{ ...type.body, margin: 'var(--space-2) 0 0 0', maxWidth: 320 }}>{subtitle}</p>
            {action && (
                <div style={{ marginTop: 'var(--space-4)' }}>
                    {action}
                </div>
            )}
        </div>
    );
}
