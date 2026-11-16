'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { analyticsAPI } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { CardHeader, TextAction, TONE_TEXT } from '@/components/ui/CardParts';
import { Skeleton } from '@/components/ui/Skeleton';
import { useChartAnimation } from '@/hooks/useChartAnimation';
import { type, truncate } from '@/lib/typography';
import { furthestFromTarget, deviationLabel } from '@/lib/netWorth';

const CHART_COLORS = [
    'var(--accent)', 'var(--color-inc)', 'var(--color-info)', 'var(--accent-2)',
    'var(--color-warn)', 'var(--accent-3)', 'var(--color-exp)', 'var(--text-muted)',
];

interface Allocation {
    category: string;
    label: string;
    amount: number;
    actual_pct: number;
    recommended_pct: number;
    deviation: number;
}

interface AssetAllocationData {
    allocations: Allocation[];
    total_assets: number;
    deviation_score: number;
    recommendation_note: string;
}

export function AssetAllocationWidget() {
    const router = useRouter();
    const [data, setData] = useState<AssetAllocationData | null>(null);
    const [loading, setLoading] = useState(true);
    const chartAnim = useChartAnimation('dashboard-asset-allocation', 600);

    useEffect(() => {
        analyticsAPI.getAssetAllocation()
            .then(res => setData(res.data))
            .catch(() => {})
            .finally(() => setLoading(false));
    }, []);

    if (loading) {
        return (
            <Card>
                <Skeleton width="40%" height={12} style={{ marginBottom: 10 }} />
                <Skeleton width="100%" height={120} style={{ marginBottom: 10 }} />
                <Skeleton width="100%" height={60} />
            </Card>
        );
    }

    if (!data || data.total_assets === 0) return null;

    const allocations = (data.allocations || []).filter(a => a.amount > 0);

    // Name the allocation furthest from target when it is past the 5 point
    // threshold. With no deviation to name, fall back to the overall score check.
    const furthest = furthestFromTarget(allocations);
    let reviewLine: string | null = null;
    if (furthest) {
        const dev = deviationLabel(furthest.deviation);
        if (dev.flagged) reviewLine = `${furthest.label} is ${dev.text}. A review is suggested.`;
    } else if (data.deviation_score > 15) {
        reviewLine = 'Your allocation is off target. A review is suggested.';
    }

    return (
        <Card>
            <CardHeader
                title="Asset allocation"
                sub="Where your assets sit against target"
                action={<TextAction onClick={() => router.push('/net-worth?tab=allocation')}>Open</TextAction>}
            />

            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
                <div style={{ width: 100, height: 100, flexShrink: 0 }}>
                    <ResponsiveContainer width="100%" height={100}>
                        <PieChart>
                            <Pie data={allocations} dataKey="amount" nameKey="label" innerRadius={28} outerRadius={45} paddingAngle={2} {...chartAnim}>
                                {allocations.map((_, i) => (
                                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                                ))}
                            </Pie>
                        </PieChart>
                    </ResponsiveContainer>
                </div>

                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                    {allocations.map((a, i) => (
                        <div key={a.category} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', minWidth: 0 }}>
                            <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: CHART_COLORS[i % CHART_COLORS.length] }} />
                            <span style={{ ...type.bodyStrong, ...truncate, flex: 1, minWidth: 0 }}>{a.label}</span>
                            <span style={type.numSmall}>{Math.round(a.actual_pct)}%</span>
                            <span style={{ ...type.meta, width: 72, textAlign: 'right', flexShrink: 0 }}>target {Math.round(a.recommended_pct)}%</span>
                        </div>
                    ))}
                </div>
            </div>

            {reviewLine && (
                <p style={{ ...type.meta, margin: 'var(--space-4) 0 0', color: TONE_TEXT.caution }}>{reviewLine}</p>
            )}
        </Card>
    );
}
