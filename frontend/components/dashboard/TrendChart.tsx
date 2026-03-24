'use client';

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface Props { trends: any[] }

const MONTH_NAMES = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function TrendChart({ trends }: Props) {
    const chartData = (() => {
        const map: Record<string, any> = {};
        trends.forEach(row => {
            const key = `${row.year}-${row.month}`;
            if (!map[key]) map[key] = { month: MONTH_NAMES[row.month], income: 0, expenses: 0 };
            if (row.type === 'income') map[key].income = parseFloat(row.total);
            if (row.type === 'expense') map[key].expenses = parseFloat(row.total);
        });
        return Object.values(map);
    })();

    const CustomTooltip = ({ active, payload, label }: any) => {
        if (!active || !payload?.length) return null;
        return (
            <div style={{
                background: 'var(--glass-bg)', border: '1px solid var(--glass-border)',
                borderRadius: '12px', padding: '12px 16px', fontSize: '0.8rem',
                backdropFilter: 'blur(12px)', boxShadow: 'var(--shadow-modal)',
            }}>
                <p style={{ color: 'var(--text-secondary)', margin: '0 0 8px 0', fontWeight: 600, fontFamily: 'Sora, sans-serif' }}>{label}</p>
                {payload.map((p: any) => (
                    <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '4px 0' }}>
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: p.fill, flexShrink: 0 }} />
                        <p style={{ color: 'var(--text-primary)', margin: 0 }}>{p.name}: <strong>₹{p.value?.toLocaleString('en-IN')}</strong></p>
                    </div>
                ))}
            </div>
        );
    };

    return (
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--bg-border)', borderRadius: '16px', padding: '20px', boxShadow: 'var(--shadow-card)' }}>
            <h3 style={{ fontFamily: 'Sora, sans-serif', fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 20px 0' }}>
                Income vs Expenses
            </h3>
            {chartData.length === 0 ? (
                <div style={{ height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                    No data yet — add transactions to see trends
                </div>
            ) : (
                <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={chartData} barGap={4} barCategoryGap="30%">
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-border)" vertical={false} />
                        <XAxis dataKey="month" tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`} width={48} />
                        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'var(--bg-hover)' } as any} />
                        <Legend wrapperStyle={{ fontSize: '0.78rem', paddingTop: '14px' }} />
                        <Bar dataKey="income" name="Income" fill="var(--accent-green)" radius={[6, 6, 0, 0]} />
                        <Bar dataKey="expenses" name="Expenses" fill="var(--accent-red)" radius={[6, 6, 0, 0]} />
                    </BarChart>
                </ResponsiveContainer>
            )}
        </div>
    );
}
