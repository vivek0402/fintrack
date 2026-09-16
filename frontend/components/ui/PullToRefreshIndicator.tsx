'use client';

import { RefreshCw } from 'lucide-react';

interface PullToRefreshIndicatorProps {
    pullDistance: number;
    refreshing: boolean;
}

const THRESHOLD = 50;
const REFRESHING_HEIGHT = 56;

/**
 * Spinner + label shown above a mobile page's scroll content while pulling.
 * Height tracks `pullDistance` directly (0 -> no layout intrusion when
 * idle), so it pushes the content below it down by the same amount the
 * gesture has pulled -- the indicator and content read as moving together,
 * same as a native pull-to-refresh.
 */
export function PullToRefreshIndicator({ pullDistance, refreshing }: PullToRefreshIndicatorProps) {
    const armed = pullDistance >= THRESHOLD;
    const progress = Math.min(pullDistance / THRESHOLD, 1);
    const label = refreshing ? 'Refreshing…' : armed ? 'Release to refresh' : 'Pull to refresh';

    return (
        <div
            aria-hidden={pullDistance === 0 && !refreshing}
            style={{
                height: refreshing ? REFRESHING_HEIGHT : pullDistance,
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 'var(--space-2, 8px)',
                // Immediate 1:1 tracking while actively dragging; eased settle
                // once the gesture ends (snap to 0, or settle into the fixed
                // refreshing height).
                transition: (pullDistance === 0 || refreshing) ? 'height 220ms cubic-bezier(0.34, 1.56, 0.64, 1)' : 'none',
            }}
        >
            <RefreshCw
                size={16}
                style={{
                    flexShrink: 0,
                    color: armed || refreshing ? 'var(--accent)' : 'var(--text-muted)',
                    animation: refreshing ? 'spin 0.7s linear infinite' : undefined,
                    transform: refreshing ? undefined : `rotate(${progress * 180}deg)`,
                    transition: 'color 150ms ease',
                }}
            />
            <span style={{
                fontSize: 'var(--text-caption)',
                color: 'var(--text-muted)',
                fontFamily: 'var(--font-body)',
                whiteSpace: 'nowrap',
            }}>
                {label}
            </span>
        </div>
    );
}
