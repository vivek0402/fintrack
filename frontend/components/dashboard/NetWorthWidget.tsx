'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LineChart, Line, ResponsiveContainer } from 'recharts';
import { analyticsAPI } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { CardHeader, TextAction } from '@/components/ui/CardParts';
import { Skeleton } from '@/components/ui/Skeleton';
import { useChartAnimation } from '@/hooks/useChartAnimation';
import { fmt } from '@/lib/utils';
import { type } from '@/lib/typography';
import { monthChangeSentence } from '@/lib/netWorth';

interface NetWorthCurrent {
    total_bank_balance: number;
    total_investments: number;
    total_assets: number;
    total_credit_outstanding: number;
    total_loans_outstanding: number;
    total_liabilities: number;
    net_worth: number;
}

interface NetWorthSnapshot {
    snapshot_date: string;
    net_worth: number;
}

export function NetWorthWidget() {
    const router = useRouter();
    const [current, setCurrent] = useState<NetWorthCurrent | null>(null);
    const [history, setHistory] = useState<NetWorthSnapshot[]>([]);
    const [loading, setLoading] = useState(true);
    const chartAnim = useChartAnimation('dashboard-net-worth', 600);

    useEffect(() => {
        analyticsAPI.getNetWorth()
            .then(res => {
                setCurrent(res.data.current);
                setHistory(res.data.history || []);
            })
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

    if (!current || (current.net_worth === 0 && history.length === 0)) return null;

    const changeLine = monthChangeSentence(history);
    const last6 = history.slice(-6);

    return (
        <Card>
            <CardHeader
                title="Net worth"
                sub="Assets minus what you owe"
                action={<TextAction onClick={() => router.push('/net-worth')}>Open</TextAction>}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-4)' }}>
                <div style={{ flex: '1 1 auto', minWidth: 0 }}>
                    <p className="type-display" style={{ ...type.display, margin: 0 }}>{fmt(current.net_worth)}</p>
                    {changeLine && <p style={{ ...type.meta, margin: '6px 0 0' }}>{changeLine}</p>}
                </div>
                {last6.length >= 2 && (
                    <div style={{ width: 110, height: 40, flexShrink: 0 }}>
                        <ResponsiveContainer width="100%" height={40}>
                            <LineChart data={last6}>
                                <Line type="monotone" dataKey="net_worth" stroke="var(--accent)" strokeWidth={2} dot={false} {...chartAnim} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </div>
            <p style={{ ...type.meta, margin: 'var(--space-4) 0 0' }}>
                Banks <span style={type.numSmall}>{fmt(current.total_bank_balance)}</span>
                {' · '}Investments <span style={type.numSmall}>{fmt(current.total_investments)}</span>
                {' · '}Debt <span style={type.numSmall}>{fmt(current.total_liabilities)}</span>
            </p>
        </Card>
    );
}
