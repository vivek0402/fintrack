'use client';

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { fmt } from '@/lib/utils';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

interface Props {
    allocations: { category: string; label: string; amount: number }[];
    colors: string[];
}

export function AllocationPieChart({ allocations, colors }: Props) {
    const prefersReducedMotion = usePrefersReducedMotion();
    return (
        <ResponsiveContainer width="100%" height={180}>
            <PieChart>
                <Pie data={allocations} dataKey="amount" nameKey="label" innerRadius={50} outerRadius={80} paddingAngle={2} animationDuration={prefersReducedMotion ? 0 : 600}>
                    {allocations.map((_, i) => (
                        <Cell key={i} fill={colors[i % colors.length]} />
                    ))}
                </Pie>
                <Tooltip formatter={(value: any) => fmt(Number(value))} />
            </PieChart>
        </ResponsiveContainer>
    );
}
