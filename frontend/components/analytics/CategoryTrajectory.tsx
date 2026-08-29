'use client';

import { useMemo } from 'react';
import { AreaChart, Area, Tooltip, ResponsiveContainer } from 'recharts';
import { isCategorizableExpense } from '@/lib/utils';

const fmt = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');
const MN = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

interface Props { transactions: any[]; isMobile: boolean }

export function CategoryTrajectory({ transactions, isMobile }: Props) {
    const categories = useMemo(() => {
        const now = new Date();
        const months: { year: number; month: number; label: string }[] = [];
        for (let i = 5; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            months.push({ year: d.getFullYear(), month: d.getMonth() + 1, label: MN[d.getMonth() + 1] });
        }

        const catMap: Record<string, Record<string, number>> = {};
        transactions.filter(isCategorizableExpense).forEach(t => {
            const d = new Date((t.date ?? '').split('T')[0] + 'T00:00:00');
            const mKey = `${d.getFullYear()}-${d.getMonth() + 1}`;
            const cat = t.category_name ?? t.category ?? 'Other';
            if (!catMap[cat]) catMap[cat] = {};
            catMap[cat][mKey] = (catMap[cat][mKey] ?? 0) + parseFloat(t.amount ?? 0);
        });

        return Object.entries(catMap)
            .map(([name, mMap]) => {
                const data = months.map(({ year, month, label }) => ({
                    label,
                    amount: mMap[`${year}-${month}`] ?? 0,
                }));
                const current = data[5]?.amount ?? 0;
                const prev    = data[4]?.amount ?? 0;
                const trendPct = prev > 0 ? Math.round(((current - prev) / prev) * 100) : 0;
                const slug = name.replace(/[^a-zA-Z0-9]/g, '');
                return { name, data, current, trendPct, slug };
            })
            .filter(c => c.current > 0 || c.data.some(d => d.amount > 0))
            .sort((a, b) => b.current - a.current)
            .slice(0, 12);
    }, [transactions]);

    if (!categories.length) {
        return <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '24px 0', fontFamily: 'var(--font-body)' }}>Add expense transactions to see category trends.</p>;
    }

    const cols = isMobile ? 2 : 3;

    return (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: '10px' }}>
            {categories.map(cat => {
                const isUp    = cat.trendPct > 0;
                const stroke  = isUp ? 'var(--color-exp)' : 'var(--color-inc)';
                const trendBg = isUp ? 'color-mix(in srgb, var(--color-exp) 10%, transparent)' : 'color-mix(in srgb, var(--color-inc) 10%, transparent)';
                return (
                    <div key={cat.name} className="glass-field" style={{ borderRadius: 'var(--radius-md)', padding: '12px', minWidth: 0, overflow: 'hidden' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 2, gap: 4 }}>
                            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-body)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                                {cat.name}
                            </span>
                            {cat.trendPct !== 0 && (
                                <span style={{ fontSize: 10, color: isUp ? 'var(--color-exp)' : 'var(--color-inc)', fontWeight: 700, fontFamily: 'var(--font-mono)', flexShrink: 0, background: trendBg, padding: '1px 5px', borderRadius: 4 }}>
                                    {isUp ? '▲' : '▼'} {Math.abs(cat.trendPct)}%
                                </span>
                            )}
                        </div>
                        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', margin: '2px 0 6px', fontVariantNumeric: 'tabular-nums' }}>
                            {fmt(cat.current)}
                        </p>
                        <ResponsiveContainer width="100%" height={60}>
                            <AreaChart data={cat.data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
                                <defs>
                                    <linearGradient id={`cg-${cat.slug}`} x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%"  stopColor={stroke} stopOpacity={0.30} />
                                        <stop offset="95%" stopColor={stroke} stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <Tooltip
                                    content={({ active, payload }) =>
                                        active && payload?.length ? (
                                            <div style={{ background: 'var(--bg-surface-1)', border: '1px solid var(--border-subtle)', borderRadius: 6, padding: '4px 8px', fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                                                {payload[0].payload.label}: {fmt(Number(payload[0].value))}
                                            </div>
                                        ) : null
                                    }
                                />
                                <Area type="monotone" dataKey="amount" stroke={stroke} strokeWidth={1.5} fill={`url(#cg-${cat.slug})`} dot={false} />
                            </AreaChart>
                        </ResponsiveContainer>
                        <p style={{ fontSize: 9, color: 'var(--text-muted)', margin: '4px 0 0', fontFamily: 'var(--font-body)', textAlign: 'right' }}>6-month trend</p>
                    </div>
                );
            })}
        </div>
    );
}
