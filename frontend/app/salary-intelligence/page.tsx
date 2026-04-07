'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { aiAPI } from '@/lib/api';
import { AppLayout } from '@/components/layout/AppLayout';
import {
    Banknote, Loader2, AlertTriangle, Lightbulb,
    PiggyBank, Home, ShoppingBag, Car, TrendingUp, Sparkles,
} from 'lucide-react';

const fmt = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

const card: React.CSSProperties = {
    background: 'var(--bg-card)',
    border: '1px solid var(--bg-border)',
    borderRadius: '16px',
    padding: '20px 24px',
};

const generateBtn: React.CSSProperties = {
    background: 'linear-gradient(135deg, #1d4ed8, #3b82f6)',
    color: '#fff',
    border: 'none',
    borderRadius: '10px',
    padding: '12px 24px',
    fontSize: '15px',
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontFamily: 'DM Sans, sans-serif',
};

const PLAN_META: Record<string, { label: string; color: string; bg: string; icon: any }> = {
    savings:       { label: 'Savings',       color: '#10b981', bg: 'rgba(16,185,129,0.12)',  icon: PiggyBank },
    rent:          { label: 'Rent / Housing', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', icon: Home },
    food:          { label: 'Food',           color: '#3b82f6', bg: 'rgba(59,130,246,0.12)', icon: ShoppingBag },
    transport:     { label: 'Transport',      color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)', icon: Car },
    investments:   { label: 'Investments',    color: '#06b6d4', bg: 'rgba(6,182,212,0.12)',  icon: TrendingUp },
    discretionary: { label: 'Discretionary',  color: '#f43f5e', bg: 'rgba(244,63,94,0.12)', icon: Sparkles },
};

export default function SalaryIntelligencePage() {
    const router = useRouter();
    const { user, isLoading, loadFromStorage } = useAuthStore();
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [generated, setGenerated] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => { loadFromStorage(); }, []);
    useEffect(() => { if (!isLoading && !user) router.push('/login'); }, [user, isLoading]);

    const analyse = async (force = false) => {
        setLoading(true);
        setError('');
        try {
            const res = await aiAPI.salaryIntelligence();
            setData(res.data);
            setGenerated(true);
        } catch (err: any) {
            setError(err?.response?.data?.error || err?.response?.data?.message || 'Failed to analyse salary pattern. Please try again.');
            setData(null);
        } finally {
            setLoading(false);
        }
    };

    if (isLoading || !user) return (
        <AppLayout>
            <div style={{ height: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Loader2 size={24} color="var(--accent-green)" style={{ animation: 'spin 1s linear infinite' }} />
            </div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </AppLayout>
    );

    const planEntries: [string, any][] = data?.plan ? Object.entries(data.plan) : [];
    const totalPct = planEntries.reduce((s, [, v]) => s + (v?.percentage ?? 0), 0);

    return (
        <AppLayout>
            <div style={{ maxWidth: '900px', margin: '0 auto' }}>
                {/* Header */}
                <div style={{ marginBottom: '28px' }}>
                    <h1 style={{ fontFamily: 'Sora, sans-serif', fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>
                        Salary Intelligence
                    </h1>
                    <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: 0 }}>
                        AI-powered salary allocation plan based on your income and spending patterns.
                    </p>
                </div>

                {/* State 1 — Initial */}
                {!generated && !loading && !error && (
                    <div style={{ ...card, textAlign: 'center', padding: '60px 40px' }}>
                        <div style={{ position: 'relative', width: '120px', height: '120px', margin: '0 auto 24px' }}>
                            <div style={{
                                position: 'absolute', inset: 0, borderRadius: '60px',
                                background: 'radial-gradient(circle, rgba(16,185,129,0.2), rgba(59,130,246,0.1))',
                            }} />
                            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Banknote size={44} color="var(--accent-green)" />
                            </div>
                        </div>
                        <h2 style={{ fontFamily: 'Sora, sans-serif', fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 12px' }}>
                            Salary Day Intelligence
                        </h2>
                        <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: '0 0 28px', lineHeight: 1.7, maxWidth: '420px', marginLeft: 'auto', marginRight: 'auto' }}>
                            We detect your salary from income transactions and generate a personalised allocation plan — how to split your pay for savings, bills, investments and lifestyle.
                        </p>
                        <div style={{ display: 'flex', justifyContent: 'center' }}>
                            <button type="button" onClick={() => analyse()} style={generateBtn}>
                                <Banknote size={17} /> Analyse Salary Pattern
                            </button>
                        </div>
                    </div>
                )}

                {/* State 2 — Loading */}
                {loading && (
                    <div style={{ ...card, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px', gap: '16px' }}>
                        <Loader2 size={28} color="var(--accent-green)" style={{ animation: 'spin 1s linear infinite' }} />
                        <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: 0 }}>
                            Detecting your salary pattern…
                        </p>
                    </div>
                )}

                {/* State 3 — Error */}
                {error && !loading && (
                    <div style={{ ...card, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px', padding: '40px' }}>
                        <AlertTriangle size={28} color="var(--accent-red)" />
                        <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: 0, textAlign: 'center' }}>{error}</p>
                        <button type="button" onClick={() => analyse()} style={{
                            background: 'none', border: '1px solid var(--bg-border)',
                            borderRadius: '8px', padding: '8px 20px',
                            color: 'var(--text-primary)', fontSize: '14px', cursor: 'pointer',
                        }}>
                            Try again
                        </button>
                    </div>
                )}

                {/* State 4a — Not detected */}
                {generated && data && !data.detected && !loading && (
                    <div style={{ ...card, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', padding: '50px 40px', textAlign: 'center' }}>
                        <Banknote size={36} color="var(--text-muted)" />
                        <h3 style={{ fontFamily: 'Sora, sans-serif', fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                            No salary pattern detected
                        </h3>
                        <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.6, maxWidth: '360px' }}>
                            We need at least one income transaction to detect your salary. Add your salary or income transactions to unlock this feature.
                        </p>
                        <button type="button" onClick={() => router.push('/transactions')} style={generateBtn}>
                            Add Income Transactions
                        </button>
                    </div>
                )}

                {/* State 4b — Result */}
                {generated && data && data.detected && !loading && (
                    <>
                        {/* Salary hero card */}
                        <div style={{
                            background: 'linear-gradient(135deg, rgba(16,185,129,0.12), rgba(59,130,246,0.06))',
                            border: '1px solid rgba(16,185,129,0.3)',
                            borderRadius: '16px',
                            padding: '28px 24px',
                            marginBottom: '16px',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '20px', flexWrap: 'wrap' }}>
                                <div style={{
                                    width: '56px', height: '56px', borderRadius: '16px',
                                    background: 'rgba(16,185,129,0.15)',
                                    border: '1px solid rgba(16,185,129,0.3)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    flexShrink: 0,
                                }}>
                                    <Banknote size={26} color="var(--accent-green)" />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '6px' }}>
                                        <p style={{ fontFamily: 'Sora, sans-serif', fontSize: '28px', fontWeight: 700, color: 'var(--accent-green)', margin: 0 }}>
                                            {fmt(data.salary)}
                                        </p>
                                        {data.from_cache && (
                                            <span style={{ fontSize: '11px', color: 'var(--text-muted)', background: 'var(--bg-card)', border: '1px solid var(--bg-border)', borderRadius: '6px', padding: '2px 8px' }}>Cached</span>
                                        )}
                                    </div>
                                    <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: '0 0 4px' }}>
                                        {data.description || 'Monthly salary detected'}
                                    </p>
                                    {data.insight && (
                                        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0, lineHeight: 1.5, fontStyle: 'italic' }}>
                                            "{data.insight}"
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Allocation breakdown */}
                        {planEntries.length > 0 && (
                            <div style={{ ...card, marginBottom: '16px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
                                    <TrendingUp size={16} color="var(--accent-blue)" />
                                    <span style={{ fontFamily: 'Sora, sans-serif', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                        AI Salary Allocation Plan
                                    </span>
                                    <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: '4px' }}>
                                        Based on your spending
                                    </span>
                                </div>

                                {/* Visual pie-style bar */}
                                <div style={{ display: 'flex', height: '10px', borderRadius: '5px', overflow: 'hidden', marginBottom: '20px', gap: '2px' }}>
                                    {planEntries.map(([key, val]) => {
                                        const meta = PLAN_META[key] || { color: '#6b7280', bg: '#6b728020', label: key, icon: Sparkles };
                                        return (
                                            <div key={key} style={{
                                                height: '100%',
                                                width: `${val?.percentage ?? 0}%`,
                                                background: meta.color,
                                                transition: 'width 0.6s ease',
                                                borderRadius: '2px',
                                            }} />
                                        );
                                    })}
                                </div>

                                {/* Legend row */}
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '20px' }}>
                                    {planEntries.map(([key, val]) => {
                                        const meta = PLAN_META[key] || { color: '#6b7280', bg: '#6b728020', label: key, icon: Sparkles };
                                        return (
                                            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: meta.color, flexShrink: 0 }} />
                                                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{meta.label} {val?.percentage}%</span>
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Allocation rows */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    {planEntries.map(([key, val]) => {
                                        const meta = PLAN_META[key] || { color: '#6b7280', bg: '#6b728020', label: key, icon: Sparkles };
                                        const IconCmp = meta.icon;
                                        const pct = val?.percentage ?? 0;
                                        return (
                                            <div key={key} style={{
                                                display: 'flex', alignItems: 'center', gap: '14px',
                                                padding: '14px 16px',
                                                borderRadius: '12px',
                                                background: meta.bg,
                                                border: `1px solid ${meta.color}22`,
                                            }}>
                                                {/* Icon */}
                                                <div style={{
                                                    width: '38px', height: '38px', borderRadius: '10px',
                                                    background: `${meta.color}25`,
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    flexShrink: 0,
                                                }}>
                                                    <IconCmp size={18} color={meta.color} />
                                                </div>

                                                {/* Name + reason */}
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 2px' }}>
                                                        {meta.label}
                                                    </p>
                                                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                        {val?.reason || ''}
                                                    </p>
                                                </div>

                                                {/* Amount + % */}
                                                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                                    <p style={{ fontFamily: 'Sora, sans-serif', fontSize: '16px', fontWeight: 700, color: meta.color, margin: '0 0 2px' }}>
                                                        {fmt(val?.amount ?? 0)}
                                                    </p>
                                                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
                                                        {pct}%
                                                    </p>
                                                </div>

                                                {/* Mini bar */}
                                                <div style={{ width: '60px', flexShrink: 0 }}>
                                                    <div style={{ height: '6px', background: 'var(--bg-hover)', borderRadius: '3px', overflow: 'hidden' }}>
                                                        <div style={{
                                                            height: '100%',
                                                            width: totalPct > 0 ? `${(pct / Math.max(totalPct, 100)) * 100}%` : '0%',
                                                            background: meta.color,
                                                            borderRadius: '3px',
                                                        }} />
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Total check */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--bg-border)' }}>
                                    <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 600 }}>Total allocated</span>
                                    <span style={{ fontFamily: 'Sora, sans-serif', fontSize: '16px', fontWeight: 700, color: totalPct >= 98 ? 'var(--accent-green)' : 'var(--accent-yellow)' }}>
                                        {fmt(planEntries.reduce((s, [, v]) => s + (v?.amount ?? 0), 0))} · {totalPct}%
                                    </span>
                                </div>
                            </div>
                        )}

                        {/* Recommendations / insight card */}
                        <div style={{
                            ...card,
                            background: 'rgba(16,185,129,0.04)',
                            border: '1px solid rgba(16,185,129,0.18)',
                            marginBottom: '16px',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                                <Lightbulb size={16} color="var(--accent-blue)" />
                                <span style={{ fontFamily: 'Sora, sans-serif', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                    How to use this plan
                                </span>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {[
                                    'Transfer the Savings amount to a separate account on payday before spending anything else.',
                                    'Set the Investments amount as a recurring transfer to your SIP or RD on the 1st of the month.',
                                    'Use the Discretionary budget as your guilt-free spending limit — no tracking needed within it.',
                                    'Review this plan every 3 months as your income or lifestyle changes.',
                                ].map((tip, i) => (
                                    <div key={i} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                                        <div style={{
                                            width: '24px', height: '24px', flexShrink: 0,
                                            borderRadius: '12px',
                                            background: 'rgba(59,130,246,0.15)',
                                            color: 'var(--accent-blue)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontWeight: 700, fontSize: '12px',
                                        }}>
                                            {i + 1}
                                        </div>
                                        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.6 }}>{tip}</p>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Re-analyse */}
                        <button type="button" onClick={() => { setGenerated(false); setData(null); }}
                            style={{ background: 'none', border: 'none', color: 'var(--accent-blue)', fontSize: '13px', cursor: 'pointer', padding: 0 }}>
                            ↻ Re-analyse
                        </button>
                    </>
                )}
            </div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </AppLayout>
    );
}
