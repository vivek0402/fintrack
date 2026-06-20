'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { Sparkles } from 'lucide-react';
import { debtAPI } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';

const fmt = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');

function utilColor(pct: number): string {
    if (pct < 30) return 'var(--color-inc)';
    if (pct <= 50) return 'var(--color-warn)';
    return 'var(--color-exp)';
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
    const [data, setData] = useState<CreditUtilizationData | null>(null);
    const [loading, setLoading] = useState(true);

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

    if (!data || data.per_card.length === 0) return null;

    const pct = data.aggregate.overall_utilization_pct;
    const color = utilColor(pct);
    const gaugeData = [{ value: Math.min(pct, 100) }, { value: Math.max(0, 100 - pct) }];

    return (
        <Card>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600, fontFamily: 'var(--font-body)' }}>
                Credit utilization
            </p>

            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12 }}>
                <div style={{ width: 80, height: 80, flexShrink: 0, position: 'relative' }}>
                    <ResponsiveContainer width="100%" height={80}>
                        <PieChart>
                            <Pie data={gaugeData} dataKey="value" startAngle={90} endAngle={-270} innerRadius={28} outerRadius={38} isAnimationActive={false} stroke="none">
                                <Cell fill={color} />
                                <Cell fill="var(--border-subtle)" />
                            </Pie>
                        </PieChart>
                    </ResponsiveContainer>
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '17px', fontWeight: 800, color, fontVariantNumeric: 'tabular-nums' }}>
                            {pct}%
                        </span>
                    </div>
                </div>
                <div>
                    <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 2px', fontFamily: 'var(--font-body)' }}>
                        {fmt(data.aggregate.total_outstanding)} of {fmt(data.aggregate.total_limit)} used
                    </p>
                    <Badge color={color} bg={`color-mix(in srgb, ${color} 12%, transparent)`}>{data.aggregate.status}</Badge>
                </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {data.per_card.map(card => {
                    const cardColor = utilColor(card.utilization_pct);
                    return (
                        <div key={card.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', fontFamily: 'var(--font-body)' }}>
                            <span style={{ color: 'var(--text-primary)' }}>
                                {card.name}{card.last4 ? ` ••${card.last4}` : ''}
                            </span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{card.utilization_pct}%</span>
                                <Badge color={cardColor} bg={`color-mix(in srgb, ${cardColor} 12%, transparent)`}>{card.status}</Badge>
                            </div>
                        </div>
                    );
                })}
            </div>

            {data.recommendation && (
                <div style={{ marginTop: 12, padding: '8px 10px', background: 'var(--accent-subtle)', borderRadius: 8, fontSize: '11px', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)', display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                    <Sparkles size={12} style={{ flexShrink: 0, marginTop: '1px', color: 'var(--accent)' }} />
                    {data.recommendation}
                </div>
            )}

            <div style={{ marginTop: 12 }}>
                <Link href="/net-worth" style={{ fontSize: '12px', fontWeight: 600, color: 'var(--accent)', textDecoration: 'none', fontFamily: 'var(--font-body)' }}>
                    Manage in Net Worth →
                </Link>
            </div>
        </Card>
    );
}
