'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BarChart, Bar, XAxis, Cell, ResponsiveContainer, PieChart, Pie, Tooltip } from 'recharts';
import { Info, ArrowUp, ArrowDown, Minus } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { analyticsAPI } from '@/lib/api';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card } from '@/components/ui/Card';
import { SkeletonCard } from '@/components/ui/Skeleton';

const fmt = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');
const fmtSigned = (n: number) => (n >= 0 ? '+' : '-') + '₹' + Math.round(Math.abs(n)).toLocaleString('en-IN');
const fmtPctSigned = (n: number) => (n >= 0 ? '+' : '') + Number(n).toFixed(1) + '%';

const CHART_COLORS = [
    'var(--accent)', 'var(--color-inc)', 'var(--color-info)', 'var(--accent-2)',
    'var(--color-warn)', 'var(--accent-3)', 'var(--color-exp)', 'var(--text-muted)',
];

type Trend = 'accelerating' | 'decelerating' | 'steady' | 'insufficient_data';

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
    trend: Trend;
    message?: string;
}

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

const TREND_BADGE: Record<Trend, { label: string; color: string; bg: string; Icon: any }> = {
    accelerating:      { label: 'Accelerating',     color: 'var(--color-inc)',  bg: 'color-mix(in srgb, var(--color-inc) 12%, transparent)',  Icon: ArrowUp },
    decelerating:      { label: 'Decelerating',     color: 'var(--color-exp)',  bg: 'color-mix(in srgb, var(--color-exp) 12%, transparent)',  Icon: ArrowDown },
    steady:            { label: 'Steady',           color: 'var(--color-warn)', bg: 'color-mix(in srgb, var(--color-warn) 12%, transparent)', Icon: Minus },
    insufficient_data: { label: 'Need 2+ months of data', color: 'var(--text-muted)', bg: 'var(--bg-alt)', Icon: Minus },
};

function CustomTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null;
    const date = new Date(label).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    return (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: '10px 14px', fontSize: '0.8rem', boxShadow: 'var(--shadow-modal)' }}>
            <p style={{ color: 'var(--text-secondary)', margin: '0 0 4px', fontWeight: 600, fontFamily: 'var(--font-body)' }}>{date}</p>
            <p style={{ color: payload[0].value >= 0 ? 'var(--color-inc)' : 'var(--color-exp)', margin: 0, fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{fmtSigned(payload[0].value)}</p>
        </div>
    );
}

export default function WealthIntelligencePage() {
    const router = useRouter();
    const { user, isLoading, loadFromStorage } = useAuthStore();

    const [velocity, setVelocity] = useState<WealthVelocityData | null>(null);
    const [allocation, setAllocation] = useState<AssetAllocationData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => { loadFromStorage(); }, []);
    useEffect(() => { if (!isLoading && !user) router.push('/login'); }, [user, isLoading]);

    useEffect(() => {
        if (!user) return;
        Promise.all([analyticsAPI.getWealthVelocity(), analyticsAPI.getAssetAllocation()])
            .then(([velRes, allocRes]) => {
                setVelocity(velRes.data);
                setAllocation(allocRes.data);
            })
            .catch((err: any) => { if (err.response?.status === 401) router.push('/login'); })
            .finally(() => setLoading(false));
    }, [user]);

    if (isLoading || !user || loading) {
        return (
            <AppLayout>
                <SkeletonCard height={60} style={{ marginBottom: '16px' }} />
                <SkeletonCard height={220} style={{ marginBottom: '16px' }} />
                <SkeletonCard height={260} />
            </AppLayout>
        );
    }

    const badge = velocity ? TREND_BADGE[velocity.trend] : null;
    const allMomChanges = velocity?.mom_changes || [];
    const allocations = (allocation?.allocations || []).filter(a => a.amount > 0);

    return (
        <AppLayout>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingBottom: '24px', animation: 'fadeUp 200ms ease forwards' }}>

                {/* ── PAGE HEADER ── */}
                <div>
                    <h1 style={{ fontFamily: 'var(--font-head)', fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>
                        Wealth Intelligence
                    </h1>
                    <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)' }}>
                        Insights into how your money is growing and where it's parked
                    </p>
                </div>

                {/* ══ SECTION 1: WEALTH VELOCITY ══ */}
                <div>
                    <h2 style={{ fontFamily: 'var(--font-head)', fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 2px' }}>
                        Wealth Velocity
                    </h2>
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 12px', fontFamily: 'var(--font-body)' }}>
                        How fast your net worth is growing
                    </p>

                    {!velocity || velocity.trend === 'insufficient_data' ? (
                        <Card>
                            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0, textAlign: 'center', padding: '24px 0', fontFamily: 'var(--font-body)' }}>
                                {velocity?.message || 'Track your finances for at least 2 months to see wealth velocity.'}
                            </p>
                        </Card>
                    ) : (
                        <>
                            <Card style={{ marginBottom: 12 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
                                    <div>
                                        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '32px', fontWeight: 800, color: velocity.avg_monthly_growth >= 0 ? 'var(--color-inc)' : 'var(--color-exp)', margin: '0 0 4px', letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>
                                            {fmtSigned(velocity.avg_monthly_growth)}/mo
                                        </p>
                                        <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', margin: '0 0 10px', fontFamily: 'var(--font-mono)' }}>
                                            {fmtPctSigned(velocity.avg_monthly_growth_pct)} avg/mo
                                        </p>
                                        {badge && (
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '12px', fontWeight: 600, padding: '4px 10px', borderRadius: 999, background: badge.bg, color: badge.color, fontFamily: 'var(--font-body)' }}>
                                                <badge.Icon size={13} />
                                                {badge.label}
                                            </span>
                                        )}
                                    </div>

                                    {allMomChanges.length >= 2 && (
                                        <div style={{ flex: '1 1 320px', minWidth: 240, height: 140 }}>
                                            <ResponsiveContainer width="100%" height={140}>
                                                <BarChart data={allMomChanges}>
                                                    <XAxis dataKey="to_date" tickFormatter={d => new Date(d).toLocaleDateString('en-IN', { month: 'short' })} tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} axisLine={false} tickLine={false} />
                                                    <Tooltip content={<CustomTooltip />} />
                                                    <Bar dataKey="absolute_change" radius={[3, 3, 3, 3]} isAnimationActive={false}>
                                                        {allMomChanges.map((d, i) => (
                                                            <Cell key={i} fill={d.absolute_change >= 0 ? 'var(--color-inc)' : 'var(--color-exp)'} />
                                                        ))}
                                                    </Bar>
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </div>
                                    )}
                                </div>
                            </Card>

                            <Card>
                                <h3 style={{ fontFamily: 'var(--font-head)', fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 12px' }}>Net Worth History</h3>
                                <div style={{ overflowX: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-body)' }}>
                                        <thead>
                                            <tr>
                                                <th style={{ textAlign: 'left', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0 8px 8px 0' }}>Month</th>
                                                <th style={{ textAlign: 'right', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0 8px 8px' }}>Net Worth</th>
                                                <th style={{ textAlign: 'right', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0 8px 8px' }}>Change ₹</th>
                                                <th style={{ textAlign: 'right', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0 0 8px' }}>Change %</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {velocity.snapshots.map((s, idx) => {
                                                const mom = allMomChanges.find(m => m.to_date === s.snapshot_date);
                                                return (
                                                    <tr key={s.snapshot_date} style={{ borderTop: idx > 0 ? '1px solid var(--border)' : 'none' }}>
                                                        <td style={{ fontSize: '13px', color: 'var(--text-primary)', padding: '8px 8px 8px 0' }}>
                                                            {new Date(s.snapshot_date).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
                                                        </td>
                                                        <td style={{ fontSize: '13px', textAlign: 'right', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontWeight: 600, padding: '8px' }}>{fmt(s.net_worth)}</td>
                                                        <td style={{ fontSize: '13px', textAlign: 'right', color: mom ? (mom.absolute_change >= 0 ? 'var(--color-inc)' : 'var(--color-exp)') : 'var(--text-muted)', fontFamily: 'var(--font-mono)', padding: '8px' }}>
                                                            {mom ? fmtSigned(mom.absolute_change) : '—'}
                                                        </td>
                                                        <td style={{ fontSize: '13px', textAlign: 'right', color: mom ? (mom.pct_change >= 0 ? 'var(--color-inc)' : 'var(--color-exp)') : 'var(--text-muted)', fontFamily: 'var(--font-mono)', padding: '8px 0 8px 8px' }}>
                                                            {mom ? fmtPctSigned(mom.pct_change) : '—'}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </Card>
                        </>
                    )}
                </div>

                {/* ══ SECTION 2: ASSET ALLOCATION ══ */}
                <div>
                    <h2 style={{ fontFamily: 'var(--font-head)', fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 2px' }}>
                        Asset Allocation
                    </h2>
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 12px', fontFamily: 'var(--font-body)' }}>
                        How your wealth is distributed
                    </p>

                    {!allocation || allocation.total_assets === 0 ? (
                        <Card>
                            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0, textAlign: 'center', padding: '24px 0', fontFamily: 'var(--font-body)' }}>
                                Add accounts or investments to see your asset allocation.
                            </p>
                        </Card>
                    ) : (
                        <Card>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap', marginBottom: 16 }}>
                                <div style={{ width: 180, height: 180, flexShrink: 0 }}>
                                    <ResponsiveContainer width="100%" height={180}>
                                        <PieChart>
                                            <Pie data={allocations} dataKey="amount" nameKey="label" innerRadius={50} outerRadius={80} paddingAngle={2} isAnimationActive={false}>
                                                {allocations.map((_, i) => (
                                                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                                                ))}
                                            </Pie>
                                            <Tooltip formatter={(value: any) => fmt(Number(value))} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                                    {allocations.map((a, i) => (
                                        <div key={a.category} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <span style={{ width: 10, height: 10, borderRadius: '50%', background: CHART_COLORS[i % CHART_COLORS.length], flexShrink: 0 }} />
                                            <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>{a.label}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-body)' }}>
                                    <thead>
                                        <tr>
                                            <th style={{ textAlign: 'left', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0 8px 8px 0' }}>Category</th>
                                            <th style={{ textAlign: 'right', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0 8px 8px' }}>Amount</th>
                                            <th style={{ textAlign: 'right', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0 8px 8px' }}>Actual %</th>
                                            <th style={{ textAlign: 'right', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0 8px 8px' }}>Target %</th>
                                            <th style={{ textAlign: 'right', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', padding: '0 0 8px' }}>Deviation</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {allocations.map((a, idx) => {
                                            const flagged = Math.abs(a.deviation) > 10;
                                            return (
                                                <tr key={a.category} style={{ borderTop: idx > 0 ? '1px solid var(--border)' : 'none', fontWeight: flagged ? 700 : 400 }}>
                                                    <td style={{ fontSize: '13px', color: 'var(--text-primary)', padding: '8px 8px 8px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
                                                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: CHART_COLORS[idx % CHART_COLORS.length], flexShrink: 0 }} />
                                                        {a.label}
                                                    </td>
                                                    <td style={{ fontSize: '13px', textAlign: 'right', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', padding: '8px' }}>{fmt(a.amount)}</td>
                                                    <td style={{ fontSize: '13px', textAlign: 'right', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', padding: '8px' }}>{a.actual_pct.toFixed(1)}%</td>
                                                    <td style={{ fontSize: '13px', textAlign: 'right', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', padding: '8px' }}>{a.recommended_pct.toFixed(1)}%</td>
                                                    <td style={{ fontSize: '13px', textAlign: 'right', color: flagged ? 'var(--color-warn)' : 'var(--text-muted)', fontFamily: 'var(--font-mono)', padding: '8px 0 8px 8px' }}>
                                                        {a.deviation >= 0 ? '+' : ''}{a.deviation.toFixed(1)}%
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            {allocation.recommendation_note && (
                                <div style={{ display: 'flex', gap: 10, padding: '10px 12px', background: 'var(--bg-alt)', border: '1px solid var(--border)', borderRadius: 10, marginTop: 16 }}>
                                    <Info size={16} style={{ color: 'var(--text-muted)', flexShrink: 0, marginTop: 1 }} />
                                    <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0, fontFamily: 'var(--font-body)', lineHeight: 1.5 }}>
                                        {allocation.recommendation_note}
                                    </p>
                                </div>
                            )}
                        </Card>
                    )}
                </div>

            </div>
        </AppLayout>
    );
}
