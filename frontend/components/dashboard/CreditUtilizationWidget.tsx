'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { debtAPI } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { CardHeader, Rows, TextAction, TONE_TEXT } from '@/components/ui/CardParts';
import { Skeleton } from '@/components/ui/Skeleton';
import { useChartAnimation } from '@/hooks/useChartAnimation';
import { fmt } from '@/lib/utils';
import { type, truncate } from '@/lib/typography';

// Chart data colour for the gauge arc only. Text stays in the normal colour.
function utilColor(pct: number): string {
    if (pct < 30) return 'var(--color-inc)';
    if (pct <= 50) return 'var(--color-warn)';
    return 'var(--color-exp)';
}

function capitalise(s: string): string {
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : 'Unknown';
}

interface CreditCardUtil {
    id: string;
    name: string;
    last4: string;
    outstanding_balance: number;
    credit_limit: number;
    utilization_pct: number;
    status: string;
}

interface CreditUtilizationData {
    per_card: CreditCardUtil[];
    aggregate: { total_outstanding: number; total_limit: number; overall_utilization_pct: number; status: string };
    recommendation: string | null;
}

export function CreditUtilizationWidget() {
    const router = useRouter();
    const [data, setData] = useState<CreditUtilizationData | null>(null);
    const [loading, setLoading] = useState(true);
    const chartAnim = useChartAnimation('dashboard-credit-utilization', 600);

    useEffect(() => {
        debtAPI.getCreditUtilization()
            .then(res => setData(res.data))
            .catch(() => {})
            .finally(() => setLoading(false));
    }, []);

    if (loading) {
        return (
            <Card>
                <Skeleton width="40%" height={12} style={{ marginBottom: 10 }} />
                <Skeleton width="60%" height={32} style={{ marginBottom: 10 }} />
                <Skeleton width="100%" height={60} />
            </Card>
        );
    }

    // An incomplete response (missing per_card/aggregate) hides the widget rather than crashing the dashboard.
    if (!data?.aggregate || !data.per_card?.length) return null;

    const pct = data.aggregate.overall_utilization_pct;
    const gaugeData = [{ value: Math.min(pct, 100) }, { value: Math.max(0, 100 - pct) }];

    return (
        <Card>
            <CardHeader
                title="Credit utilization"
                sub="Keep it under 30%"
                action={<TextAction onClick={() => router.push('/net-worth')}>Open</TextAction>}
            />

            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
                <div style={{ width: 80, height: 80, flexShrink: 0, position: 'relative' }}>
                    <ResponsiveContainer width="100%" height={80}>
                        <PieChart>
                            <Pie data={gaugeData} dataKey="value" startAngle={90} endAngle={-270} innerRadius={28} outerRadius={38} {...chartAnim} stroke="none">
                                <Cell fill={utilColor(pct)} />
                                <Cell fill="var(--border-subtle)" />
                            </Pie>
                        </PieChart>
                    </ResponsiveContainer>
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={type.num}>{pct}%</span>
                    </div>
                </div>
                <div style={{ minWidth: 0 }}>
                    <p style={{ ...type.bodyStrong, margin: 0 }}>{capitalise(data.aggregate.status)}</p>
                    <p style={{ ...type.meta, margin: '2px 0 0' }}>
                        {fmt(data.aggregate.total_outstanding)} of {fmt(data.aggregate.total_limit)} used
                    </p>
                </div>
            </div>

            <Rows>
                {data.per_card.map(card => {
                    const statusColor = card.status === 'critical' ? TONE_TEXT.bad : card.status === 'high' ? TONE_TEXT.caution : null;
                    return (
                        <div key={card.id} style={{ justifyContent: 'space-between' }}>
                            <span style={{ ...type.meta, ...truncate, minWidth: 0 }}>
                                {card.name}{card.last4 ? ` ••${card.last4}` : ''}
                            </span>
                            <span style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-2)', flexShrink: 0 }}>
                                <span style={type.numSmall}>{card.utilization_pct}%</span>
                                {statusColor && <span style={{ ...type.meta, color: statusColor }}>{capitalise(card.status)}</span>}
                            </span>
                        </div>
                    );
                })}
            </Rows>

            {data.recommendation && (
                <p style={{ ...type.meta, margin: 'var(--space-4) 0 0' }}>{data.recommendation}</p>
            )}
        </Card>
    );
}
