'use client';

import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { fmt } from '@/lib/utils';

function CustomTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null;
    const date = new Date(label).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    return (
        <div style={{ background: 'var(--bg-surface-1)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: '10px 14px', fontSize: '0.8rem', boxShadow: 'var(--shadow-modal)' }}>
            <p style={{ color: 'var(--text-secondary)', margin: '0 0 4px', fontWeight: 600, fontFamily: 'var(--font-body)' }}>{date}</p>
            <p style={{ color: 'var(--text-primary)', margin: 0, fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{fmt(payload[0].value)}</p>
        </div>
    );
}

interface Props { chartData: { date: string; value: number }[] }

export function NetWorthAreaChart({ chartData }: Props) {
    return (
        <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={chartData}>
                <defs>
                    <linearGradient id="netWorthGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.25} />
                        <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                    </linearGradient>
                </defs>
                <XAxis dataKey="date" tickFormatter={d => new Date(d).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })} tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => '₹' + Math.round(v / 1000) + 'K'} width={56} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="value" stroke="var(--accent)" strokeWidth={2} fill="url(#netWorthGradient)" dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
            </AreaChart>
        </ResponsiveContainer>
    );
}
