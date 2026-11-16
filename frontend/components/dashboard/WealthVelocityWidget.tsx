'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BarChart, Bar, ResponsiveContainer, Cell } from 'recharts';
import { analyticsAPI } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { CardHeader, TextAction } from '@/components/ui/CardParts';
import { Skeleton } from '@/components/ui/Skeleton';
import { useChartAnimation } from '@/hooks/useChartAnimation';
import { type } from '@/lib/typography';
import { fmtSigned, velocitySentence, type TrendKey } from '@/lib/netWorth';

interface MomChange {
    from_date: string;
    to_date: string;
    absolute_change: number;
    pct_change: number;
}

interface WealthVelocityData {
    snapshots: { snapshot_date: string; net_worth: number }[];
    mom_changes: MomChange[];
    avg_monthly_growth: number;
    avg_monthly_growth_pct: number;
    trend: TrendKey;
    message?: string;
}

export function WealthVelocityWidget() {
    const router = useRouter();
    const [data, setData] = useState<WealthVelocityData | null>(null);
    const chartAnim = useChartAnimation('dashboard-wealth-velocity', 600);
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

    const last6 = (data.mom_changes || []).slice(-6);

    return (
        <Card>
            <CardHeader
                title="Wealth velocity"
                sub="How fast net worth grows"
                action={<TextAction onClick={() => router.push('/net-worth?tab=velocity')}>Open</TextAction>}
            />

            {data.trend === 'insufficient_data' ? (
                <p style={{ ...type.meta, margin: 0 }}>
                    {data.message || 'Track your finances for at least 2 months to see wealth velocity.'}
                </p>
            ) : (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-4)' }}>
                    <div style={{ flex: '1 1 auto', minWidth: 0 }}>
                        <p style={{ ...type.figure, margin: 0 }}>{fmtSigned(data.avg_monthly_growth)}</p>
                        <p style={{ ...type.meta, margin: '6px 0 0' }}>
                            {velocitySentence(data.avg_monthly_growth_pct, data.trend)}
                        </p>
                    </div>
                    {last6.length >= 2 && (
                        <div style={{ width: 110, height: 60, flexShrink: 0 }}>
                            <ResponsiveContainer width="100%" height={60}>
                                <BarChart data={last6}>
                                    <Bar dataKey="absolute_change" radius={[3, 3, 3, 3]} {...chartAnim}>
                                        {last6.map((d, i) => (
                                            <Cell key={i} fill={d.absolute_change >= 0 ? 'var(--color-inc)' : 'var(--color-exp)'} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </div>
            )}
        </Card>
    );
}
