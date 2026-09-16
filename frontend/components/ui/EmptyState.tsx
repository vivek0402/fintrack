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
                {/* Continuous idle loop, layered on a nested element so it doesn't fight
                    the one-shot popIn transform above (same pattern as AppLayout's AI
                    Chat FAB, which layers a one-shot hover/press transform with a
                    separate infinite softPulse animation). */}
                <div style={{
                    position: 'relative',
                    display: 'inline-block',
                    animation: 'emptyFloat 2.4s ease-in-out infinite',
                }}>
                    <Icon
                        size={40}
                        color="var(--text-muted)"
                        style={{ marginBottom: 'var(--space-4)', display: 'block' }}
                    />
                    <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="var(--color-warn)"
                        aria-hidden="true"
                        style={{
                            position: 'absolute',
                            top: '-4px',
                            right: '-8px',
                            animation: 'emptySparkle 2.4s ease-in-out infinite',
                        }}
                    >
                        <path d="M12 0C12 0 12.5 8.5 15 11C17.5 13.5 24 12 24 12C24 12 17.5 13.5 15 15C12.5 17.5 12 24 12 24C12 24 11.5 17.5 9 15C6.5 13.5 0 12 0 12C0 12 6.5 13.5 9 11C11.5 8.5 12 0 12 0Z" />
                    </svg>
                </div>
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
