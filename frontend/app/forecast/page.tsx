'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { aiAPI } from '@/lib/api';
import { AppLayout } from '@/components/layout/AppLayout';
import { formatCurrency } from '@/lib/utils';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function ForecastPage() {
    const router = useRouter();
    const { user, isLoading, loadFromStorage } = useAuthStore();
    const [predictions, setPredictions] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => { loadFromStorage(); }, []);
    useEffect(() => { if (!isLoading && !user) router.push('/login'); }, [user, isLoading]);

    useEffect(() => {
        if (!user) return;
        aiAPI.forecastCalendar()
            .then(res => setPredictions(res.data.predictions || []))
            .catch(() => setPredictions([]))
            .finally(() => setLoading(false));
    }, [user]);

    if (isLoading || !user) return (
        <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: '24px', height: '24px', border: '2px solid #10b981', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    );

    // Build a 30-day grid starting from today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const days: Date[] = Array.from({ length: 30 }, (_, i) => {
        const d = new Date(today);
        d.setDate(today.getDate() + i);
        return d;
    });

    const predMap: Record<string, any[]> = {};
    predictions.forEach(p => {
        if (!predMap[p.date]) predMap[p.date] = [];
        predMap[p.date].push(p);
    });

    const totalForecast = predictions.reduce((s, p) => s + (p.predicted_amount || 0), 0);
    const highConfCount = predictions.filter(p => p.confidence === 'high').length;

    const confidenceColor = (c: string) => c === 'high' ? '#10b981' : c === 'medium' ? '#f59e0b' : '#6b7280';

    // Pad grid to start on Sunday
    const firstDow = days[0].getDay();
    const paddedDays: (Date | null)[] = [...Array(firstDow).fill(null), ...days];
    while (paddedDays.length % 7 !== 0) paddedDays.push(null);

    return (
        <AppLayout>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                    <h1 style={{ fontFamily: 'Sora, sans-serif', fontSize: '1.4rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Spending Forecast</h1>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', margin: '4px 0 0 0' }}>Predicted expenses for the next 30 days</p>
                </div>
                <button onClick={() => { setLoading(true); aiAPI.forecastCalendar().then(r => setPredictions(r.data.predictions || [])).catch(() => {}).finally(() => setLoading(false)); }}
                    style={{ padding: '8px 14px', background: 'var(--bg-secondary)', border: '1px solid var(--bg-border)', borderRadius: '10px', color: 'var(--text-secondary)', fontSize: '0.8rem', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}>
                    🔄 Refresh
                </button>
            </div>

            {/* Summary cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '20px' }}>
                {[
                    { label: 'Total Forecast', value: formatCurrency(totalForecast, user.currency), color: 'var(--accent-red)' },
                    { label: 'Predicted Events', value: `${predictions.length}`, color: 'var(--accent-blue)' },
                    { label: 'High Confidence', value: `${highConfCount}`, color: 'var(--accent-green)' },
                ].map(c => (
                    <div key={c.label} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--bg-border)', borderRadius: '14px', padding: '14px 16px' }}>
                        <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', margin: '0 0 4px 0' }}>{c.label}</p>
                        <p style={{ fontFamily: 'Sora, sans-serif', fontSize: '1.2rem', fontWeight: 700, color: c.color, margin: 0 }}>{c.value}</p>
                    </div>
                ))}
            </div>

            {loading ? (
                <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--bg-border)', borderRadius: '16px', padding: '60px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                    <div style={{ width: '24px', height: '24px', border: '2px solid #10b981', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite', margin: '0 auto 12px' }} />
                    Building your forecast…
                </div>
            ) : (
                <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--bg-border)', borderRadius: '20px', overflow: 'hidden' }}>
                    {/* Day headers */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', borderBottom: '1px solid var(--bg-border)' }}>
                        {DAYS.map(d => <div key={d} style={{ padding: '10px', textAlign: 'center', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>{d}</div>)}
                    </div>

                    {/* Calendar grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)' }}>
                        {paddedDays.map((day, idx) => {
                            if (!day) return <div key={`e-${idx}`} style={{ minHeight: '80px', borderRight: (idx + 1) % 7 !== 0 ? '1px solid var(--bg-border)' : 'none', borderBottom: '1px solid var(--bg-border)', background: 'var(--bg-primary)' }} />;

                            const dateStr = day.toISOString().split('T')[0];
                            const preds = predMap[dateStr] || [];
                            const isToday = dateStr === today.toISOString().split('T')[0];
                            const totalDay = preds.reduce((s, p) => s + (p.predicted_amount || 0), 0);

                            return (
                                <div key={dateStr} style={{ minHeight: '80px', borderRight: (idx + 1) % 7 !== 0 ? '1px solid var(--bg-border)' : 'none', borderBottom: '1px solid var(--bg-border)', padding: '6px', background: preds.length > 0 ? 'rgba(244,63,94,0.02)' : 'transparent' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                                        <span style={{ width: '22px', height: '22px', borderRadius: '50%', background: isToday ? '#10b981' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: isToday ? 700 : 400, color: isToday ? '#fff' : 'var(--text-primary)' }}>
                                            {day.getDate()}
                                        </span>
                                        {preds.length > 0 && <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#f43f5e' }} />}
                                    </div>
                                    {preds.length > 0 && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                            {preds.slice(0, 2).map((p, i) => (
                                                <div key={i} title={`${p.description} — ${p.confidence} confidence`} style={{ fontSize: '0.6rem', color: confidenceColor(p.confidence), fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                    -₹{p.predicted_amount?.toLocaleString('en-IN')}
                                                </div>
                                            ))}
                                            {preds.length > 2 && <span style={{ fontSize: '0.58rem', color: 'var(--text-muted)' }}>+{preds.length - 2} more</span>}
                                            {totalDay > 0 && preds.length > 1 && <span style={{ fontSize: '0.6rem', color: '#f43f5e', fontWeight: 700, borderTop: '1px solid var(--bg-border)', paddingTop: '2px', marginTop: '1px' }}>₹{totalDay.toLocaleString('en-IN')}</span>}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Prediction list */}
            {!loading && predictions.length > 0 && (
                <div style={{ marginTop: '16px', background: 'var(--bg-secondary)', border: '1px solid var(--bg-border)', borderRadius: '16px', overflow: 'hidden' }}>
                    <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--bg-border)' }}>
                        <h3 style={{ fontFamily: 'Sora, sans-serif', fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>All Predictions</h3>
                    </div>
                    {predictions.map((p, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderBottom: '1px solid var(--bg-border)', gap: '12px' }}
                            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'}
                            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
                        >
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <p style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-primary)', margin: 0 }}>{p.description}</p>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px', flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{p.date}</span>
                                    {p.category && <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', background: 'var(--bg-card)', padding: '1px 6px', borderRadius: '4px' }}>{p.category}</span>}
                                    <span style={{ fontSize: '0.65rem', color: confidenceColor(p.confidence), background: `${confidenceColor(p.confidence)}18`, padding: '1px 6px', borderRadius: '4px', fontWeight: 600 }}>{p.confidence}</span>
                                    <span style={{ fontSize: '0.65rem', color: p.source === 'recurring' ? 'var(--accent-green)' : 'var(--accent-blue)', background: p.source === 'recurring' ? 'var(--accent-green-bg)' : 'var(--accent-blue-bg)', padding: '1px 6px', borderRadius: '4px' }}>{p.source === 'recurring' ? 'recurring' : 'AI'}</span>
                                </div>
                            </div>
                            <p style={{ fontFamily: 'Sora, sans-serif', fontSize: '0.9rem', fontWeight: 700, color: 'var(--accent-red)', margin: 0, flexShrink: 0 }}>
                                -{formatCurrency(p.predicted_amount, user.currency)}
                            </p>
                        </div>
                    ))}
                </div>
            )}

            {!loading && predictions.length === 0 && (
                <div style={{ marginTop: '16px', background: 'var(--bg-secondary)', border: '1px solid var(--bg-border)', borderRadius: '16px', padding: '60px', textAlign: 'center' }}>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', margin: 0 }}>No predictions available. Add some recurring transactions to see forecasts.</p>
                </div>
            )}

            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </AppLayout>
    );
}
