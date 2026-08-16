'use client';

import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { fmt } from '@/lib/utils';

interface Props {
    chartData: { month: number; cumulative_interest: number }[];
}

export function CumulativeInterestChart({ chartData }: Props) {
    return (
        <ResponsiveContainer width="100%" height={160}>
            <LineChart data={chartData}>
                <XAxis dataKey="month" tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => '₹' + Math.round(v / 1000) + 'K'} width={56} />
                <Tooltip
                    formatter={(value: any) => fmt(Number(value))}
                    labelFormatter={(label: any) => `Month ${label}`}
                    contentStyle={{ background: 'var(--bg-surface-1)', border: '1px solid var(--border-subtle)', borderRadius: 8, fontSize: 12, fontFamily: 'var(--font-body)' }}
                />
                <Line type="monotone" dataKey="cumulative_interest" stroke="var(--accent)" strokeWidth={2} dot={false} />
            </LineChart>
        </ResponsiveContainer>
    );
}
