'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { aiAPI } from '@/lib/api';
import { AppLayout } from '@/components/layout/AppLayout';
import { TrendingUp, Loader2, AlertCircle, BarChart2, RefreshCw } from 'lucide-react';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface Prediction {
    date: string;
    category: string;
    description: string;
    amount: number;
    confidence: 'high' | 'medium' | 'low';
    reason: string;
}

interface ForecastData {
    totalForecast: number;
    highConfidenceCount: number;
    predictions: Prediction[];
}

function fmt(n: number) {
    return `₹${Math.round(n).toLocaleString('en-IN')}`;
}

function fmtDate(dateStr: string) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dow = new Date(y, m - 1, d).getDay();
    return `${DAY_NAMES[dow]}, ${MONTH_NAMES[m - 1]} ${d}`;
}

function confColor(c: string) {
    if (c === 'high') return 'var(--accent-green)';
    if (c === 'medium') return 'var(--accent-yellow)';
    return 'var(--text-muted)';
}

function confBg(c: string) {
    if (c === 'high') return 'rgba(16,185,129,0.15)';
    if (c === 'medium') return 'rgba(245,158,11,0.15)';
    return 'rgba(107,114,128,0.15)';
}

const CATEGORY_COLORS: Record<string, string> = {
    food: 'var(--accent-green)', dining: 'var(--accent-green)', groceries: 'var(--accent-green)',
    transport: 'var(--accent-blue)', travel: 'var(--accent-blue)',
    shopping: 'var(--accent-purple)', entertainment: 'var(--accent-purple)',
    utilities: 'var(--accent-yellow)', bills: 'var(--accent-yellow)', rent: 'var(--accent-yellow)',
    health: 'var(--accent-red)', medical: 'var(--accent-red)',
    subscription: 'var(--accent-blue)',
};

function catColor(cat: string) {
    if (!cat) return 'var(--accent-blue)';
    const lower = cat.toLowerCase();
    for (const [k, v] of Object.entries(CATEGORY_COLORS)) {
        if (lower.includes(k)) return v;
    }
    return 'var(--accent-blue)';
}

const card: React.CSSProperties = {
    background: 'var(--bg-card)',
    border: '1px solid var(--bg-border)',
    borderRadius: '16px',
    padding: '20px 24px',
};

export default function ForecastPage() {
    const router = useRouter();
    const { user, isLoading, loadFromStorage } = useAuthStore();

    const [forecast, setForecast] = useState<ForecastData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [selectedDate, setSelectedDate] = useState<string | null>(null);
    const [regenerating, setRegenerating] = useState(false);

    useEffect(() => { loadFromStorage(); }, []);
    useEffect(() => { if (!isLoading && !user) router.push('/login'); }, [user, isLoading]);

    const fetchForecast = useCallback(async (force = false) => {
        setError('');
        try {
            const res = await aiAPI.forecastCalendar(force);
            const data: ForecastData = res.data.data;
            setForecast(data);
        } catch (err: any) {
            setError(err?.response?.data?.error || 'Could not generate forecast. Please try again.');
        } finally {
            setLoading(false);
            setRegenerating(false);
        }
    }, []);

    // Auto-load on mount
    useEffect(() => {
        if (!isLoading && user) fetchForecast(false);
    }, [isLoading, user, fetchForecast]);

    const handleRegenerate = async () => {
        setRegenerating(true);
        setSelectedDate(null);
        try {
            // Bust cache then re-fetch
            await aiAPI.clearCache('forecast');
        } catch { /* ignore cache-bust errors */ }
        await fetchForecast(true);
    };

    if (isLoading || (!forecast && loading && !error)) {
        return (
            <AppLayout>
                <div style={{ maxWidth: '900px', margin: '0 auto' }}>
                    <div style={{ marginBottom: '28px' }}>
                        <h1 style={{ fontFamily: 'Sora, sans-serif', fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>
                            Spending Forecast
                        </h1>
                        <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: 0 }}>
                            Predicted expenses for the next 30 days
                        </p>
                    </div>
                    <div style={{ ...card, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px', gap: '14px' }}>
                        <Loader2 size={28} color="var(--accent-blue)" style={{ animation: 'spin 1s linear infinite' }} />
                        <p style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                            Analysing 90 days of spending patterns…
                        </p>
                        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>
                            This may take a few seconds
                        </p>
                    </div>
                </div>
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </AppLayout>
        );
    }

    // Build calendar data
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];

    const days: Date[] = Array.from({ length: 30 }, (_, i) => {
        const d = new Date(today);
        d.setDate(today.getDate() + i);
        return d;
    });

    const predictions = forecast?.predictions || [];
    const predMap: Record<string, Prediction[]> = {};
    predictions.forEach(p => {
        if (!predMap[p.date]) predMap[p.date] = [];
        predMap[p.date].push(p);
    });

    const firstDow = days[0].getDay();
    const paddedDays: (Date | null)[] = [...Array(firstDow).fill(null), ...days];
    while (paddedDays.length % 7 !== 0) paddedDays.push(null);

    // Group predictions by week for the list view
    const oneWeek = new Date(today);
    oneWeek.setDate(today.getDate() + 7);
    const twoWeeks = new Date(today);
    twoWeeks.setDate(today.getDate() + 14);

    const thisWeek = predictions.filter(p => new Date(p.date) < oneWeek);
    const nextWeek = predictions.filter(p => new Date(p.date) >= oneWeek && new Date(p.date) < twoWeeks);
    const later = predictions.filter(p => new Date(p.date) >= twoWeeks);

    const selectedPreds = selectedDate ? (predMap[selectedDate] || []) : [];

    return (
        <AppLayout>
            <div style={{ maxWidth: '900px', margin: '0 auto' }}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
                    <div>
                        <h1 style={{ fontFamily: 'Sora, sans-serif', fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>
                            Spending Forecast
                        </h1>
                        <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: 0 }}>
                            Predicted expenses for the next 30 days
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={handleRegenerate}
                        disabled={regenerating}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '7px',
                            padding: '8px 16px',
                            background: 'var(--bg-card)', border: '1px solid var(--bg-border)',
                            borderRadius: '10px', color: 'var(--text-secondary)',
                            fontSize: '13px', cursor: regenerating ? 'not-allowed' : 'pointer',
                            fontFamily: 'DM Sans, sans-serif', opacity: regenerating ? 0.7 : 1,
                        }}
                    >
                        {regenerating
                            ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
                            : <RefreshCw size={13} />}
                        Regenerate
                    </button>
                </div>

                {/* Error state */}
                {error && (
                    <div style={{ ...card, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px', padding: '40px', marginBottom: '16px' }}>
                        <AlertCircle size={28} color="var(--accent-red)" />
                        <p style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                            Could not generate forecast
                        </p>
                        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0, textAlign: 'center' }}>{error}</p>
                        <button type="button" onClick={() => { setLoading(true); fetchForecast(false); }} style={{
                            background: 'none', border: '1px solid var(--bg-border)',
                            borderRadius: '8px', padding: '8px 20px',
                            color: 'var(--text-primary)', fontSize: '14px', cursor: 'pointer',
                        }}>
                            Try again
                        </button>
                    </div>
                )}

                {forecast && (
                    <>
                        {/* Stat tiles */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '20px' }}>
                            {[
                                {
                                    label: 'Total Forecast',
                                    value: fmt(forecast.totalForecast),
                                    color: 'var(--accent-red)',
                                    sub: 'next 30 days',
                                },
                                {
                                    label: 'Predicted Events',
                                    value: String(predictions.length),
                                    color: 'var(--accent-blue)',
                                    sub: 'upcoming expenses',
                                },
                                {
                                    label: 'High Confidence',
                                    value: String(forecast.highConfidenceCount),
                                    color: 'var(--accent-green)',
                                    sub: 'certain to recur',
                                },
                            ].map(tile => (
                                <div key={tile.label} style={card}>
                                    <p style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 6px', fontWeight: 600 }}>
                                        {tile.label}
                                    </p>
                                    <p style={{ fontFamily: 'Sora, sans-serif', fontSize: '24px', fontWeight: 700, color: tile.color, margin: '0 0 2px' }}>
                                        {tile.value}
                                    </p>
                                    <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0 }}>{tile.sub}</p>
                                </div>
                            ))}
                        </div>

                        {/* Empty state */}
                        {predictions.length === 0 && (
                            <div style={{ ...card, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px', padding: '50px', textAlign: 'center', marginBottom: '16px' }}>
                                <BarChart2 size={32} color="var(--text-muted)" />
                                <p style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Not enough data yet</p>
                                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0, maxWidth: '340px', lineHeight: 1.6 }}>
                                    Add at least 1 month of regular transactions to see spending predictions.
                                </p>
                                <button type="button" onClick={() => router.push('/transactions')} style={{
                                    background: 'linear-gradient(135deg, #1d4ed8, #3b82f6)',
                                    color: '#fff', border: 'none', borderRadius: '10px',
                                    padding: '10px 20px', fontSize: '14px', fontWeight: 600,
                                    cursor: 'pointer',
                                }}>
                                    Go to Transactions
                                </button>
                            </div>
                        )}

                        {predictions.length > 0 && (
                            <>
                                {/* Calendar */}
                                <div style={{ ...card, padding: 0, overflow: 'hidden', marginBottom: '16px' }}>
                                    {/* Day headers */}
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', borderBottom: '1px solid var(--bg-border)' }}>
                                        {DAYS.map(d => (
                                            <div key={d} style={{ padding: '10px', textAlign: 'center', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                                {d}
                                            </div>
                                        ))}
                                    </div>

                                    {/* Grid */}
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)' }}>
                                        {paddedDays.map((day, idx) => {
                                            if (!day) return (
                                                <div key={`e-${idx}`} style={{
                                                    minHeight: '72px',
                                                    borderRight: (idx + 1) % 7 !== 0 ? '1px solid var(--bg-border)' : 'none',
                                                    borderBottom: '1px solid var(--bg-border)',
                                                    background: 'rgba(0,0,0,0.04)',
                                                }} />
                                            );

                                            const dateStr = day.toISOString().split('T')[0];
                                            const preds = predMap[dateStr] || [];
                                            const isToday = dateStr === todayStr;
                                            const isSelected = dateStr === selectedDate;
                                            const hasPreds = preds.length > 0;

                                            return (
                                                <div
                                                    key={dateStr}
                                                    onClick={() => hasPreds ? setSelectedDate(isSelected ? null : dateStr) : undefined}
                                                    style={{
                                                        minHeight: '72px',
                                                        borderRight: (idx + 1) % 7 !== 0 ? '1px solid var(--bg-border)' : 'none',
                                                        borderBottom: '1px solid var(--bg-border)',
                                                        padding: '6px',
                                                        cursor: hasPreds ? 'pointer' : 'default',
                                                        background: isSelected
                                                            ? 'rgba(59,130,246,0.08)'
                                                            : hasPreds ? 'rgba(244,63,94,0.03)' : 'transparent',
                                                        transition: 'background 0.15s',
                                                    }}
                                                    onMouseEnter={e => { if (hasPreds && !isSelected) (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
                                                    onMouseLeave={e => { if (hasPreds && !isSelected) (e.currentTarget as HTMLElement).style.background = hasPreds ? 'rgba(244,63,94,0.03)' : 'transparent'; }}
                                                >
                                                    {/* Date number */}
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                                        <span style={{
                                                            width: '22px', height: '22px', borderRadius: '11px',
                                                            background: isToday ? 'var(--accent-blue)' : isSelected ? 'rgba(59,130,246,0.2)' : 'transparent',
                                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                            fontSize: '12px',
                                                            fontWeight: isToday ? 700 : 400,
                                                            color: isToday ? '#fff' : 'var(--text-primary)',
                                                        }}>
                                                            {day.getDate()}
                                                        </span>
                                                    </div>

                                                    {/* Confidence dots */}
                                                    {hasPreds && (
                                                        <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap', alignItems: 'center' }}>
                                                            {preds.slice(0, 2).map((p, i) => (
                                                                <div key={i} style={{
                                                                    width: '8px', height: '8px',
                                                                    borderRadius: '4px',
                                                                    background: confColor(p.confidence),
                                                                    flexShrink: 0,
                                                                }} />
                                                            ))}
                                                            {preds.length > 2 && (
                                                                <span style={{ fontSize: '10px', color: 'var(--text-muted)', lineHeight: 1 }}>
                                                                    +{preds.length - 2}
                                                                </span>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Legend */}
                                <div style={{ display: 'flex', gap: '16px', marginBottom: '16px', flexWrap: 'wrap' }}>
                                    {[
                                        { label: 'High confidence', color: 'var(--accent-green)' },
                                        { label: 'Medium confidence', color: 'var(--accent-yellow)' },
                                        { label: 'Low confidence', color: 'var(--text-muted)' },
                                    ].map(l => (
                                        <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <div style={{ width: '8px', height: '8px', borderRadius: '4px', background: l.color, flexShrink: 0 }} />
                                            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{l.label}</span>
                                        </div>
                                    ))}
                                    <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: 'auto' }}>
                                        Click a day to see details
                                    </span>
                                </div>

                                {/* Detail panel — selected day */}
                                {selectedDate && selectedPreds.length > 0 && (
                                    <div style={{ ...card, marginBottom: '16px', border: '1px solid rgba(59,130,246,0.3)' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                                            <p style={{ fontFamily: 'Sora, sans-serif', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                                                {fmtDate(selectedDate)}
                                            </p>
                                            <button type="button" onClick={() => setSelectedDate(null)} style={{
                                                background: 'none', border: 'none', color: 'var(--text-muted)',
                                                fontSize: '18px', cursor: 'pointer', padding: '0 4px', lineHeight: 1,
                                            }}>×</button>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                            {selectedPreds.map((p, i) => (
                                                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', paddingBottom: '12px', borderBottom: i < selectedPreds.length - 1 ? '1px solid var(--bg-border)' : 'none' }}>
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                                                            <span style={{
                                                                fontSize: '12px', color: catColor(p.category),
                                                                background: `${catColor(p.category).replace('var(', '').replace(')', '')}15`.includes('var') ? 'rgba(59,130,246,0.12)' : 'rgba(59,130,246,0.12)',
                                                                borderRadius: '12px', padding: '3px 10px', fontWeight: 500,
                                                            }}>
                                                                {p.category}
                                                            </span>
                                                            <span style={{ fontSize: '11px', color: confColor(p.confidence), background: confBg(p.confidence), borderRadius: '6px', padding: '2px 7px', fontWeight: 600 }}>
                                                                {p.confidence.charAt(0).toUpperCase() + p.confidence.slice(1)}
                                                            </span>
                                                        </div>
                                                        <p style={{ fontSize: '14px', color: 'var(--text-primary)', margin: '0 0 3px', fontWeight: 500 }}>{p.description}</p>
                                                        {p.reason && (
                                                            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0, fontStyle: 'italic' }}>{p.reason}</p>
                                                        )}
                                                    </div>
                                                    <span style={{ fontFamily: 'Sora, sans-serif', fontSize: '16px', fontWeight: 700, color: 'var(--accent-red)', flexShrink: 0 }}>
                                                        -{fmt(p.amount)}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* List view — all predictions grouped by week */}
                                {(!selectedDate || selectedPreds.length === 0) && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                        {[
                                            { label: 'This week', items: thisWeek },
                                            { label: 'Next week', items: nextWeek },
                                            { label: 'Later this month', items: later },
                                        ].filter(g => g.items.length > 0).map(group => (
                                            <div key={group.label}>
                                                <p style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 600, margin: '0 0 8px' }}>
                                                    {group.label}
                                                </p>
                                                <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
                                                    {group.items.map((p, i) => (
                                                        <div
                                                            key={i}
                                                            style={{
                                                                display: 'flex', alignItems: 'center', gap: '12px',
                                                                padding: '12px 20px',
                                                                borderBottom: i < group.items.length - 1 ? '1px solid var(--bg-border)' : 'none',
                                                                cursor: 'pointer',
                                                            }}
                                                            onClick={() => setSelectedDate(p.date)}
                                                            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'}
                                                            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
                                                        >
                                                            {/* Date */}
                                                            <div style={{ width: '80px', flexShrink: 0 }}>
                                                                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0, fontWeight: 500 }}>
                                                                    {fmtDate(p.date)}
                                                                </p>
                                                            </div>

                                                            {/* Category pill */}
                                                            <span style={{
                                                                fontSize: '11px', color: catColor(p.category),
                                                                background: 'rgba(59,130,246,0.1)',
                                                                borderRadius: '8px', padding: '2px 8px',
                                                                flexShrink: 0, whiteSpace: 'nowrap',
                                                            }}>
                                                                {p.category}
                                                            </span>

                                                            {/* Description */}
                                                            <p style={{ fontSize: '13px', color: 'var(--text-primary)', margin: 0, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                {p.description}
                                                            </p>

                                                            {/* Confidence dot */}
                                                            <div style={{ width: '6px', height: '6px', borderRadius: '3px', background: confColor(p.confidence), flexShrink: 0 }} />

                                                            {/* Amount */}
                                                            <span style={{ fontFamily: 'Sora, sans-serif', fontSize: '14px', fontWeight: 700, color: 'var(--accent-red)', flexShrink: 0 }}>
                                                                -{fmt(p.amount)}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </>
                        )}
                    </>
                )}
            </div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </AppLayout>
    );
}
