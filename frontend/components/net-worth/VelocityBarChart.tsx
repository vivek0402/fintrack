'use client';

import { BarChart, Bar, XAxis, Cell, Tooltip, ResponsiveContainer } from 'recharts';

// Duplicated from app/net-worth/page.tsx (a local, page-only one-liner, not
// in lib/utils) rather than threaded through as a prop -- keeps this
// component self-contained for its only two call sites (chart + tooltip).
const fmtSigned = (n: number) => (n >= 0 ? '+' : '-') + '₹' + Math.round(Math.abs(n)).toLocaleString('en-IN');

function VelocityTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null;
    const date = new Date(label).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    return (
        <div style={{ background: 'var(--bg-surface-1)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: '10px 14px', fontSize: '0.8rem', boxShadow: 'var(--shadow-modal)' }}>
            <p style={{ color: 'var(--text-secondary)', margin: '0 0 4px', fontWeight: 600, fontFamily: 'var(--font-body)' }}>{date}</p>
            <p style={{ color: payload[0].value >= 0 ? 'var(--color-inc)' : 'var(--color-exp)', margin: 0, fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{fmtSigned(payload[0].value)}</p>
        </div>
    );
}

interface Props { allMomChanges: { to_date: string; absolute_change: number }[] }

export function VelocityBarChart({ allMomChanges }: Props) {
    return (
        <ResponsiveContainer width="100%" height={140}>
            <BarChart data={allMomChanges}>
                <XAxis dataKey="to_date" tickFormatter={d => new Date(d).toLocaleDateString('en-IN', { month: 'short' })} tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip content={<VelocityTooltip />} />
                <Bar dataKey="absolute_change" radius={[3, 3, 3, 3]} isAnimationActive={false}>
                    {allMomChanges.map((d, i) => (
                        <Cell key={i} fill={d.absolute_change >= 0 ? 'var(--color-inc)' : 'var(--color-exp)'} />
                    ))}
                </Bar>
            </BarChart>
        </ResponsiveContainer>
    );
}
