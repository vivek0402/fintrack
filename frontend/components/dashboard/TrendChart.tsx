'use client';

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

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
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: p.stroke, flexShrink: 0 }} />
                        <p style={{ color: 'var(--text-primary)', margin: 0 }}>{p.name}: <strong>₹{Math.round(p.value ?? 0).toLocaleString('en-IN')}</strong></p>
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
                    <AreaChart data={chartData}>
                        <defs>
                            <linearGradient id="incomeGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                                <stop offset="100%" stopColor="#10b981" stopOpacity={0.0} />
                            </linearGradient>
                            <linearGradient id="expenseGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.3} />
                                <stop offset="100%" stopColor="#f43f5e" stopOpacity={0.0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-border)" vertical={false} />
                        <XAxis dataKey="month" tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => '₹' + Math.round(v / 1000) + 'k'} width={48} />
                        <Tooltip content={<CustomTooltip />} />
                        <Legend wrapperStyle={{ fontSize: '0.78rem', paddingTop: '14px' }} />
                        <Area type="monotone" dataKey="income" name="Income" stroke="#10b981" strokeWidth={2} fill="url(#incomeGradient)" dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
                        <Area type="monotone" dataKey="expenses" name="Expenses" stroke="#f43f5e" strokeWidth={2} fill="url(#expenseGradient)" dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
                    </AreaChart>
                </ResponsiveContainer>
            )}
        </div>
    );
}
