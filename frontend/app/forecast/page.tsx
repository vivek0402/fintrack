'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { aiAPI } from '@/lib/api';
import { AppLayout } from '@/components/layout/AppLayout';
import {
    Loader2, AlertCircle, Sparkles,
    Utensils, Zap, Car, Plane, ShoppingBag, Laptop, Home, Heart,
    Gamepad2, BookOpen, Coffee, Music, Dumbbell, Gift, Bus, Wallet,
    TrendingUp, CreditCard,
} from 'lucide-react';

const ICON_MAP: Record<string, React.ElementType> = {
    utensils: Utensils, zap: Zap, car: Car, plane: Plane,
    'shopping-bag': ShoppingBag, laptop: Laptop, home: Home,
    heart: Heart, gamepad2: Gamepad2, 'book-open': BookOpen,
    coffee: Coffee, music: Music, dumbbell: Dumbbell, gift: Gift,
    bus: Bus, wallet: Wallet, 'trending-up': TrendingUp,
    'credit-card': CreditCard,
};

function CategoryIcon({ name, size = 16, color }: { name: string; size?: number; color?: string }) {
    const Icon = ICON_MAP[name?.toLowerCase()] || Wallet;
    return <Icon size={size} color={color || 'var(--accent-blue)'} />;
}

function fmt(n: number) {
    return '₹' + Math.round(n).toLocaleString('en-IN');
}

interface CalendarDay {
    day: number;
    actual?: number;
    projected?: number;
    isFuture: boolean;
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
    avgDaily: number;
    currentMonthSpent: number;
    daysElapsed: number;
    daysInMonth: number;
    daysRemaining: number;
    categories: ForecastCategory[];
    calendarDays: CalendarDay[];
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

const DAYS_HEADER = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

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
        return <AppLayout><div style={{ maxWidth: 800, margin: '0 auto' }} /></AppLayout>;
    }

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const todayDay = now.getDate();
    const firstDayOfMonth = new Date(year, month, 1).getDay();
    const monthLabel = `${MONTH_NAMES[month]} ${year}`;

    return (
        <AppLayout>
            <div style={{ maxWidth: 800, margin: '0 auto' }}>
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
                                background: 'var(--bg-hover)', border: '1px solid var(--bg-border)',
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
                        <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Could not generate forecast</p>
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
                            Generating your forecast...
                        </p>
                    </div>
                )}

                {/* Empty state */}
                {!generated && !loading && !error && (
                    <div style={{ ...card, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 80, gap: 16, textAlign: 'center' }}>
                        <Sparkles size={48} color="var(--accent-blue)" />
                        <div>
                            <p style={{ fontFamily: 'Sora, sans-serif', fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 8px' }}>
                                Generate Your Spending Forecast
                            </p>
                            <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: 0, maxWidth: 380, lineHeight: 1.6 }}>
                                Uses your last 3 months of transactions to predict this month's spending — no guesswork
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

                {/* Insufficient data */}
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
                            padding: '10px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                        }}>
                            Go to Transactions
                        </button>
                    </div>
                )}

                {forecast && !forecast.insufficientData && !loading && (
                    <>
                        {/* Section 1 — Stat tiles */}
                        <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
                            {[
                                { label: 'FORECASTED TOTAL', value: fmt(forecast.totalForecast), color: 'var(--accent-blue)' },
                                { label: 'SPENT SO FAR', value: fmt(forecast.currentMonthSpent), color: 'var(--accent-red)' },
                                { label: 'DAILY AVERAGE', value: fmt(forecast.avgDaily), color: 'var(--accent-yellow)' },
                            ].map(tile => (
                                <div key={tile.label} style={{
                                    flex: 1, minWidth: 140,
                                    background: 'var(--bg-card)',
                                    border: '1px solid var(--bg-border)',
                                    borderRadius: 12,
                                    padding: '20px 24px',
                                }}>
                                    <p style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase' as const, letterSpacing: '0.8px', margin: '0 0 8px', fontWeight: 600 }}>
                                        {tile.label}
                                    </p>
                                    <p style={{ fontFamily: 'Sora, sans-serif', fontSize: 28, fontWeight: 700, color: tile.color, margin: 0 }}>
                                        {tile.value}
                                    </p>
                                </div>
                            ))}
                        </div>

                        {/* Section 2 — Monthly Calendar */}
                        <div style={card}>
                            <p style={{ fontFamily: 'Sora, sans-serif', fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 16px' }}>
                                {monthLabel}
                            </p>

                            {/* Day headers */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 4 }}>
                                {DAYS_HEADER.map(d => (
                                    <div key={d} style={{ textAlign: 'center', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.5px', padding: '4px 0' }}>
                                        {d}
                                    </div>
                                ))}
                            </div>

                            {/* Calendar grid */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
                                {/* Empty offset cells */}
                                {Array.from({ length: firstDayOfMonth }).map((_, i) => (
                                    <div key={`empty-${i}`} style={{ minHeight: 64 }} />
                                ))}

                                {/* Day cells */}
                                {forecast.calendarDays.map(cd => {
                                    const isToday = cd.day === todayDay;
                                    const hasActual = !cd.isFuture && (cd.actual || 0) > 0;

                                    return (
                                        <div key={cd.day} style={{
                                            minHeight: 64,
                                            padding: '6px 8px',
                                            borderRadius: 8,
                                            background: hasActual ? 'var(--bg-hover)' : 'transparent',
                                            border: isToday ? '1px solid var(--accent-blue)' : '1px solid transparent',
                                            position: 'relative',
                                            opacity: cd.isFuture ? 0.75 : 1,
                                        }}>
                                            <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: isToday ? 700 : 400, marginBottom: 4 }}>
                                                {cd.day}
                                            </div>
                                            {hasActual && (
                                                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent-red)', lineHeight: 1.2 }}>
                                                    {fmt(cd.actual!)}
                                                </div>
                                            )}
                                            {cd.isFuture && cd.projected! > 0 && (
                                                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic', lineHeight: 1.2 }}>
                                                    ~{fmt(cd.projected!)}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Section 3 — Category Breakdown */}
                        <div style={card}>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 20 }}>
                                <p style={{ fontFamily: 'Sora, sans-serif', fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                                    Category Breakdown
                                </p>
                                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>(last 3 months average)</span>
                            </div>

                            {forecast.categories.map(cat => (
                                <div key={cat.name} style={{ marginBottom: 20 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
                                        <CategoryIcon name={cat.icon} size={20} color={cat.color || 'var(--accent-blue)'} />
                                        <span style={{ fontSize: 14, color: 'var(--text-primary)', fontWeight: 500, flex: 1 }}>
                                            {cat.name}
                                        </span>
                                        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
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
                                        {fmt(cat.spentSoFar)} spent so far this month
                                    </p>
                                </div>
                            ))}
                        </div>

                        {/* Section 4 — AI Insight */}
                        {forecast.insight && (
                            <div style={card}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
                                    <Sparkles size={16} color="var(--accent-blue)" />
                                    <span style={{ fontFamily: 'Sora, sans-serif', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                                        AI Insight
                                    </span>
                                </div>
                                <div style={{ borderLeft: '3px solid var(--accent-blue)', paddingLeft: 16 }}>
                                    <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.8 }}>
                                        {forecast.insight}
                                    </p>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </AppLayout>
    );
}
