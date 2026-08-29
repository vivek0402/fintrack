'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BarChart, Bar, ResponsiveContainer, Cell } from 'recharts';
import { ArrowUp, ArrowDown, Minus } from 'lucide-react';
import { analyticsAPI } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';

const fmtSigned = (n: number) => (n >= 0 ? '+' : '-') + '₹' + Math.round(Math.abs(n)).toLocaleString('en-IN');
const fmtPctSigned = (n: number) => (n >= 0 ? '+' : '') + Number(n).toFixed(1) + '%';

interface MomChange {
    from_date: string;
    to_date: string;
    absolute_change: number;
    pct_change: number;
}

type Trend = 'accelerating' | 'decelerating' | 'steady' | 'insufficient_data';

interface WealthVelocityData {
    snapshots: { snapshot_date: string; net_worth: number }[];
    mom_changes: MomChange[];
    avg_monthly_growth: number;
    avg_monthly_growth_pct: number;
    trend: Trend;
    message?: string;
}

const TREND_BADGE: Record<Trend, { label: string; color: string; bg: string; Icon: any }> = {
    accelerating:      { label: 'Accelerating',     color: 'var(--color-inc)',  bg: 'color-mix(in srgb, var(--color-inc) 12%, transparent)',  Icon: ArrowUp },
    decelerating:      { label: 'Decelerating',     color: 'var(--color-exp)',  bg: 'color-mix(in srgb, var(--color-exp) 12%, transparent)',  Icon: ArrowDown },
    steady:            { label: 'Steady',           color: 'var(--color-warn)', bg: 'color-mix(in srgb, var(--color-warn) 12%, transparent)', Icon: Minus },
    insufficient_data: { label: 'Need 2+ months of data', color: 'var(--text-muted)', bg: 'color-mix(in srgb, var(--text-primary) 8%, transparent)', Icon: Minus },
};

export function WealthVelocityWidget() {
    const [data, setData] = useState<WealthVelocityData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        analyticsAPI.getWealthVelocity()
            .then(res => setData(res.data))
            .catch(() => {})
            .finally(() => setLoading(false));
    }, []);

    if (loading) {
        return (
            <Card>
                <Skeleton width="40%" height={12} style={{ marginBottom: 10 }} />
                <Skeleton width="60%" height={28} style={{ marginBottom: 10 }} />
                <Skeleton width="100%" height={40} />
            </Card>
        );
    }

    if (!data) return null;

    const badge = TREND_BADGE[data.trend];
    const last6 = (data.mom_changes || []).slice(-6);

    return (
        <Card>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600, fontFamily: 'var(--font-body)' }}>
                Wealth velocity
            </p>

            {data.trend === 'insufficient_data' ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '12px', fontWeight: 600, padding: '4px 10px', borderRadius: 999, background: badge.bg, color: badge.color, fontFamily: 'var(--font-body)' }}>
                        <Minus size={12} />
                        {data.message || badge.label}
                    </span>
                </div>
            ) : (
                <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
                        <div style={{ flex: '1 1 auto', minWidth: 0 }}>
                            <p style={{ fontFamily: 'var(--font-mono)', fontSize: '26px', fontWeight: 800, color: data.avg_monthly_growth >= 0 ? 'var(--color-inc)' : 'var(--color-exp)', margin: '0 0 4px', letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>
                                {fmtSigned(data.avg_monthly_growth)}/mo
                            </p>
                            <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', margin: '0 0 8px', fontFamily: 'var(--font-mono)' }}>
                                {fmtPctSigned(data.avg_monthly_growth_pct)} avg/mo
                            </p>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '11px', fontWeight: 600, padding: '4px 10px', borderRadius: 999, background: badge.bg, color: badge.color, fontFamily: 'var(--font-body)' }}>
                                <badge.Icon size={12} />
                                {badge.label}
                            </span>
                        </div>
                        {last6.length >= 2 && (
                            <div style={{ width: 110, height: 60, flexShrink: 0 }}>
                                <ResponsiveContainer width="100%" height={60}>
                                    <BarChart data={last6}>
                                        <Bar dataKey="absolute_change" radius={[3, 3, 3, 3]} isAnimationActive={false}>
                                            {last6.map((d, i) => (
                                                <Cell key={i} fill={d.absolute_change >= 0 ? 'var(--color-inc)' : 'var(--color-exp)'} />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </div>
                </>
            )}

            <div style={{ marginTop: 14 }}>
                <Link href="/net-worth?tab=velocity" style={{ fontSize: '12px', fontWeight: 600, color: 'var(--accent)', textDecoration: 'none', fontFamily: 'var(--font-body)' }}>
                    View details →
                </Link>
            </div>
        </Card>
    );
}
