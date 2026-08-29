'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { LineChart, Line, ResponsiveContainer } from 'recharts';
import { analyticsAPI } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';

const fmt = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');
const fmtSigned = (n: number) => (n >= 0 ? '+' : '-') + '₹' + Math.round(Math.abs(n)).toLocaleString('en-IN');

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
    const [current, setCurrent] = useState<NetWorthCurrent | null>(null);
    const [history, setHistory] = useState<NetWorthSnapshot[]>([]);
    const [loading, setLoading] = useState(true);

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

    const last = history[history.length - 1];
    const prev = history.length >= 2 ? history[history.length - 2] : null;
    const change = prev ? last.net_worth - prev.net_worth : 0;
    const isGain = change >= 0;

    const last6 = history.slice(-6);

    return (
        <Card>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
                <div style={{ flex: '1 1 auto', minWidth: 0 }}>
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600, fontFamily: 'var(--font-body)' }}>
                        Net worth
                    </p>
                    <p style={{ fontFamily: 'var(--font-mono)', fontSize: '26px', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 4px', letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>
                        {fmt(current.net_worth)}
                    </p>
                    {history.length >= 2 && (
                        <p style={{ fontSize: '12px', fontWeight: 600, color: isGain ? 'var(--color-inc)' : 'var(--color-exp)', margin: 0, fontFamily: 'var(--font-mono)' }}>
                            {isGain ? '▲' : '▼'} {fmtSigned(change)} this month
                        </p>
                    )}
                </div>
                {last6.length >= 2 && (
                    <div style={{ width: 110, height: 40, flexShrink: 0 }}>
                        <ResponsiveContainer width="100%" height={40}>
                            <LineChart data={last6}>
                                <Line type="monotone" dataKey="net_worth" stroke="var(--accent)" strokeWidth={2} dot={false} isAnimationActive={false} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                )}
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '14px 0 12px' }}>
                <span className="glass-field" style={{ fontSize: '11px', fontWeight: 600, padding: '4px 10px', borderRadius: 999, color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>
                    Banks {fmt(current.total_bank_balance)}
                </span>
                <span className="glass-field" style={{ fontSize: '11px', fontWeight: 600, padding: '4px 10px', borderRadius: 999, color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>
                    Investments {fmt(current.total_investments)}
                </span>
                <span className="glass-field" style={{ fontSize: '11px', fontWeight: 600, padding: '4px 10px', borderRadius: 999, color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>
                    Debt -{fmt(current.total_liabilities)}
                </span>
            </div>

            <Link href="/net-worth" style={{ fontSize: '12px', fontWeight: 600, color: 'var(--accent)', textDecoration: 'none', fontFamily: 'var(--font-body)' }}>
                Full breakdown →
            </Link>
        </Card>
    );
}
