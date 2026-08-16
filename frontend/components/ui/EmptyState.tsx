'use client';

import React from 'react';
import { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
    icon: LucideIcon;
    title: string;
    subtitle: string;
    action?: React.ReactNode;
}

export function EmptyState({ icon: Icon, title, subtitle, action }: EmptyStateProps) {
    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: 'var(--space-12) var(--space-6)',
            textAlign: 'center',
            animation: 'slideInUp 340ms cubic-bezier(0.22,1,0.36,1) both',
        }}>
            <div style={{ animation: 'popIn 420ms cubic-bezier(0.34,1.56,0.64,1) 80ms both' }}>
                <Icon
                    size={40}
                    color="var(--text-muted)"
                    style={{ marginBottom: 'var(--space-4)' }}
                />
            </div>
            <p style={{
                fontFamily: 'var(--font-display)',
                fontSize: '16px',
                fontWeight: 600,
                color: 'var(--text-primary)',
                margin: 0,
            }}>
                {title}
            </p>
            <p style={{
                fontFamily: 'var(--font-body)',
                fontSize: '13px',
                fontWeight: 400,
                color: 'var(--text-secondary)',
                margin: 'var(--space-2) 0 0 0',
                maxWidth: '320px',
                lineHeight: 1.5,
            }}>
                {subtitle}
            </p>
            {action && (
                <div style={{ marginTop: 'var(--space-4)' }}>
                    {action}
                </div>
            )}
        </div>
    );
}
