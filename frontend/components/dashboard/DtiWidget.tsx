'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { debtAPI } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/Skeleton';

const fmt = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');

const DTI_COLORS: Record<string, string> = {
    excellent: 'var(--color-inc)',
    good: 'var(--accent)',
    moderate: 'var(--color-warn)',
    risky: 'var(--color-exp)',
};

const DTI_LABELS: Record<string, string> = {
    excellent: 'Excellent',
    good: 'Good',
    moderate: 'Moderate',
    risky: 'Risky',
};

function barColor(pct: number): string {
    if (pct < 20) return 'var(--color-inc)';
    if (pct <= 35) return 'var(--color-warn)';
    return 'var(--color-exp)';
}

interface DtiData {
    monthly_income: number;
    monthly_loan_emi: number;
    monthly_credit_obligation: number;
    total_monthly_debt_obligation: number;
    dti_ratio: number;
    status: string;
}

export function DtiWidget({ hasLoans, hasCards }: { hasLoans: boolean; hasCards: boolean }) {
    const [data, setData] = useState<DtiData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        debtAPI.getDti()
            .then(res => setData(res.data))
            .catch(() => {})
            .finally(() => setLoading(false));
    }, []);

    if (loading) {
        return (
            <Card>
                <Skeleton width="40%" height={12} style={{ marginBottom: 10 }} />
                <Skeleton width="60%" height={32} style={{ marginBottom: 10 }} />
                <Skeleton width="100%" height={40} />
            </Card>
        );
    }

    if (!data || (!hasLoans && !hasCards)) return null;

    const color = DTI_COLORS[data.status] || 'var(--text-primary)';
    const noIncome = data.monthly_income === 0;
    const barPct = Math.min(data.dti_ratio, 100);

    return (
        <Card>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600, fontFamily: 'var(--font-body)' }}>
                Debt-to-income ratio
            </p>

            {noIncome ? (
                <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '8px 0 12px', fontFamily: 'var(--font-body)' }}>
                    Add income transactions to see your DTI ratio.
                </p>
            ) : (
                <>
                    <p style={{ fontFamily: 'var(--font-mono)', fontSize: '28px', fontWeight: 800, color, margin: '0 0 6px', letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>
                        {data.dti_ratio.toFixed(1)}%
                    </p>
                    <div style={{ marginBottom: 12 }}>
                        <Badge color={color} bg={`color-mix(in srgb, ${color} 12%, transparent)`}>{DTI_LABELS[data.status] || data.status}</Badge>
                    </div>

                    <div style={{ height: '6px', background: 'var(--border-subtle)', borderRadius: '999px', overflow: 'hidden', marginBottom: 12 }}>
                        <div style={{ height: '100%', width: `${barPct}%`, background: barColor(data.dti_ratio), borderRadius: '999px', transition: 'width 0.8s cubic-bezier(.4,0,.2,1)' }} />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', fontFamily: 'var(--font-body)', color: 'var(--text-secondary)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>Monthly obligations</span>
                            <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', fontWeight: 600 }}>{fmt(data.total_monthly_debt_obligation)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>Monthly income</span>
                            <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', fontWeight: 600 }}>{fmt(data.monthly_income)}</span>
                        </div>
                    </div>
                </>
            )}

            <div style={{ marginTop: 12 }}>
                <Link href="/debt-intelligence" style={{ fontSize: '12px', fontWeight: 600, color: 'var(--accent)', textDecoration: 'none', fontFamily: 'var(--font-body)' }}>
                    View debt details →
                </Link>
            </div>
        </Card>
    );
}
