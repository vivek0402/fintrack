'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { aiAPI } from '@/lib/api';
import { AppLayout } from '@/components/layout/AppLayout';
import { GCard } from '@/components/ui/GCard';
import { Badge } from '@/components/ui/Badge';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { Button } from '@/components/ui/Button';
import {
    Banknote, Loader2, AlertTriangle, Lightbulb,
    PiggyBank, Home, ShoppingBag, Car, TrendingUp, Sparkles,
} from 'lucide-react';

const fmt = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

const card: React.CSSProperties = {
    background: 'var(--bg-card)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)',
    padding: '20px 24px',
};

// Allocation plan category colours — stored data values, not CSS tokens
const PLAN_META: Record<string, { label: string; color: string; bg: string; icon: any }> = {
    savings:       { label: 'Savings',       color: '#00e5a0', bg: 'rgba(0,229,160,0.12)',  icon: PiggyBank },
    rent:          { label: 'Rent / Housing', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', icon: Home },
    food:          { label: 'Food',           color: '#6366f1', bg: 'rgba(99,102,241,0.12)', icon: ShoppingBag },
    transport:     { label: 'Transport',      color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)', icon: Car },
    investments:   { label: 'Investments',    color: '#06b6d4', bg: 'rgba(6,182,212,0.12)',  icon: TrendingUp },
    discretionary: { label: 'Discretionary',  color: '#f43f5e', bg: 'rgba(244,63,94,0.12)', icon: Sparkles },
};

export default function SalaryIntelligencePage() {
    const router = useRouter();
    const { user, isLoading, loadFromStorage } = useAuthStore();
    const [data, setData]         = useState<any>(null);
    const [loading, setLoading]   = useState(false);
    const [generated, setGenerated] = useState(false);
    const [error, setError]       = useState('');

    useEffect(() => { loadFromStorage(); }, []);
    useEffect(() => { if (!isLoading && !user) router.push('/login'); }, [user, isLoading]);

    const analyse = async (force = false) => {
        setLoading(true); setError('');
        try {
            const res = await aiAPI.salaryIntelligence();
            setData(res.data); setGenerated(true);
        } catch (err: any) {
            setError(err?.response?.data?.error || err?.response?.data?.message || 'Failed to analyse salary pattern. Please try again.');
            setData(null);
        } finally { setLoading(false); }
    };

    if (isLoading || !user) return (
        <AppLayout>
            <SkeletonCard height={80} style={{ marginBottom: '16px' }} />
            <SkeletonCard height={300} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </AppLayout>
    );

    const planEntries: [string, any][] = data?.plan ? Object.entries(data.plan) : [];
    const totalPct = planEntries.reduce((s, [, v]) => s + (v?.percentage ?? 0), 0);

    return (
        <AppLayout>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingBottom: '24px', animation: 'fadeUp 200ms ease forwards' }}>

                {/* Header */}
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', padding: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 3px' }}>Salary Intelligence</h1>
                            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)' }}>Income benchmarking</p>
                        </div>
                        {generated && !loading && (
                            <Button variant="secondary" size="md" onClick={() => analyse()}>Refresh</Button>
                        )}
                    </div>
                </div>

                {/* Empty */}
                {!generated && !loading && !error && (
                    <div style={{ textAlign: 'center', padding: '48px 24px' }}>
                        <p style={{ fontSize: '48px', marginBottom: '12px' }}>💰</p>
                        <p style={{ fontFamily: 'var(--font-head)', fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 8px' }}>No data yet</p>
                        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 20px', fontFamily: 'var(--font-body)' }}>Add income transactions so we can detect your salary and generate a personalised allocation plan</p>
                        <Button variant="primary" size="md" onClick={() => analyse()}><Banknote size={15} /> Analyse Salary Pattern</Button>
                    </div>
                )}

                {/* Loading */}
                {loading && (
                    <div style={{ ...card, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px', gap: '16px' }}>
                        <Loader2 size={28} color="var(--color-inc)" style={{ animation: 'spin 1s linear infinite' }} />
                        <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: 0, fontFamily: 'var(--font-body)' }}>Detecting your salary pattern…</p>
                    </div>
                )}

                {/* Error */}
                {error && !loading && (
                    <div style={{ ...card, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px', padding: '40px' }}>
                        <AlertTriangle size={28} color="var(--color-exp)" />
                        <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: 0, textAlign: 'center', fontFamily: 'var(--font-body)' }}>{error}</p>
                        <button type="button" onClick={() => analyse()} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 20px', color: 'var(--text-primary)', fontSize: '14px', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>Try again</button>
                    </div>
                )}

                {/* Not detected */}
                {generated && data && !data.detected && !loading && (
                    <div style={{ ...card, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', padding: '50px 40px', textAlign: 'center' }}>
                        <Banknote size={36} color="var(--text-muted)" />
                        <h3 style={{ fontFamily: 'var(--font-head)', fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>No salary pattern detected</h3>
                        <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.6, maxWidth: '360px', fontFamily: 'var(--font-body)' }}>
                            We need at least one income transaction to detect your salary. Add your salary or income transactions to unlock this feature.
                        </p>
                        <button type="button" onClick={() => router.push('/transactions')} style={{ background: 'var(--accent)', border: 'none', borderRadius: 'var(--radius-md)', padding: '10px 20px', color: 'white', fontSize: '14px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                            Add Income Transactions
                        </button>
                    </div>
                )}

                {/* Result */}
                {generated && data && data.detected && !loading && (
                    <>
                        {/* Salary hero */}
                        <GCard style={{ background: 'color-mix(in srgb, var(--color-inc) 6%, var(--bg-card))', border: '1px solid color-mix(in srgb, var(--color-inc) 20%, transparent)' }}>
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '20px', flexWrap: 'wrap' }}>
                                <div style={{ width: '56px', height: '56px', borderRadius: 'var(--radius-lg)', background: 'color-mix(in srgb, var(--color-inc) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--color-inc) 25%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                    <Banknote size={26} color="var(--color-inc)" />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '6px' }}>
                                        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '28px', fontWeight: 700, color: 'var(--color-inc)', margin: 0, fontVariantNumeric: 'tabular-nums' }}>{fmt(data.salary)}</p>
                                        {data.from_cache && <Badge>Cached</Badge>}
                                    </div>
                                    <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: '0 0 4px', fontFamily: 'var(--font-body)' }}>{data.description || 'Monthly salary detected'}</p>
                                    {data.insight && <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0, lineHeight: 1.5, fontStyle: 'italic', fontFamily: 'var(--font-body)' }}>"{data.insight}"</p>}
                                </div>
                            </div>
                        </GCard>

                        {/* Allocation plan */}
                        {planEntries.length > 0 && (
                            <div style={card}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
                                    <TrendingUp size={16} color="var(--accent)" />
                                    <span style={{ fontFamily: 'var(--font-head)', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>AI Salary Allocation Plan</span>
                                    <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: '4px', fontFamily: 'var(--font-body)' }}>Based on your spending</span>
                                </div>

                                {/* Visual bar */}
                                <div style={{ display: 'flex', height: '10px', borderRadius: '5px', overflow: 'hidden', marginBottom: '20px', gap: '2px' }}>
                                    {planEntries.map(([key, val]) => {
                                        const meta = PLAN_META[key] || { color: 'var(--text-muted)', bg: 'transparent', label: key, icon: Sparkles };
                                        return <div key={key} style={{ height: '100%', width: `${val?.percentage ?? 0}%`, background: meta.color, transition: 'width 0.6s ease', borderRadius: '2px' }} />;
                                    })}
                                </div>

                                {/* Legend */}
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '20px' }}>
                                    {planEntries.map(([key, val]) => {
                                        const meta = PLAN_META[key] || { color: 'var(--text-muted)', bg: 'transparent', label: key, icon: Sparkles };
                                        return (
                                            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: meta.color, flexShrink: 0 }} />
                                                <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>{meta.label} {val?.percentage}%</span>
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Rows */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    {planEntries.map(([key, val]) => {
                                        const meta = PLAN_META[key] || { color: 'var(--text-muted)', bg: 'transparent', label: key, icon: Sparkles };
                                        const IconCmp = meta.icon;
                                        const pct = val?.percentage ?? 0;
                                        return (
                                            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 16px', borderRadius: 'var(--radius-md)', background: meta.bg, border: `1px solid ${meta.color}22` }}>
                                                <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: `${meta.color}25`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                    <IconCmp size={18} color={meta.color} />
                                                </div>
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 2px', fontFamily: 'var(--font-head)' }}>{meta.label}</p>
                                                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: 'var(--font-body)' }}>{val?.reason || ''}</p>
                                                </div>
                                                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                                    <p style={{ fontFamily: 'var(--font-mono)', fontSize: '16px', fontWeight: 700, color: meta.color, margin: '0 0 2px', fontVariantNumeric: 'tabular-nums' }}>{fmt(val?.amount ?? 0)}</p>
                                                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)' }}>{pct}%</p>
                                                </div>
                                                <div style={{ width: '60px', flexShrink: 0 }}>
                                                    <div style={{ height: '6px', background: 'var(--border)', borderRadius: '3px', overflow: 'hidden' }}>
                                                        <div style={{ height: '100%', width: totalPct > 0 ? `${(pct / Math.max(totalPct, 100)) * 100}%` : '0%', background: meta.color, borderRadius: '3px' }} />
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
                                    <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 600, fontFamily: 'var(--font-body)' }}>Total allocated</span>
                                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '16px', fontWeight: 700, color: totalPct >= 98 ? 'var(--color-inc)' : 'var(--color-warn)', fontVariantNumeric: 'tabular-nums' }}>
                                        {fmt(planEntries.reduce((s, [, v]) => s + (v?.amount ?? 0), 0))} · {totalPct}%
                                    </span>
                                </div>
                            </div>
                        )}

                        {/* How to use */}
                        <GCard style={{ background: 'color-mix(in srgb, var(--color-inc) 4%, var(--bg-card))', border: '1px solid color-mix(in srgb, var(--color-inc) 15%, transparent)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                                <Lightbulb size={16} color="var(--accent)" />
                                <span style={{ fontFamily: 'var(--font-head)', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>How to use this plan</span>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {[
                                    'Transfer the Savings amount to a separate account on payday before spending anything else.',
                                    'Set the Investments amount as a recurring transfer to your SIP or RD on the 1st of the month.',
                                    'Use the Discretionary budget as your guilt-free spending limit — no tracking needed within it.',
                                    'Review this plan every 3 months as your income or lifestyle changes.',
                                ].map((tip, i) => (
                                    <div key={i} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                                        <div style={{ width: '24px', height: '24px', flexShrink: 0, borderRadius: '12px', background: 'var(--accent-light)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '12px', fontFamily: 'var(--font-mono)' }}>{i + 1}</div>
                                        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.6, fontFamily: 'var(--font-body)' }}>{tip}</p>
                                    </div>
                                ))}
                            </div>
                        </GCard>
                    </>
                )}
            </div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </AppLayout>
    );
}
