'use client';

import React from 'react';
import { Skeleton } from './Skeleton';

interface StatTileProps {
    label: string;
    value: string;
    subLabel?: string;
    trend?: number;
    icon?: React.ReactNode;
    accentColor?: string;
    loading?: boolean;
    style?: React.CSSProperties;
}

export function StatTile({ label, value, subLabel, trend, icon, accentColor, loading = false, style }: StatTileProps) {
    if (loading) {
        return (
            <div style={{
                background: 'var(--bg-card)',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--border)',
                padding: 'var(--space-4)',
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-2)',
                ...style,
            }}>
                <Skeleton width="60%" height={10} borderRadius={4} />
                <Skeleton width="80%" height={32} borderRadius={6} />
                <Skeleton width="50%" height={10} borderRadius={4} />
            </div>
        );
    }

    const trendPositive = trend !== undefined && trend >= 0;

    return (
        <div style={{
            background: 'var(--bg-card)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--border)',
            padding: 'var(--space-4)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-2)',
            ...style,
        }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{
                    fontSize: '10px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    color: 'var(--text-secondary)',
                    fontFamily: 'var(--font-head)',
                    fontWeight: 600,
                }}>
                    {label}
                </span>
                {icon && (
                    <span style={{ color: accentColor || 'var(--accent)', opacity: 0.8 }}>
                        {icon}
                    </span>
                )}
            </div>

            <div style={{
                fontSize: 'var(--text-hero)',
                fontFamily: 'var(--font-mono)',
                fontVariantNumeric: 'tabular-nums',
                fontWeight: 700,
                color: accentColor || 'var(--text-primary)',
                lineHeight: 1,
                letterSpacing: '-0.02em',
                animation: 'numberReveal 350ms cubic-bezier(0.22,1,0.36,1) both',
            }}>
                {value}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                {subLabel && (
                    <span style={{ fontSize: 'var(--text-caption)', color: 'var(--text-muted)' }}>
                        {subLabel}
                    </span>
                )}
                {trend !== undefined && (
                    <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '3px',
                        padding: '2px 8px',
                        borderRadius: '999px',
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        background: trendPositive
                            ? 'color-mix(in srgb, var(--color-inc) 12%, transparent)'
                            : 'color-mix(in srgb, var(--color-exp) 12%, transparent)',
                        color: trendPositive ? 'var(--color-inc)' : 'var(--color-exp)',
                    }}>
                        {trendPositive ? '▲' : '▼'} {Math.abs(trend).toFixed(1)}%
                    </span>
                )}
            </div>
        </div>
    );
}
