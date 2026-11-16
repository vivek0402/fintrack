'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { debtAPI } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { CardHeader, Rows, TextAction } from '@/components/ui/CardParts';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Skeleton } from '@/components/ui/Skeleton';
import { fmt } from '@/lib/utils';
import { type } from '@/lib/typography';

const DTI_LABELS: Record<string, string> = {
    excellent: 'Excellent',
    good: 'Good',
    moderate: 'Moderate',
    risky: 'Risky',
};

interface DtiData {
    monthly_income: number;
    monthly_loan_emi: number;
    monthly_credit_obligation: number;
    total_monthly_debt_obligation: number;
    dti_ratio: number;
    status: string;
}

export function DtiWidget({ hasLoans, hasCards }: { hasLoans: boolean; hasCards: boolean }) {
    const router = useRouter();
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

    const noIncome = data.monthly_income === 0;
    const label = DTI_LABELS[data.status] || data.status;

    return (
        <Card>
            <CardHeader
                title="Debt-to-income ratio"
                sub="Debt payments as a share of income"
                action={<TextAction onClick={() => router.push('/debt-intelligence')}>Open</TextAction>}
            />

            {noIncome ? (
                <p style={{ ...type.meta, margin: 0 }}>Add income transactions to see your DTI ratio.</p>
            ) : (
                <>
                    <p className="type-display" style={{ ...type.display, margin: 0 }}>{data.dti_ratio.toFixed(1)}%</p>
                    <p style={{ ...type.meta, margin: '6px 0 var(--space-3)' }}>
                        {data.status === 'good' ? `${label}. Under 36% is considered healthy.` : `${label}.`}
                    </p>
                    <ProgressBar pct={Math.min(data.dti_ratio, 100)} height={4} color="var(--text-secondary)" />
                    <div style={{ marginTop: 'var(--space-4)' }}>
                        <Rows>
                            <div style={{ justifyContent: 'space-between' }}>
                                <span style={type.bodyStrong}>Monthly obligations</span>
                                <span style={type.num}>{fmt(data.total_monthly_debt_obligation)}</span>
                            </div>
                            <div style={{ justifyContent: 'space-between' }}>
                                <span style={type.bodyStrong}>Monthly income</span>
                                <span style={type.num}>{fmt(data.monthly_income)}</span>
                            </div>
                        </Rows>
                    </div>
                </>
            )}
        </Card>
    );
}
