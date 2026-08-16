'use client';

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, CartesianGrid } from 'recharts';
import { fmt } from '@/lib/utils';

const fmtAbbrev = (n: number) => {
    const sign = n < 0 ? '-' : '';
    const abs = Math.abs(n);
    if (abs >= 1e7) return `${sign}₹${(abs / 1e7).toFixed(1)}Cr`;
    if (abs >= 1e5) return `${sign}₹${(abs / 1e5).toFixed(1)}L`;
    return `${sign}₹${Math.round(abs).toLocaleString('en-IN')}`;
};

function BalanceTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null;
    return (
        <div style={{ background: 'var(--bg-surface-1)', border: '1px solid var(--bg-border-strong)', borderRadius: 8, padding: '8px 12px' }}>
            <p style={{ color: 'var(--text-secondary)', margin: '0 0 4px', fontSize: 12, fontFamily: 'var(--font-body)' }}>{label}</p>
            <p style={{ margin: 0, fontSize: 13, fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--text-primary)' }}>{fmt(payload[0].value)}</p>
        </div>
    );
}

interface Props {
    months: { month: string; running_balance: number }[];
    balanceLineColor: string;
}

export function RunningBalanceChart({ months, balanceLineColor }: Props) {
    return (
        <ResponsiveContainer>
            <LineChart data={months}>
                <CartesianGrid vertical={false} stroke="var(--bg-border)" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fontFamily: 'var(--font-mono)', fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} />
                <YAxis tickFormatter={fmtAbbrev} tick={{ fontSize: 11, fontFamily: 'var(--font-mono)', fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} width={70} />
                <Tooltip content={<BalanceTooltip />} />
                <ReferenceLine y={0} stroke="var(--bg-border-strong)" />
                <Line type="monotone" dataKey="running_balance" name="Running Balance" stroke={balanceLineColor} strokeWidth={1.5} dot={false} animationDuration={600} />
            </LineChart>
        </ResponsiveContainer>
    );
}
