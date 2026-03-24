'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

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
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--bg-border)', borderRadius: '12px', padding: '12px 16px', fontSize: '0.8rem' }}>
                <p style={{ color: 'var(--text-secondary)', margin: '0 0 8px 0', fontWeight: 600 }}>{label}</p>
                {payload.map((p: any) => (
                    <p key={p.name} style={{ color: p.stroke, margin: '4px 0' }}>
                        {p.name}: ₹{p.value?.toLocaleString('en-IN')}
                    </p>
                ))}
            </div>
        );
    };

    return (
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--bg-border)', borderRadius: '16px', padding: '20px' }}>
            <h3 style={{ fontFamily: 'Sora, sans-serif', fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 20px 0' }}>
                Income vs Expenses Trend
            </h3>
            {chartData.length === 0 ? (
                <div style={{ height: '200px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                    No data yet — add transactions to see trends
                </div>
            ) : (
                <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-border)" vertical={false} />
                        <XAxis dataKey="month" tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`} />
                        <Tooltip content={<CustomTooltip />} />
                        <Legend wrapperStyle={{ fontSize: '0.8rem', paddingTop: '16px' }} />
                        <Line type="monotone" dataKey="income" name="Income" stroke="#10b981" strokeWidth={2} dot={{ fill: '#10b981', r: 4 }} />
                        <Line type="monotone" dataKey="expenses" name="Expenses" stroke="#f43f5e" strokeWidth={2} dot={{ fill: '#f43f5e', r: 4 }} />
                    </LineChart>
                </ResponsiveContainer>
            )}
        </div>
    );
}