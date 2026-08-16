'use client';

import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, CartesianGrid, Cell } from 'recharts';
import { fmt } from '@/lib/utils';

const fmtAbbrev = (n: number) => {
    const sign = n < 0 ? '-' : '';
    const abs = Math.abs(n);
    if (abs >= 1e7) return `${sign}₹${(abs / 1e7).toFixed(1)}Cr`;
    if (abs >= 1e5) return `${sign}₹${(abs / 1e5).toFixed(1)}L`;
    return `${sign}₹${Math.round(abs).toLocaleString('en-IN')}`;
};

// Duplicated from app/cash-flow/page.tsx (used elsewhere in the page too)
// rather than threaded through as a prop -- keeps this component self-contained.
const fmtSigned = (n: number) => (n >= 0 ? '+' : '-') + '₹' + Math.round(Math.abs(n)).toLocaleString('en-IN');

interface CashflowMonth {
    month: string;
    projected_income: number;
    projected_expenses: number;
    fixed_outflows: number;
    net_cashflow: number;
}

function WaterfallTooltip({ active, payload }: any) {
    if (!active || !payload?.length) return null;
    const d: CashflowMonth = payload[0].payload;
    return (
        <div style={{ background: 'var(--bg-surface-1)', border: '1px solid var(--bg-border-strong)', borderRadius: 8, padding: '10px 12px' }}>
            <p style={{ color: 'var(--text-secondary)', margin: '0 0 6px', fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-body)' }}>{d.month}</p>
            <p style={{ margin: '0 0 2px', fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>Income: <span style={{ color: 'var(--text-primary)' }}>{fmt(d.projected_income)}</span></p>
            <p style={{ margin: '0 0 2px', fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>Expenses: <span style={{ color: 'var(--text-primary)' }}>{fmt(d.projected_expenses)}</span></p>
            <p style={{ margin: '0 0 2px', fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>Fixed outflows: <span style={{ color: 'var(--text-primary)' }}>{fmt(d.fixed_outflows)}</span></p>
            <p style={{ margin: '4px 0 0', fontSize: 13, fontFamily: 'var(--font-mono)', fontWeight: 700, color: d.net_cashflow >= 0 ? 'var(--color-inc)' : 'var(--color-exp)' }}>
                Net: {fmtSigned(d.net_cashflow)}
            </p>
        </div>
    );
}

interface Props { months: CashflowMonth[] }

export function WaterfallChart({ months }: Props) {
    return (
        <ResponsiveContainer>
            <BarChart data={months}>
                <CartesianGrid vertical={false} stroke="var(--bg-border)" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fontFamily: 'var(--font-mono)', fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} />
                <YAxis tickFormatter={fmtAbbrev} tick={{ fontSize: 11, fontFamily: 'var(--font-mono)', fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} width={70} />
                <Tooltip content={<WaterfallTooltip />} />
                <ReferenceLine y={0} stroke="var(--bg-border-strong)" />
                <Bar dataKey="net_cashflow" name="Net Cash Flow" radius={[4, 4, 4, 4]} animationDuration={600}>
                    {months.map((m, i) => (
                        <Cell key={i} fill={m.net_cashflow >= 0 ? 'var(--color-inc)' : 'var(--color-exp)'} />
                    ))}
                </Bar>
            </BarChart>
        </ResponsiveContainer>
    );
}
