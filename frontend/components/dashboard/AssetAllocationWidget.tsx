'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { AlertTriangle } from 'lucide-react';
import { analyticsAPI } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';

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
    const [data, setData] = useState<AssetAllocationData | null>(null);
    const [loading, setLoading] = useState(true);

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

    return (
        <Card>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600, fontFamily: 'var(--font-body)' }}>
                Asset allocation
            </p>

            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ width: 100, height: 100, flexShrink: 0 }}>
                    <ResponsiveContainer width="100%" height={100}>
                        <PieChart>
                            <Pie data={allocations} dataKey="amount" nameKey="label" innerRadius={28} outerRadius={45} paddingAngle={2} isAnimationActive={false}>
                                {allocations.map((_, i) => (
                                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                                ))}
                            </Pie>
                        </PieChart>
                    </ResponsiveContainer>
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-body)' }}>
                        <thead>
                            <tr>
                                <th style={{ textAlign: 'left', fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0 0 6px' }}>Category</th>
                                <th style={{ textAlign: 'right', fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0 0 6px' }}>Actual</th>
                                <th style={{ textAlign: 'right', fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0 0 6px' }}>Target</th>
                            </tr>
                        </thead>
                        <tbody>
                            {allocations.map((a, i) => {
                                const flagged = Math.abs(a.deviation) > 10;
                                return (
                                    <tr key={a.category} style={{ background: flagged ? 'color-mix(in srgb, var(--color-warn) 10%, transparent)' : 'transparent' }}>
                                        <td style={{ fontSize: '12px', color: 'var(--text-primary)', padding: '4px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: CHART_COLORS[i % CHART_COLORS.length], flexShrink: 0 }} />
                                            {a.label}
                                        </td>
                                        <td style={{ fontSize: '12px', textAlign: 'right', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', padding: '4px 0' }}>{a.actual_pct.toFixed(1)}%</td>
                                        <td style={{ fontSize: '12px', textAlign: 'right', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', padding: '4px 0' }}>{a.recommended_pct.toFixed(1)}%</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {data.deviation_score > 15 && (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '11px', fontWeight: 600, padding: '4px 10px', borderRadius: 999, background: 'color-mix(in srgb, var(--color-warn) 12%, transparent)', color: 'var(--color-warn)', fontFamily: 'var(--font-body)', marginTop: 12 }}>
                    <AlertTriangle size={12} />
                    Allocation review suggested
                </div>
            )}

            <div style={{ marginTop: 12 }}>
                <Link href="/net-worth?tab=allocation" style={{ fontSize: '12px', fontWeight: 600, color: 'var(--accent)', textDecoration: 'none', fontFamily: 'var(--font-body)' }}>
                    View full breakdown →
                </Link>
            </div>
        </Card>
    );
}
