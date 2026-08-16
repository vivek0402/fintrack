'use client';

import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, ReferenceDot, CartesianGrid } from 'recharts';

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

interface Props {
    portfolioProjection: { year: number; portfolio_value: number | null }[];
    corpusNeededReal: number;
    crossingYear: number | null;
}

export function PortfolioGrowthChart({ portfolioProjection, corpusNeededReal, crossingYear }: Props) {
    return (
        <ResponsiveContainer>
            <AreaChart data={portfolioProjection}>
                <defs>
                    <linearGradient id="fireGrowth" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--color-inc)" stopOpacity={0.2} />
                        <stop offset="100%" stopColor="var(--color-inc)" stopOpacity={0} />
                    </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="var(--border-subtle)" />
                <XAxis dataKey="year" tick={{ fontSize: 11, fontFamily: 'var(--font-mono)', fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} label={{ value: 'Years from today', position: 'insideBottom', offset: -2, fontSize: 11, fill: 'var(--text-muted)' }} />
                <YAxis tickFormatter={fmtAbbrev} tick={{ fontSize: 11, fontFamily: 'var(--font-mono)', fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} width={70} />
                <Tooltip content={<ChartTooltip />} />
                <Area type="monotone" dataKey="portfolio_value" name="Portfolio" stroke="var(--color-inc)" strokeWidth={1.5} fill="url(#fireGrowth)" animationDuration={600} />
                <ReferenceLine y={corpusNeededReal} stroke="var(--color-warn)" strokeDasharray="4 4" label={{ value: 'FIRE number', position: 'insideTopRight', fontSize: 11, fill: 'var(--color-warn)' }} />
                {crossingYear !== null && (
                    <ReferenceDot x={crossingYear} y={corpusNeededReal} r={5} fill="var(--color-warn)" stroke="var(--bg-surface-1)" strokeWidth={2} />
                )}
            </AreaChart>
        </ResponsiveContainer>
    );
}
