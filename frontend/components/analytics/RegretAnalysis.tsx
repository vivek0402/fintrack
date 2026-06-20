'use client';

import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { calculateMindfulScore } from '@/lib/healthScore';

const fmt = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');

const BRACKETS = [
    { label: 'Under ₹500',    min: 0,    max: 500   },
    { label: '₹500–₹2K',     min: 500,  max: 2000  },
    { label: '₹2K–₹5K',      min: 2000, max: 5000  },
    { label: 'Over ₹5K',     min: 5000, max: Infinity },
];

interface Props {
    transactions: any[];
}

export function RegretAnalysis({ transactions }: Props) {
    const stats = useMemo(() => {
        const expenses = transactions.filter(tx => tx.type === 'expense');
        if (!expenses.length) return null;

        const regretted = expenses.filter(tx => tx.is_regretted);
        const overallRate = Math.round((regretted.length / expenses.length) * 100);
        const mindfulScore = calculateMindfulScore(regretted.length, expenses.length);

        // By category
        const catMap: Record<string, { total: number; regretted: number }> = {};
        expenses.forEach(tx => {
            const cat = tx.category_name || 'Uncategorized';
            if (!catMap[cat]) catMap[cat] = { total: 0, regretted: 0 };
            catMap[cat].total++;
            if (tx.is_regretted) catMap[cat].regretted++;
        });
        const byCategory = Object.entries(catMap)
            .map(([name, { total, regretted }]) => ({
                name,
                rate: Math.round((regretted / total) * 100),
                regretted,
                total,
            }))
            .filter(c => c.total >= 2)
            .sort((a, b) => b.rate - a.rate)
            .slice(0, 8);

        // By amount bracket
        const byBracket = BRACKETS.map(({ label, min, max }) => {
            const inBracket = expenses.filter(tx => {
                const amt = parseFloat(tx.amount);
                return amt >= min && amt < max;
            });
            const regInBracket = inBracket.filter(tx => tx.is_regretted);
            return {
                label,
                rate: inBracket.length > 0 ? Math.round((regInBracket.length / inBracket.length) * 100) : 0,
                count: inBracket.length,
            };
        });

        // Most regretted merchant (group by description)
        const merchantMap: Record<string, { total: number; regretted: number }> = {};
        expenses.forEach(tx => {
            const name = (tx.description || 'Unknown').trim();
            if (!merchantMap[name]) merchantMap[name] = { total: 0, regretted: 0 };
            merchantMap[name].total++;
            if (tx.is_regretted) merchantMap[name].regretted++;
        });
        const topMerchant = Object.entries(merchantMap)
            .filter(([, { total, regretted }]) => total >= 2 && regretted > 0)
            .sort(([, a], [, b]) => (b.regretted / b.total) - (a.regretted / a.total))[0];

        return { overallRate, mindfulScore, byCategory, byBracket, topMerchant, total: expenses.length, regrettedCount: regretted.length };
    }, [transactions]);

    if (!stats) {
        return (
            <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '16px 0', fontFamily: 'var(--font-body)' }}>
                No expense data yet. Add transactions to see regret analysis.
            </p>
        );
    }

    const scoreColor = stats.mindfulScore >= 80 ? 'var(--color-inc)' : stats.mindfulScore >= 60 ? 'var(--accent)' : stats.mindfulScore >= 40 ? 'var(--color-warn)' : 'var(--color-exp)';

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>

            {/* Stat row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
                {[
                    { label: 'Total Reviewed', value: stats.total.toString(), color: 'var(--text-primary)' },
                    { label: 'Regret Rate', value: `${stats.overallRate}%`, color: stats.overallRate > 40 ? 'var(--color-exp)' : stats.overallRate > 20 ? 'var(--color-warn)' : 'var(--color-inc)' },
                    { label: 'Mindful Score', value: stats.mindfulScore.toString(), color: scoreColor },
                ].map(s => (
                    <div key={s.label} style={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '12px' }}>
                        <p style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 4px', fontFamily: 'var(--font-body)' }}>{s.label}</p>
                        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '1.3rem', fontWeight: 700, color: s.color, margin: 0, fontVariantNumeric: 'tabular-nums' }}>{s.value}</p>
                    </div>
                ))}
            </div>

            {/* Top regretted merchant */}
            {stats.topMerchant && (
                <div style={{ padding: '12px 16px', background: 'color-mix(in srgb, var(--color-exp) 6%, var(--bg-surface-1))', border: '1px solid color-mix(in srgb, var(--color-exp) 15%, transparent)', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '20px' }}>😬</span>
                    <div>
                        <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>
                            Most Regretted: {stats.topMerchant[0]}
                        </p>
                        <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>
                            {stats.topMerchant[1].regretted} of {stats.topMerchant[1].total} purchases regretted ({Math.round((stats.topMerchant[1].regretted / stats.topMerchant[1].total) * 100)}%)
                        </p>
                    </div>
                </div>
            )}

            {/* By category bar chart */}
            {stats.byCategory.length > 0 && (
                <div>
                    <p style={{ fontFamily: 'var(--font-display)', fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 10px' }}>Regret Rate by Category</p>
                    <ResponsiveContainer width="100%" height={Math.max(120, stats.byCategory.length * 36)}>
                        <BarChart data={stats.byCategory} layout="vertical" margin={{ top: 0, right: 32, left: 0, bottom: 0 }}>
                            <XAxis type="number" domain={[0, 100]} hide />
                            <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11, fontFamily: 'var(--font-body)', fill: 'var(--text-secondary)' }} axisLine={false} tickLine={false} />
                            <Tooltip
                                formatter={(val: any) => [`${val}%`, 'Regret Rate']}
                                contentStyle={{ background: 'var(--bg-surface-1)', border: '1px solid var(--border-subtle)', borderRadius: 8, fontSize: 12, fontFamily: 'var(--font-body)' }}
                            />
                            <Bar dataKey="rate" radius={[0, 4, 4, 0]} maxBarSize={20}>
                                {stats.byCategory.map((entry, i) => (
                                    <Cell
                                        key={i}
                                        fill={entry.rate > 50 ? '#f43f5e' : entry.rate > 30 ? '#f97316' : '#059669'}
                                        fillOpacity={0.75}
                                    />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            )}

            {/* By amount bracket */}
            <div>
                <p style={{ fontFamily: 'var(--font-display)', fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 10px' }}>Regret Rate by Amount</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                    {stats.byBracket.map(b => (
                        <div key={b.label} style={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '10px 12px' }}>
                            <p style={{ fontFamily: 'var(--font-body)', fontSize: '11px', color: 'var(--text-muted)', margin: '0 0 4px' }}>{b.label}</p>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '16px', fontWeight: 700, color: b.rate > 40 ? 'var(--color-exp)' : b.rate > 20 ? 'var(--color-warn)' : 'var(--color-inc)', fontVariantNumeric: 'tabular-nums' }}>{b.rate}%</span>
                                <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>{b.count} txns</span>
                            </div>
                            <div style={{ marginTop: 6, height: 4, borderRadius: 2, background: 'var(--border-subtle)' }}>
                                <div style={{ height: '100%', width: `${b.rate}%`, borderRadius: 2, background: b.rate > 40 ? 'var(--color-exp)' : b.rate > 20 ? 'var(--color-warn)' : 'var(--color-inc)', transition: 'width 0.4s ease' }} />
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
