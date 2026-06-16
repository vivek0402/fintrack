'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useAuthStore } from '@/store/authStore';
import { analyticsAPI } from '@/lib/api';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card } from '@/components/ui/Card';
import { SkeletonCard } from '@/components/ui/Skeleton';

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
    total_assets: number;
    total_liabilities: number;
}

function CustomTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null;
    const date = new Date(label).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    return (
        <div style={{ background: 'var(--bg-surface-1)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: '10px 14px', fontSize: '0.8rem', boxShadow: 'var(--shadow-modal)' }}>
            <p style={{ color: 'var(--text-secondary)', margin: '0 0 4px', fontWeight: 600, fontFamily: 'var(--font-body)' }}>{date}</p>
            <p style={{ color: 'var(--text-primary)', margin: 0, fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{fmt(payload[0].value)}</p>
        </div>
    );
}

export default function NetWorthPage() {
    const router = useRouter();
    const { user, isLoading, loadFromStorage } = useAuthStore();

    const [current, setCurrent] = useState<NetWorthCurrent | null>(null);
    const [history, setHistory] = useState<NetWorthSnapshot[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => { loadFromStorage(); }, []);
    useEffect(() => { if (!isLoading && !user) router.push('/login'); }, [user, isLoading]);

    useEffect(() => {
        if (!user) return;
        analyticsAPI.getNetWorth()
            .then(res => {
                setCurrent(res.data.current);
                setHistory(res.data.history || []);
            })
            .catch((err: any) => { if (err.response?.status === 401) router.push('/login'); })
            .finally(() => setLoading(false));
    }, [user]);

    if (isLoading || !user || loading || !current) {
        return (
            <AppLayout>
                <SkeletonCard height={120} style={{ marginBottom: '16px' }} />
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '16px' }}>
                    {[1, 2, 3].map(i => <SkeletonCard key={i} height={90} />)}
                </div>
                <SkeletonCard height={260} />
            </AppLayout>
        );
    }

    const last = history[history.length - 1];
    const prev = history.length >= 2 ? history[history.length - 2] : null;
    const change = prev ? last.net_worth - prev.net_worth : 0;
    const changePct = prev && prev.net_worth !== 0 ? (change / Math.abs(prev.net_worth)) * 100 : 0;
    const isGain = change >= 0;

    const chartData = history.map(h => ({ date: h.snapshot_date, value: h.net_worth }));

    return (
        <AppLayout>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingBottom: '24px', animation: 'fadeUp 200ms ease forwards' }}>

                {/* ── HERO ── */}
                <div style={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xl)', padding: '24px' }}>
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600, fontFamily: 'var(--font-body)' }}>
                        Net worth
                    </p>
                    <p style={{ fontFamily: 'var(--font-mono)', fontSize: '36px', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 8px', letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>
                        {fmt(current.net_worth)}
                    </p>
                    {history.length >= 2 && (
                        <p style={{ fontSize: '13px', fontWeight: 600, color: isGain ? 'var(--color-inc)' : 'var(--color-exp)', margin: 0, fontFamily: 'var(--font-mono)' }}>
                            {isGain ? '▲' : '▼'} {fmtSigned(change)} ({isGain ? '+' : ''}{changePct.toFixed(1)}%) from last month
                        </p>
                    )}
                </div>

                {/* ── BREAKDOWN ── */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' }}>
                    <Card>
                        <p style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 6px', fontFamily: 'var(--font-body)' }}>Total Assets</p>
                        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '22px', fontWeight: 700, color: 'var(--color-inc)', margin: 0, fontVariantNumeric: 'tabular-nums' }}>{fmt(current.total_assets)}</p>
                    </Card>
                    <Card>
                        <p style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 6px', fontFamily: 'var(--font-body)' }}>Total Liabilities</p>
                        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '22px', fontWeight: 700, color: 'var(--color-exp)', margin: 0, fontVariantNumeric: 'tabular-nums' }}>-{fmt(current.total_liabilities)}</p>
                    </Card>
                    <Card>
                        <p style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 6px', fontFamily: 'var(--font-body)' }}>Net Worth</p>
                        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)', margin: 0, fontVariantNumeric: 'tabular-nums' }}>{fmt(current.net_worth)}</p>
                    </Card>
                </div>

                {/* ── ASSETS / LIABILITIES DETAIL ── */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
                    <Card>
                        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 12px' }}>Assets</h3>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                            <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>Bank balances</span>
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{fmt(current.total_bank_balance)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
                            <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>Investment portfolio</span>
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{fmt(current.total_investments)}</span>
                        </div>
                    </Card>
                    <Card>
                        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 12px' }}>Liabilities</h3>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                            <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>Credit cards outstanding</span>
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{fmt(current.total_credit_outstanding)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
                            <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>Loans outstanding</span>
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{fmt(current.total_loans_outstanding)}</span>
                        </div>
                    </Card>
                </div>

                {/* ── HISTORY CHART ── */}
                <Card>
                    <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 12px' }}>History</h3>
                    {chartData.length < 2 ? (
                        <div style={{ height: '180px', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '0 24px' }}>
                            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)' }}>
                                Your net worth history will appear here as data builds up over time.
                            </p>
                        </div>
                    ) : (
                        <ResponsiveContainer width="100%" height={220}>
                            <AreaChart data={chartData}>
                                <defs>
                                    <linearGradient id="netWorthGradient" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.25} />
                                        <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <XAxis dataKey="date" tickFormatter={d => new Date(d).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })} tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => '₹' + Math.round(v / 1000) + 'K'} width={56} />
                                <Tooltip content={<CustomTooltip />} />
                                <Area type="monotone" dataKey="value" stroke="var(--accent)" strokeWidth={2} fill="url(#netWorthGradient)" dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
                            </AreaChart>
                        </ResponsiveContainer>
                    )}
                </Card>

                <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0, textAlign: 'center', fontFamily: 'var(--font-body)' }}>
                    Updated automatically each time you visit. Includes all tracked bank accounts, investments, and credit cards.
                </p>
            </div>
        </AppLayout>
    );
}
