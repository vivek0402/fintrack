'use client';

import React from 'react';
import { LucideIcon, Sparkles } from 'lucide-react';

interface EmptyStateProps {
    icon: LucideIcon;
    title: string;
    subtitle: string;
    action?: React.ReactNode;
    /** Continuous idle float + sparkle loop on the icon. Defaults to true for
     * genuine "no data yet" states. Set false for error/failed-load states
     * rendered through EmptyState, where a cheerful idle animation reads wrong. */
    animated?: boolean;
}

export function EmptyState({ icon: Icon, title, subtitle, action, animated = true }: EmptyStateProps) {
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
                {animated ? (
                    /* Continuous idle loop, layered on a nested element so it doesn't fight
                       the one-shot popIn transform above (same pattern as AppLayout's AI
                       Chat FAB, which layers a one-shot hover/press transform with a
                       separate infinite softPulse animation). */
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
                        <Sparkles
                            size={12}
                            color="var(--accent)"
                            aria-hidden="true"
                            style={{
                                position: 'absolute',
                                top: '-4px',
                                right: '-8px',
                                animation: 'emptySparkle 2.4s ease-in-out infinite',
                            }}
                        />
                    </div>
                ) : (
                    <Icon
                        size={40}
                        color="var(--text-muted)"
                        style={{ marginBottom: 'var(--space-4)' }}
                    />
                )}
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
