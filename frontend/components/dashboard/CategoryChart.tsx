'use client';

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { formatCurrency } from '@/lib/utils';

interface Props { data: any[]; currency?: string; }

const PALETTE = ['#00e5a0', '#6366f1', '#f59e0b', '#8b5cf6', '#f43f5e', '#06b6d4', '#ec4899', '#14b8a6'];

function CustomTooltip({ active, payload, total, currency }: { active?: boolean; payload?: any[]; total: number; currency: string }) {
    if (!active || !payload?.length) return null;
    const item = payload[0];
    const pct = total > 0 ? ((item.value / total) * 100).toFixed(1) : 0;
    return (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--bg-border-strong)', borderRadius: '12px', padding: '10px 14px', fontSize: '0.8rem', boxShadow: 'var(--shadow-modal)' }}>
            <p style={{ color: item.payload.color, margin: 0, fontWeight: 600, fontFamily: "'Cabinet Grotesk', 'Sora', sans-serif" }}>{item.name}</p>
            <p style={{ color: 'var(--text-primary)', margin: '4px 0 0 0' }}>
                {formatCurrency(item.value, currency)} <span style={{ color: 'var(--text-secondary)' }}>({pct}%)</span>
            </p>
        </div>
    );
}

export function CategoryChart({ data, currency = 'INR' }: Props) {
    const total = data.reduce((sum, c) => sum + parseFloat(c.total), 0);
    const chartData = data.map((c, i) => ({ name: c.name, value: parseFloat(c.total), color: c.color || PALETTE[i % PALETTE.length] }));

    return (
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--bg-border)', borderRadius: '16px', padding: '20px', boxShadow: 'var(--shadow-card)' }}>
            <h3 style={{ fontFamily: "'Cabinet Grotesk', 'Sora', sans-serif", fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 16px 0' }}>
                Spending by Category
            </h3>
            {data.length === 0 ? (
                <div style={{ height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>No expense data yet</div>
            ) : (
                <>
                    <ResponsiveContainer width="100%" height={175}>
                        <PieChart>
                            <Pie
                                data={chartData} cx="50%" cy="50%"
                                innerRadius={50} outerRadius={76}
                                paddingAngle={3} dataKey="value" strokeWidth={0}
                                cornerRadius={4}
                                isAnimationActive={true}
                                animationDuration={800}
                                label={({ cx, cy }) => (
                                    <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle">
                                        <tspan x={cx} dy="-5" fontSize="10" fill="var(--text-muted)" fontFamily="Satoshi">Total</tspan>
                                        <tspan x={cx} dy="16" fontSize="13" fontWeight="700" fill="var(--text-primary)" fontFamily="DM Mono">₹{(total / 1000).toFixed(1)}k</tspan>
                                    </text>
                                )}
                                labelLine={false}
                            >
                                {chartData.map((c, i) => <Cell key={i} fill={c.color} />)}
                            </Pie>
                            <Tooltip content={<CustomTooltip total={total} currency={currency} />} />
                        </PieChart>
                    </ResponsiveContainer>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '7px', marginTop: '10px' }}>
                        {chartData.slice(0, 5).map(cat => {
                            const pct = total > 0 ? (cat.value / total) * 100 : 0;
                            return (
                                <div key={cat.name} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: cat.color, flexShrink: 0 }} />
                                    <span style={{ fontSize: '0.73rem', color: 'var(--text-secondary)', flex: 1 }}>{cat.name}</span>
                                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{pct.toFixed(0)}%</span>
                                    <span style={{ fontSize: '0.73rem', fontWeight: 600, color: 'var(--text-primary)', minWidth: '60px', textAlign: 'right' }}>{formatCurrency(cat.value, currency)}</span>
                                </div>
                            );
                        })}
                    </div>
                </>
            )}
        </div>
    );
}
