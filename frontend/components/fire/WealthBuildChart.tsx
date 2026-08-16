'use client';

import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts';

const fmtAbbrev = (n: number) => {
    const sign = n < 0 ? '-' : '';
    const abs = Math.abs(n);
    if (abs >= 1e7) return `${sign}₹${(abs / 1e7).toFixed(1)}Cr`;
    if (abs >= 1e5) return `${sign}₹${(abs / 1e5).toFixed(1)}L`;
    return `${sign}₹${Math.round(abs).toLocaleString('en-IN')}`;
};

function ChartTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null;
    return (
        <div style={{ background: 'var(--bg-surface-1)', border: '1px solid var(--bg-border-strong)', borderRadius: 8, padding: '8px 12px' }}>
            <p style={{ color: 'var(--text-secondary)', margin: '0 0 4px', fontSize: 12, fontFamily: 'var(--font-body)' }}>Year {label}</p>
            {payload.map((p: any, i: number) => (
                <p key={i} style={{ color: p.color, margin: 0, fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 13 }}>
                    {p.name}: {fmtAbbrev(p.value)}
                </p>
            ))}
        </div>
    );
}

interface Props { sipChartData: { year: number; invested: number; returns: number }[] }

export function WealthBuildChart({ sipChartData }: Props) {
    return (
        <ResponsiveContainer>
            <BarChart data={sipChartData}>
                <CartesianGrid vertical={false} stroke="var(--bg-border)" />
                <XAxis dataKey="year" tick={{ fontSize: 11, fontFamily: 'var(--font-mono)', fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} />
                <YAxis tickFormatter={fmtAbbrev} tick={{ fontSize: 11, fontFamily: 'var(--font-mono)', fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} width={70} />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12, fontFamily: 'var(--font-body)' }} />
                <Bar dataKey="invested" name="Invested" stackId="a" fill="var(--text-muted)" animationDuration={600} />
                <Bar dataKey="returns" name="Returns" stackId="a" fill="var(--color-inc)" radius={[4, 4, 0, 0]} animationDuration={600} />
            </BarChart>
        </ResponsiveContainer>
    );
}
