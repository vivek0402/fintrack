'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { aiAPI } from '@/lib/api';
import { AppLayout } from '@/components/layout/AppLayout';
import { GCard } from '@/components/ui/GCard';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { Button } from '@/components/ui/Button';
import {
    Loader2, AlertCircle, Sparkles, BarChart2,
    Utensils, Zap, Car, Plane, ShoppingBag, Laptop, Home, Heart,
    Gamepad2, BookOpen, Coffee, Music, Dumbbell, Gift, Bus, Wallet,
    TrendingUp, CreditCard,
} from 'lucide-react';

const ICON_MAP: Record<string, React.ElementType> = {
    utensils: Utensils, zap: Zap, car: Car, plane: Plane,
    'shopping-bag': ShoppingBag, laptop: Laptop, home: Home,
    heart: Heart, gamepad2: Gamepad2, 'book-open': BookOpen,
    coffee: Coffee, music: Music, dumbbell: Dumbbell, gift: Gift,
    bus: Bus, wallet: Wallet, 'trending-up': TrendingUp, 'credit-card': CreditCard,
};

function CategoryIcon({ name, size = 16, color }: { name: string; size?: number; color?: string }) {
    const Icon = ICON_MAP[name?.toLowerCase()] || Wallet;
    return <Icon size={size} color={color || 'var(--accent)'} />;
}

const fmt = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');

interface CalendarDay { day: number; actual?: number; projected?: number; isFuture: boolean; }
interface ForecastCategory { name: string; icon: string; color: string | null; avgMonthly: number; projected: number; spentSoFar: number; percentOfTotal: number; }
interface ForecastData { totalForecast: number; avgDaily: number; currentMonthSpent: number; daysElapsed: number; daysInMonth: number; daysRemaining: number; categories: ForecastCategory[]; calendarDays: CalendarDay[]; insight: string; insufficientData?: boolean; }

const card: React.CSSProperties = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 24, marginBottom: 16 };
const DAYS_HEADER = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function ForecastPage() {
    const router = useRouter();
    const { user, isLoading, loadFromStorage } = useAuthStore();
    const [forecast, setForecast]   = useState<ForecastData | null>(null);
    const [loading, setLoading]     = useState(false);
    const [generated, setGenerated] = useState(false);
    const [error, setError]         = useState('');

    useEffect(() => { loadFromStorage(); }, []);
    useEffect(() => { if (!isLoading && !user) router.push('/login'); }, [user, isLoading]);

    // Load from cache on mount — avoids re-fetching on every page visit
    useEffect(() => {
        if (!user) return;
        const now = new Date();
        const key = `forecast-cache-${user.id}-${now.getFullYear()}-${now.getMonth() + 1}`;
        try {
            const cached = localStorage.getItem(key);
            if (cached) {
                const { data, ts } = JSON.parse(cached);
                // 1-hour TTL
                if (Date.now() - ts < 60 * 60 * 1000) {
                    setForecast(data);
                    setGenerated(true);
                }
            }
        } catch { /* stale / corrupt — ignore */ }
    }, [user]);

    const fetchForecast = async () => {
        setError(''); setLoading(true);
        try {
            const res = await aiAPI.forecastCalendar(true);
            const data: ForecastData = res.data.data;
            setForecast(data); setGenerated(true);
            // Persist to cache
            if (user) {
                const now = new Date();
                const key = `forecast-cache-${user.id}-${now.getFullYear()}-${now.getMonth() + 1}`;
                try { localStorage.setItem(key, JSON.stringify({ data, ts: Date.now() })); } catch { /* storage full */ }
            }
        } catch (err: any) {
            setError(err?.response?.data?.error || 'Could not generate forecast. Please try again.');
        } finally { setLoading(false); }
    };

    if (isLoading || !user) return (
        <AppLayout>
            <SkeletonCard height={80} style={{ marginBottom: '16px' }} />
            <SkeletonCard height={300} />
        </AppLayout>
    );

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const todayDay = now.getDate();
    const firstDayOfMonth = new Date(year, month, 1).getDay();
    const monthLabel = `${MONTH_NAMES[month]} ${year}`;

    return (
        <AppLayout>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingBottom: '24px', animation: 'fadeUp 200ms ease forwards' }}>

                {/* Header */}
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)', padding: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 3px' }}>Forecast</h1>
                            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)' }}>AI spending prediction</p>
                        </div>
                        {generated && !loading && <Button variant="secondary" size="md" onClick={fetchForecast}>Regenerate</Button>}
                    </div>
                </div>

                {/* Error */}
                {error && (
                    <div style={{ ...card, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: 40 }}>
                        <AlertCircle size={28} color="var(--color-exp)" />
                        <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', margin: 0, fontFamily: 'var(--font-head)' }}>Could not generate forecast</p>
                        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, textAlign: 'center', fontFamily: 'var(--font-body)' }}>{error}</p>
                        <button type="button" onClick={fetchForecast} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 20px', color: 'var(--text-primary)', fontSize: 14, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>Try Again</button>
                    </div>
                )}

                {/* Loading */}
                {loading && (
                    <div style={{ ...card, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 80, gap: 14 }}>
                        <Loader2 size={28} color="var(--accent)" style={{ animation: 'spin 1s linear infinite' }} />
                        <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', margin: 0, fontFamily: 'var(--font-head)' }}>Generating your forecast...</p>
                    </div>
                )}

                {/* Empty */}
                {!generated && !loading && !error && (
                    <div style={{ textAlign: 'center', padding: '48px 24px' }}>
                        <p style={{ fontSize: '48px', marginBottom: '12px' }}>📅</p>
                        <p style={{ fontFamily: 'var(--font-head)', fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 8px' }}>No forecast yet</p>
                        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 20px', fontFamily: 'var(--font-body)' }}>Uses your last 3 months of transactions to predict this month's spending — no guesswork</p>
                        <Button variant="primary" size="md" onClick={fetchForecast}>Generate Forecast</Button>
                    </div>
                )}

                {/* Insufficient data */}
                {forecast?.insufficientData && !loading && (
                    <div style={{ ...card, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: 50, textAlign: 'center' }}>
                        <Sparkles size={32} color="var(--text-muted)" />
                        <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', margin: 0, fontFamily: 'var(--font-head)' }}>Not enough data yet</p>
                        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, maxWidth: 340, lineHeight: 1.6, fontFamily: 'var(--font-body)' }}>Add at least 1 week of transactions to generate a forecast.</p>
                        <button type="button" onClick={() => router.push('/transactions')} style={{ background: 'var(--accent)', color: 'white', border: 'none', borderRadius: 'var(--radius-md)', padding: '10px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>Go to Transactions</button>
                    </div>
                )}

                {forecast && !forecast.insufficientData && !loading && (
                    <>
                        {/* Stat tiles */}
                        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                            {[
                                { label: 'FORECASTED TOTAL', value: fmt(forecast.totalForecast), color: 'var(--accent)' },
                                { label: 'SPENT SO FAR',     value: fmt(forecast.currentMonthSpent), color: 'var(--color-exp)' },
                                { label: 'DAILY AVERAGE',    value: fmt(forecast.avgDaily), color: 'var(--color-warn)' },
                            ].map(tile => (
                                <div key={tile.label} style={{ flex: 1, minWidth: 140, background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '20px 24px' }}>
                                    <p style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.8px', margin: '0 0 8px', fontWeight: 600, fontFamily: 'var(--font-body)' }}>{tile.label}</p>
                                    <p style={{ fontFamily: 'var(--font-mono)', fontSize: 28, fontWeight: 700, color: tile.color, margin: 0, fontVariantNumeric: 'tabular-nums' }}>{tile.value}</p>
                                </div>
                            ))}
                        </div>

                        {/* Calendar */}
                        <div style={card}>
                            <p style={{ fontFamily: 'var(--font-head)', fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 16px' }}>{monthLabel}</p>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 4 }}>
                                {DAYS_HEADER.map(d => <div key={d} style={{ textAlign: 'center', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.5px', padding: '4px 0', fontFamily: 'var(--font-body)' }}>{d}</div>)}
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
                                {Array.from({ length: firstDayOfMonth }).map((_, i) => <div key={`empty-${i}`} style={{ minHeight: 64 }} />)}
                                {forecast.calendarDays.map(cd => {
                                    const isToday  = cd.day === todayDay;
                                    const hasActual = !cd.isFuture && (cd.actual || 0) > 0;
                                    return (
                                        <div key={cd.day} style={{ minHeight: 64, padding: '6px 8px', borderRadius: 8, background: hasActual ? 'var(--bg-hover)' : 'transparent', border: isToday ? '1px solid var(--accent)' : '1px solid transparent', opacity: cd.isFuture ? 0.75 : 1 }}>
                                            <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: isToday ? 700 : 400, marginBottom: 4, fontFamily: 'var(--font-body)' }}>{cd.day}</div>
                                            {hasActual && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, color: 'var(--color-exp)', lineHeight: 1.2, fontVariantNumeric: 'tabular-nums' }}>{fmt(cd.actual!)}</div>}
                                            {cd.isFuture && cd.projected! > 0 && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic', lineHeight: 1.2, fontVariantNumeric: 'tabular-nums' }}>~{fmt(cd.projected!)}</div>}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Category breakdown */}
                        <div style={card}>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 20 }}>
                                <p style={{ fontFamily: 'var(--font-head)', fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Category Breakdown</p>
                                <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>(last 3 months average)</span>
                            </div>
                            {forecast.categories.map(cat => (
                                <div key={cat.name} style={{ marginBottom: 20 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
                                        <CategoryIcon name={cat.icon} size={20} color={cat.color || 'var(--accent)'} />
                                        <span style={{ fontSize: 14, color: 'var(--text-primary)', fontWeight: 500, flex: 1, fontFamily: 'var(--font-body)' }}>{cat.name}</span>
                                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{fmt(cat.projected)}</span>
                                    </div>
                                    <div style={{ background: 'var(--bg-hover)', height: 6, borderRadius: 3, overflow: 'hidden', marginBottom: 4 }}>
                                        <div style={{ height: '100%', width: `${Math.min(cat.percentOfTotal, 100)}%`, background: cat.color || 'var(--accent)', borderRadius: 3 }} />
                                    </div>
                                    <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)', margin: 0, fontVariantNumeric: 'tabular-nums' }}>{fmt(cat.spentSoFar)} spent so far this month</p>
                                </div>
                            ))}
                        </div>

                        {/* AI Insight */}
                        {forecast.insight && (
                            <GCard style={{ background: 'color-mix(in srgb, var(--color-info) 6%, var(--bg-card))', border: '1.5px solid color-mix(in srgb, var(--color-info) 18%, transparent)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
                                    <Sparkles size={16} color="var(--color-info)" />
                                    <span style={{ fontFamily: 'var(--font-head)', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>AI Insight</span>
                                </div>
                                <div style={{ borderLeft: '3px solid var(--accent)', paddingLeft: 16 }}>
                                    <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.8, fontFamily: 'var(--font-body)' }}>{forecast.insight}</p>
                                </div>
                            </GCard>
                        )}
                    </>
                )}
            </div>
        </AppLayout>
    );
}
