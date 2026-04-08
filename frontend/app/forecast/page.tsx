'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { aiAPI } from '@/lib/api';
import { AppLayout } from '@/components/layout/AppLayout';
import { Loader2, AlertCircle, Sparkles } from 'lucide-react';

function fmt(n: number) {
    return '₹' + Math.round(n).toLocaleString('en-IN');
}

interface ForecastCategory {
    name: string;
    icon: string;
    color: string | null;
    avgMonthly: number;
    projected: number;
    spentSoFar: number;
    percentOfTotal: number;
}

interface ForecastData {
    totalForecast: number;
    avgMonthly: number;
    currentMonthSpent: number;
    daysElapsed: number;
    daysInMonth: number;
    avgIncome: number;
    categories: ForecastCategory[];
    insight: string;
    insufficientData?: boolean;
}

const card: React.CSSProperties = {
    background: 'var(--bg-card)',
    border: '1px solid var(--bg-border)',
    borderRadius: 16,
    padding: 24,
    marginBottom: 16,
};

export default function ForecastPage() {
    const router = useRouter();
    const { user, isLoading, loadFromStorage } = useAuthStore();

    const [forecast, setForecast] = useState<ForecastData | null>(null);
    const [loading, setLoading] = useState(false);
    const [generated, setGenerated] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => { loadFromStorage(); }, []);
    useEffect(() => { if (!isLoading && !user) router.push('/login'); }, [user, isLoading]);

    const fetchForecast = async () => {
        setError('');
        setLoading(true);
        try {
            const res = await aiAPI.forecastCalendar(true);
            const data: ForecastData = res.data.data;
            setForecast(data);
            setGenerated(true);
        } catch (err: any) {
            setError(err?.response?.data?.error || 'Could not generate forecast. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    if (isLoading || !user) {
        return <AppLayout><div style={{ maxWidth: 760, margin: '0 auto' }} /></AppLayout>;
    }

    const remaining = forecast ? forecast.avgIncome - forecast.totalForecast : 0;
    const hasIncome = forecast && forecast.avgIncome > 0;

    return (
        <AppLayout>
            <div style={{ maxWidth: 760, margin: '0 auto' }}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
                    <div>
                        <h1 style={{ fontFamily: 'Sora, sans-serif', fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>
                            Spending Forecast
                        </h1>
                        <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: 0 }}>
                            AI-powered prediction for this month
                        </p>
                    </div>
                    {generated && !loading && (
                        <button
                            type="button"
                            onClick={fetchForecast}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 7,
                                padding: '8px 16px',
                                background: 'var(--bg-card)', border: '1px solid var(--bg-border)',
                                borderRadius: 10, color: 'var(--text-secondary)',
                                fontSize: 13, cursor: 'pointer',
                                fontFamily: 'DM Sans, sans-serif',
                            }}
                        >
                            Regenerate
                        </button>
                    )}
                </div>

                {/* Error state */}
                {error && (
                    <div style={{ ...card, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: 40 }}>
                        <AlertCircle size={28} color="var(--accent-red)" />
                        <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                            Could not generate forecast
                        </p>
                        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, textAlign: 'center' }}>{error}</p>
                        <button type="button" onClick={fetchForecast} style={{
                            background: 'none', border: '1px solid var(--bg-border)',
                            borderRadius: 8, padding: '8px 20px',
                            color: 'var(--text-primary)', fontSize: 14, cursor: 'pointer',
                        }}>
                            Try Again
                        </button>
                    </div>
                )}

                {/* Loading state */}
                {loading && (
                    <div style={{ ...card, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 80, gap: 14 }}>
                        <Loader2 size={28} color="var(--accent-blue)" style={{ animation: 'spin 1s linear infinite' }} />
                        <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                            Generating…
                        </p>
                        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
                            Calculating from your last 3 months of transactions
                        </p>
                    </div>
                )}

                {/* Empty state — before first generation */}
                {!generated && !loading && !error && (
                    <div style={{ ...card, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 80, gap: 16, textAlign: 'center' }}>
                        <Sparkles size={40} color="var(--accent-blue)" />
                        <div>
                            <p style={{ fontFamily: 'Sora, sans-serif', fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 8px' }}>
                                Generate Your Spending Forecast
                            </p>
                            <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: 0, maxWidth: 360, lineHeight: 1.6 }}>
                                Predicts your remaining expenses based on the last 3 months of actual data
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={fetchForecast}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                                padding: '12px 28px',
                                background: 'linear-gradient(135deg, #1d4ed8, #3b82f6)',
                                color: '#fff', border: 'none', borderRadius: 12,
                                fontSize: 15, fontWeight: 600,
                                cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
                                marginTop: 8,
                            }}
                        >
                            ✨ Generate Forecast
                        </button>
                    </div>
                )}

                {/* Insufficient data state */}
                {forecast?.insufficientData && !loading && (
                    <div style={{ ...card, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: 50, textAlign: 'center' }}>
                        <Sparkles size={32} color="var(--text-muted)" />
                        <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Not enough data yet</p>
                        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, maxWidth: 340, lineHeight: 1.6 }}>
                            Add at least 1 week of transactions to generate a forecast.
                        </p>
                        <button type="button" onClick={() => router.push('/transactions')} style={{
                            background: 'linear-gradient(135deg, #1d4ed8, #3b82f6)',
                            color: '#fff', border: 'none', borderRadius: 10,
                            padding: '10px 20px', fontSize: 14, fontWeight: 600,
                            cursor: 'pointer',
                        }}>
                            Go to Transactions
                        </button>
                    </div>
                )}

                {forecast && !forecast.insufficientData && !loading && (
                    <>
                        {/* Card 1 — Summary tiles */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
                            {[
                                { label: 'Forecasted Total', value: fmt(forecast.totalForecast), color: 'var(--accent-blue)' },
                                { label: 'Spent So Far', value: fmt(forecast.currentMonthSpent), color: 'var(--accent-red)' },
                                hasIncome
                                    ? {
                                        label: 'Remaining Budget',
                                        value: fmt(Math.abs(remaining)),
                                        color: remaining >= 0 ? 'var(--accent-green)' : 'var(--accent-red)',
                                        prefix: remaining < 0 ? '-' : '',
                                    }
                                    : null,
                            ].filter(Boolean).map((tile: any) => (
                                <div key={tile.label} style={card}>
                                    <p style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase' as const, letterSpacing: '0.5px', margin: '0 0 6px', fontWeight: 600 }}>
                                        {tile.label}
                                    </p>
                                    <p style={{ fontFamily: 'Sora, sans-serif', fontSize: 24, fontWeight: 700, color: tile.color, margin: 0 }}>
                                        {tile.prefix || ''}{tile.value}
                                    </p>
                                </div>
                            ))}
                        </div>

                        {/* Card 2 — Category Breakdown */}
                        <div style={card}>
                            <p style={{ fontFamily: 'Sora, sans-serif', fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 16px' }}>
                                Category Breakdown
                            </p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                {forecast.categories.map(cat => (
                                    <div key={cat.name}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                            <span style={{ fontSize: 14, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                                {cat.icon && <span>{cat.icon}</span>}
                                                {cat.name}
                                            </span>
                                            <span style={{ fontFamily: 'Sora, sans-serif', fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                                                {fmt(cat.projected)}
                                            </span>
                                        </div>
                                        <div style={{ background: 'var(--bg-hover)', height: 6, borderRadius: 3, overflow: 'hidden', marginBottom: 4 }}>
                                            <div style={{
                                                height: '100%',
                                                width: `${Math.min(cat.percentOfTotal, 100)}%`,
                                                background: cat.color || 'var(--accent-blue)',
                                                borderRadius: 3,
                                            }} />
                                        </div>
                                        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>
                                            {fmt(cat.spentSoFar)} spent so far
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Card 3 — AI Insight */}
                        {forecast.insight && (
                            <div style={card}>
                                <p style={{ fontFamily: 'Sora, sans-serif', fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <Sparkles size={16} color="var(--accent-blue)" />
                                    AI Insight
                                </p>
                                <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.7 }}>
                                    {forecast.insight}
                                </p>
                            </div>
                        )}

                        {/* Card 4 — Forecast vs Average */}
                        <div style={card}>
                            <p style={{ fontFamily: 'Sora, sans-serif', fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 16px' }}>
                                Forecast vs Average
                            </p>
                            {[
                                { label: 'This month forecast', value: forecast.totalForecast, color: 'var(--accent-blue)' },
                                { label: '3-month average', value: forecast.avgMonthly, color: 'var(--accent-green)' },
                            ].map(row => {
                                const max = Math.max(forecast.totalForecast, forecast.avgMonthly) || 1;
                                return (
                                    <div key={row.label} style={{ marginBottom: 12 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                                            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{row.label}</span>
                                            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{fmt(row.value)}</span>
                                        </div>
                                        <div style={{ background: 'var(--bg-hover)', height: 8, borderRadius: 4, overflow: 'hidden' }}>
                                            <div style={{
                                                height: '100%',
                                                width: `${Math.round((row.value / max) * 100)}%`,
                                                background: row.color,
                                                borderRadius: 4,
                                            }} />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </>
                )}
            </div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </AppLayout>
    );
}
