'use client';

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { formatCurrency } from '@/lib/utils';

interface Props { data: any[]; currency?: string; }

export function CategoryChart({ data, currency = 'INR' }: Props) {
    const total = data.reduce((sum, c) => sum + parseFloat(c.total), 0);

    const CustomTooltip = ({ active, payload }: any) => {
        if (!active || !payload?.length) return null;
        const item = payload[0];
        const pct = total > 0 ? ((item.value / total) * 100).toFixed(1) : 0;
        return (
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--bg-border)', borderRadius: '12px', padding: '10px 14px', fontSize: '0.8rem' }}>
                <p style={{ color: item.payload.color, margin: 0, fontWeight: 600 }}>{item.name}</p>
                <p style={{ color: 'var(--text-primary)', margin: '4px 0 0 0' }}>{formatCurrency(item.value, currency)} ({pct}%)</p>
            </div>
        );
    };

    return (
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--bg-border)', borderRadius: '16px', padding: '20px' }}>
            <h3 style={{ fontFamily: 'Sora, sans-serif', fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 16px 0' }}>
                Spending by Category
            </h3>
            {data.length === 0 ? (
                <div style={{ height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                    No expense data yet
                </div>
            ) : (
                <>
                    <ResponsiveContainer width="100%" height={180}>
                        <PieChart>
                            <Pie data={data.map(c => ({ name: c.name, value: parseFloat(c.total), color: c.color }))} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                                {data.map((c, i) => <Cell key={i} fill={c.color} />)}
                            </Pie>
                            <Tooltip content={<CustomTooltip />} />
                        </PieChart>
                    </ResponsiveContainer>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
                        {data.slice(0, 4).map(cat => (
                            <div key={cat.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: cat.color }} />
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{cat.name}</span>
                                </div>
                                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                                    {formatCurrency(parseFloat(cat.total), currency)}
                                </span>
                            </div>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}