'use client';

import { useEffect, useState, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
    PiggyBank, Zap, Flame, Loader2, AlertCircle, Sparkles,
    Utensils, Car, Plane, ShoppingBag, Laptop, Home, Heart,
    Gamepad2, BookOpen, Coffee, Music, Dumbbell, Gift, Bus, Wallet,
    TrendingUp, CreditCard,
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { analyticsAPI, goalsAPI, transactionsAPI, aiAPI } from '@/lib/api';
import { useUserQuery } from '@/hooks/queries';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Badge } from '@/components/ui/Badge';
import { Skeleton, SkeletonCard } from '@/components/ui/Skeleton';
import { useIsMobile } from '@/hooks/useWindowSize';
import { Tabs } from '@/components/ui/Tabs';
import { Button } from '@/components/ui/Button';
import { fmt } from '@/lib/utils';

const AUTO_SAVE_KEY = 'fintrack-auto-save-plan';
const ROUND_UP_KEY = 'fintrack-round-up-plan';

const TABS = [
    { key: 'savings-plan', label: 'Savings Plan' },
    { key: 'forecast',     label: 'Forecast' },
];

// ─────────────────────────────────────────────────────────────────────────
// SAVINGS PLAN — shared constants
// ─────────────────────────────────────────────────────────────────────────

const roundUp10 = (n: number) => Math.ceil(n / 10) * 10;

function projectedDate(remaining: number, monthly: number): string {
    if (monthly <= 0 || remaining <= 0) return '';
    const months = Math.ceil(remaining / monthly);
    const d = new Date();
    d.setMonth(d.getMonth() + months);
    return d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

// ─────────────────────────────────────────────────────────────────────────
// FORECAST — shared constants
// ─────────────────────────────────────────────────────────────────────────

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

interface CalendarDay { day: number; actual?: number; projected?: number; isFuture: boolean; }
interface ForecastCategory { name: string; icon: string; color: string | null; avgMonthly: number; projected: number; spentSoFar: number; percentOfTotal: number; }
interface ForecastData { totalForecast: number; avgDaily: number; currentMonthSpent: number; daysElapsed: number; daysInMonth: number; daysRemaining: number; categories: ForecastCategory[]; calendarDays: CalendarDay[]; insight: string; insufficientData?: boolean; }

const forecastCard: React.CSSProperties = { borderRadius: 'var(--radius-lg)', padding: 24, marginBottom: 16 };
const DAYS_HEADER = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const NO_ROWS: any[] = [];

function SavingsPlanPageInner() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { user, isLoading, loadFromStorage } = useAuthStore();
    const isMobile = useIsMobile();

    const initialTab = searchParams.get('tab');
    const [tab, setTab] = useState(TABS.some(t => t.key === initialTab) ? initialTab! : 'savings-plan');

    // ── Savings Plan state ──
    // From the shared cache: revisits show the plan at once and refresh in
    // the background. The all-time transaction list stays in memory only.
    const planQuery = useUserQuery('savings-plan', [], async () => {
        const [sumRes, goalsRes, trendsRes] = await Promise.all([
            analyticsAPI.summary(), goalsAPI.getAll(), analyticsAPI.trends(),
        ]);
        return {
            summary: sumRes.data.summary,
            goals: (goalsRes.data.goals ?? []) as any[],
            trends: (trendsRes.data.trends ?? []) as any[],
        };
    });
    const allTxQuery = useUserQuery('transactions-all', [],
        async () => ((await transactionsAPI.getAll()).data.transactions ?? []) as any[],
        { persist: false });
    const summary = planQuery.data?.summary ?? null;
    const goals: any[] = planQuery.data?.goals ?? NO_ROWS;
    const trends: any[] = planQuery.data?.trends ?? NO_ROWS;
    const transactions: any[] = allTxQuery.data ?? NO_ROWS;
    const dataLoading = planQuery.isPending || allTxQuery.isPending;

    const [savePlan, setSavePlan]               = useState<Record<string, number>>({});
    const [roundUpEnabled, setRoundUpEnabled]   = useState(false);
    const [roundUpGoalId, setRoundUpGoalId]     = useState('');

    // ── Forecast state ──
    const [forecast, setForecast]   = useState<ForecastData | null>(null);
    const [forecastLoading, setForecastLoading]     = useState(false);
    const [forecastGenerated, setForecastGenerated] = useState(false);
    const [forecastError, setForecastError]         = useState('');

    useEffect(() => { loadFromStorage(); }, []);
    useEffect(() => { if (!isLoading && !user) router.push('/login'); }, [user, isLoading]);

    useEffect(() => {
        try {
            const raw = localStorage.getItem(AUTO_SAVE_KEY);
            if (raw) setSavePlan(JSON.parse(raw));
        } catch {}
        try {
            const raw = localStorage.getItem(ROUND_UP_KEY);
            if (raw) {
                const { enabled, goalId } = JSON.parse(raw);
                setRoundUpEnabled(!!enabled);
                setRoundUpGoalId(goalId || '');
            }
        } catch {}
    }, []);

    // Load forecast from cache on mount — avoids re-fetching on every page visit
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
                    setForecastGenerated(true);
                }
            }
        } catch { /* stale / corrupt — ignore */ }
    }, [user]);

    const fetchForecast = async (force = false) => {
        setForecastError(''); setForecastLoading(true);
        try {
            const res = await aiAPI.forecastCalendar(force);
            const data: ForecastData = res.data.data;
            setForecast(data); setForecastGenerated(true);
            // Persist to cache
            if (user) {
                const now = new Date();
                const key = `forecast-cache-${user.id}-${now.getFullYear()}-${now.getMonth() + 1}`;
                try { localStorage.setItem(key, JSON.stringify({ data, ts: Date.now() })); } catch { /* storage full */ }
            }
        } catch (err: any) {
            setForecastError(err?.response?.data?.error || 'Could not generate forecast. Please try again.');
        } finally { setForecastLoading(false); }
    };

    const updateSavePlan = (goalId: string, amount: number) => {
        const next = { ...savePlan, [goalId]: amount };
        setSavePlan(next);
        localStorage.setItem(AUTO_SAVE_KEY, JSON.stringify(next));
    };

    const updateRoundUp = (next: { enabled: boolean; goalId: string }) => {
        setRoundUpEnabled(next.enabled);
        setRoundUpGoalId(next.goalId);
        localStorage.setItem(ROUND_UP_KEY, JSON.stringify(next));
    };

    // ── Derived: Savings Plan ──────────────────────────────────────────────

    const income = summary?.total_income ?? 0;

    const totalAutoSave = useMemo(
        () => Object.values(savePlan).reduce((s: number, v: number) => s + v, 0),
        [savePlan]
    );

    const roundUpMonthly = useMemo(() => {
        const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
        return transactions
            .filter(tx => tx.type === 'expense' && new Date((tx.date || '').split('T')[0] + 'T00:00:00').getTime() >= cutoff)
            .reduce((sum, tx) => { const a = parseFloat(tx.amount); return sum + (roundUp10(a) - a); }, 0);
    }, [transactions]);

    const streak = useMemo(() => {
        const monthMap: Record<string, { inc: number; exp: number }> = {};
        trends.forEach(row => {
            const key = `${row.year}-${String(row.month).padStart(2, '0')}`;
            if (!monthMap[key]) monthMap[key] = { inc: 0, exp: 0 };
            if (row.type === 'income') monthMap[key].inc += parseFloat(row.total);
            else monthMap[key].exp += parseFloat(row.total);
        });
        const sorted = Object.keys(monthMap).sort();
        let count = 0;
        for (let i = sorted.length - 1; i >= 0; i--) {
            const { inc, exp } = monthMap[sorted[i]];
            if (inc > exp) count++; else break;
        }
        return count;
    }, [trends]);

    const activeGoals = goals.filter(g => parseFloat(g.saved_amount) < parseFloat(g.target_amount));
    const autoSavePct = income > 0 ? (totalAutoSave / income * 100).toFixed(1) : '0';

    const spCard: React.CSSProperties = {
        borderRadius: 'var(--radius-lg)', padding: '20px', marginBottom: 0,
    };
    const sHead = (icon: React.ReactNode, title: string) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            {icon}
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>{title}</h2>
        </div>
    );

    // ── Derived: Forecast ──────────────────────────────────────────────────

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const todayDay = now.getDate();
    const firstDayOfMonth = new Date(year, month, 1).getDay();
    const monthLabel = `${MONTH_NAMES[month]} ${year}`;

    // Signing-in check still running: a skeleton, like every other page,
    // instead of an empty box.
    if (isLoading || !user) return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <SkeletonCard height={88} />
            <SkeletonCard height={200} />
            <SkeletonCard height={200} />
        </div>
    );

    return (
        <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: 24, animation: 'fadeUp 200ms ease forwards' }}>

                {/* ── HEADER ── */}
                <div className="glass-surface" style={spCard}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ width: 40, height: 40, borderRadius: 12, background: 'color-mix(in srgb, var(--color-inc) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--color-inc) 22%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <PiggyBank size={20} color="var(--color-inc)" />
                        </div>
                        <div>
                            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', margin: 0, lineHeight: 1.2 }}>Savings Planner</h1>
                            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)' }}>Automate your savings and forecast the month</p>
                        </div>
                    </div>
                    {income > 0 && tab === 'savings-plan' && (
                        <div style={{ marginTop: 14, padding: '10px 14px', background: 'color-mix(in srgb, var(--color-inc) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--color-inc) 20%, transparent)', borderRadius: 'var(--radius-md)' }}>
                            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, fontFamily: 'var(--font-body)' }}>
                                💰 Income detected:&nbsp;
                                <strong style={{ color: 'var(--color-inc)', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>{fmt(income)}/mo</strong>
                            </p>
                        </div>
                    )}
                </div>

                <Tabs tabs={TABS} active={tab} onChange={setTab} />

                {/* ══════════════════════ SAVINGS PLAN ══════════════════════ */}
                {tab === 'savings-plan' && (
                    <>
                        {/* ── SECTION 1 — PAY YOURSELF FIRST ── */}
                        <div className="glass-surface" style={spCard}>
                            {sHead(<PiggyBank size={16} color="var(--accent)" />, 'Pay Yourself First')}

                            {dataLoading ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                    {[1, 2].map(i => <Skeleton key={i} height={72} borderRadius={10} />)}
                                </div>
                            ) : activeGoals.length === 0 ? (
                                <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '16px 0', fontFamily: 'var(--font-body)' }}>
                                    No active goals.{' '}
                                    <Link href="/goals" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>Create one →</Link>
                                </p>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                    {activeGoals.map(goal => {
                                        const saved     = parseFloat(goal.saved_amount);
                                        const target    = parseFloat(goal.target_amount);
                                        const remaining = Math.max(target - saved, 0);
                                        const pct       = Math.min((saved / target) * 100, 100);
                                        const monthly   = savePlan[goal.id] ?? 0;
                                        const projected = projectedDate(remaining, monthly);

                                        const isOnTrack: boolean | null = goal.deadline && monthly > 0 ? (() => {
                                            const days = Math.ceil((new Date(goal.deadline + 'T00:00:00').getTime() - Date.now()) / 86400000);
                                            return days > 0 && Math.ceil(remaining / monthly) <= Math.ceil(days / 30);
                                        })() : null;

                                        return (
                                            <div key={goal.id} className="glass-field" style={{ padding: 14, borderRadius: 'var(--radius-md)' }}>
                                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                                                            <span style={{ fontSize: 16 }}>{goal.icon || goal.emoji || '🎯'}</span>
                                                            <span style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{goal.name}</span>
                                                            {isOnTrack !== null && (
                                                                <Badge color={isOnTrack ? 'var(--color-inc)' : 'var(--color-warn)'} bg={isOnTrack ? 'color-mix(in srgb, var(--color-inc) 10%, transparent)' : 'color-mix(in srgb, var(--color-warn) 10%, transparent)'}>
                                                                    {isOnTrack ? '✓ On track' : '⚠ Adjust'}
                                                                </Badge>
                                                            )}
                                                        </div>
                                                        <ProgressBar pct={pct} color={goal.color || 'var(--accent)'} height={4} />
                                                        <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '4px 0 0', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>
                                                            {fmt(saved)} / {fmt(target)}
                                                        </p>
                                                    </div>
                                                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                                        <p style={{ fontSize: 10, color: 'var(--text-muted)', margin: '0 0 4px', fontFamily: 'var(--font-body)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Monthly</p>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                                                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>₹</span>
                                                            <input
                                                                type="number" min="0"
                                                                value={monthly || ''}
                                                                placeholder="0"
                                                                onChange={e => updateSavePlan(goal.id, parseFloat(e.target.value) || 0)}
                                                                style={{ width: 76, background: 'var(--glass-fill-1)', border: '1px solid var(--glass-border)', borderRadius: 6, padding: '4px 8px', color: 'var(--text-primary)', fontSize: 13, fontFamily: 'var(--font-mono)', outline: 'none', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                                {projected && (
                                                    <p style={{ fontSize: 11, color: 'var(--accent)', margin: '8px 0 0', fontFamily: 'var(--font-body)' }}>
                                                        At {fmt(monthly)}/mo → reach goal by <strong>{projected}</strong>
                                                    </p>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {totalAutoSave > 0 && (
                                <div style={{ marginTop: 14, padding: '12px 16px', background: 'color-mix(in srgb, var(--accent) 6%, transparent)', border: '1px solid color-mix(in srgb, var(--accent) 20%, transparent)', borderRadius: 'var(--radius-md)' }}>
                                    <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: 0, fontFamily: 'var(--font-display)' }}>
                                        Total auto-saving:{' '}
                                        <span style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>{fmt(totalAutoSave)}/mo</span>
                                        {income > 0 && <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}> ({autoSavePct}% of income)</span>}
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* ── SECTION 2 — ROUND-UP SIMULATOR ── */}
                        <div className="glass-surface" style={spCard}>
                            {sHead(<Zap size={16} color="var(--color-warn)" />, 'Round-Up Savings Simulator')}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                                <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, fontFamily: 'var(--font-body)' }}>Enable round-up savings</p>
                                <button
                                    type="button"
                                    onClick={() => updateRoundUp({ enabled: !roundUpEnabled, goalId: roundUpGoalId })}
                                    aria-label={roundUpEnabled ? 'Disable round-up' : 'Enable round-up'}
                                    style={{ width: 44, height: 24, borderRadius: 12, background: roundUpEnabled ? 'var(--color-inc)' : 'var(--border-visible)', border: 'none', cursor: 'pointer', position: 'relative', transition: 'background var(--transition-fast)', flexShrink: 0 }}
                                >
                                    <span style={{ position: 'absolute', top: 2, left: roundUpEnabled ? 22 : 2, width: 20, height: 20, borderRadius: '50%', background: 'white', transition: 'left var(--transition-fast)', display: 'block' }} />
                                </button>
                            </div>

                            {roundUpEnabled && (
                                <>
                                    <div className="glass-field" style={{ padding: '14px 16px', borderRadius: 'var(--radius-md)', marginBottom: 12 }}>
                                        <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 4px', fontFamily: 'var(--font-body)' }}>Based on your last 30 days:</p>
                                        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 700, color: 'var(--color-warn)', margin: '0 0 2px', fontVariantNumeric: 'tabular-nums' }}>
                                            ~{fmt(roundUpMonthly)}/mo in round-ups
                                        </p>
                                        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)' }}>
                                            → {fmt(roundUpMonthly * 12)}/year if you round every transaction to the nearest ₹10
                                        </p>
                                    </div>
                                    {activeGoals.length > 0 && (
                                        <>
                                            <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 6px', fontFamily: 'var(--font-body)', fontWeight: 600 }}>Assign round-ups to a goal:</p>
                                            <select
                                                value={roundUpGoalId}
                                                onChange={e => updateRoundUp({ enabled: roundUpEnabled, goalId: e.target.value })}
                                                className="glass-field"
                                                style={{ width: '100%', borderRadius: 8, padding: '8px 12px', color: 'var(--text-primary)', fontSize: 13, fontFamily: 'var(--font-body)', outline: 'none' }}
                                            >
                                                <option value="">— Select a goal —</option>
                                                {activeGoals.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                                            </select>
                                            {roundUpGoalId && (
                                                <p style={{ fontSize: 11, color: 'var(--color-inc)', margin: '8px 0 0', fontFamily: 'var(--font-body)' }}>
                                                    ✓ ~{fmt(roundUpMonthly)}/mo allocated to &quot;{activeGoals.find(g => g.id === roundUpGoalId)?.name}&quot;
                                                </p>
                                            )}
                                        </>
                                    )}
                                </>
                            )}
                        </div>

                        {/* ── SECTION 3 — SAVINGS STREAK ── */}
                        <div className="glass-surface" style={spCard}>
                            {sHead(<Flame size={16} color="#f97316" />, 'Savings Streak')}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                                <span style={{ fontSize: `${Math.max(28, Math.min(52, 28 + streak * 4))}px`, lineHeight: 1, userSelect: 'none', flexShrink: 0 }}>🔥</span>
                                {streak > 0 ? (
                                    <div>
                                        <p style={{ fontFamily: 'var(--font-mono)', fontSize: isMobile ? 22 : 26, fontWeight: 800, color: '#f97316', margin: 0, fontVariantNumeric: 'tabular-nums', animation: 'numberReveal 400ms cubic-bezier(0.22,1,0.36,1) both' }}>
                                            {streak}-month streak
                                        </p>
                                        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '3px 0 0', fontFamily: 'var(--font-body)' }}>
                                            {streak >= 6 ? '🏆 Incredible discipline — you\'re a saver!' : streak >= 3 ? '💪 Great momentum, keep it going!' : '✅ Good start — build the habit!'}
                                        </p>
                                    </div>
                                ) : (
                                    <div>
                                        <p style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>No streak yet</p>
                                        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0', fontFamily: 'var(--font-body)' }}>Spend less than you earn this month to start your streak</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </>
                )}

                {/* ══════════════════════ FORECAST ══════════════════════ */}
                {tab === 'forecast' && (
                    <>
                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                            {forecastGenerated && !forecastLoading && <Button variant="secondary" size="md" onClick={() => fetchForecast(true)}>Regenerate</Button>}
                        </div>

                        {/* Error */}
                        {forecastError && (
                            <div className="glass-surface" style={{ ...forecastCard, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: 40 }}>
                                <AlertCircle size={28} color="var(--color-exp)" />
                                <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', margin: 0, fontFamily: 'var(--font-display)' }}>Could not generate forecast</p>
                                <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, textAlign: 'center', fontFamily: 'var(--font-body)' }}>{forecastError}</p>
                                <button type="button" onClick={() => fetchForecast(true)} style={{ background: 'none', border: '1px solid var(--glass-border)', borderRadius: 8, padding: '8px 20px', color: 'var(--text-primary)', fontSize: 14, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>Try Again</button>
                            </div>
                        )}

                        {/* Loading */}
                        {forecastLoading && (
                            <div className="glass-surface" style={{ ...forecastCard, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 80, gap: 14 }}>
                                <Loader2 size={28} color="var(--accent)" style={{ animation: 'spin 1s linear infinite' }} />
                                <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', margin: 0, fontFamily: 'var(--font-display)' }}>Generating your forecast...</p>
                            </div>
                        )}

                        {/* Empty */}
                        {!forecastGenerated && !forecastLoading && !forecastError && (
                            <div style={{ textAlign: 'center', padding: '48px 24px' }}>
                                <p style={{ fontSize: '48px', marginBottom: '12px' }}>📅</p>
                                <p style={{ fontFamily: 'var(--font-display)', fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 8px' }}>No forecast yet</p>
                                <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 20px', fontFamily: 'var(--font-body)' }}>Uses your last 3 months of transactions to predict this month&apos;s spending — no guesswork</p>
                                <Button variant="primary" size="md" onClick={() => fetchForecast()}>Generate Forecast</Button>
                            </div>
                        )}

                        {/* Insufficient data */}
                        {forecast?.insufficientData && !forecastLoading && (
                            <div className="glass-surface" style={{ ...forecastCard, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: 50, textAlign: 'center' }}>
                                <Sparkles size={32} color="var(--text-muted)" />
                                <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', margin: 0, fontFamily: 'var(--font-display)' }}>Not enough data yet</p>
                                <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, maxWidth: 340, lineHeight: 1.6, fontFamily: 'var(--font-body)' }}>Add at least 1 week of transactions to generate a forecast.</p>
                                <button type="button" onClick={() => router.push('/transactions')} style={{ background: 'var(--accent)', color: 'white', border: 'none', borderRadius: 'var(--radius-md)', padding: '10px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>Go to Transactions</button>
                            </div>
                        )}

                        {forecast && !forecast.insufficientData && !forecastLoading && (
                            <>
                                {/* Stat tiles */}
                                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                                    {[
                                        { label: 'FORECASTED TOTAL', value: fmt(forecast.totalForecast), color: 'var(--accent)' },
                                        { label: 'SPENT SO FAR',     value: fmt(forecast.currentMonthSpent), color: 'var(--color-exp)' },
                                        { label: 'DAILY AVERAGE',    value: fmt(forecast.avgDaily), color: 'var(--color-warn)' },
                                    ].map(tile => (
                                        <div key={tile.label} className="glass-surface" style={{ flex: 1, minWidth: 140, borderRadius: 'var(--radius-md)', padding: '20px 24px' }}>
                                            <p style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.8px', margin: '0 0 8px', fontWeight: 600, fontFamily: 'var(--font-body)' }}>{tile.label}</p>
                                            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 28, fontWeight: 700, color: tile.color, margin: 0, fontVariantNumeric: 'tabular-nums' }}>{tile.value}</p>
                                        </div>
                                    ))}
                                </div>

                                {/* Calendar */}
                                <div className="glass-surface" style={forecastCard}>
                                    <p style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 16px' }}>{monthLabel}</p>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 4 }}>
                                        {DAYS_HEADER.map(d => <div key={d} style={{ textAlign: 'center', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.5px', padding: '4px 0', fontFamily: 'var(--font-body)' }}>{d}</div>)}
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
                                        {Array.from({ length: firstDayOfMonth }).map((_, i) => <div key={`empty-${i}`} style={{ minHeight: 64 }} />)}
                                        {forecast.calendarDays.map(cd => {
                                            const isToday  = cd.day === todayDay;
                                            const hasActual = !cd.isFuture && (cd.actual || 0) > 0;
                                            return (
                                                <div key={cd.day} style={{ minHeight: 64, padding: '6px 8px', borderRadius: 8, background: hasActual ? 'var(--glass-fill-1)' : 'transparent', border: isToday ? '1px solid var(--accent)' : '1px solid transparent', opacity: cd.isFuture ? 0.75 : 1 }}>
                                                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: isToday ? 700 : 400, marginBottom: 4, fontFamily: 'var(--font-body)' }}>{cd.day}</div>
                                                    {hasActual && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600, color: 'var(--color-exp)', lineHeight: 1.2, fontVariantNumeric: 'tabular-nums' }}>{fmt(cd.actual!)}</div>}
                                                    {cd.isFuture && cd.projected! > 0 && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic', lineHeight: 1.2, fontVariantNumeric: 'tabular-nums' }}>~{fmt(cd.projected!)}</div>}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Category breakdown */}
                                <div className="glass-surface" style={forecastCard}>
                                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 20 }}>
                                        <p style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Category Breakdown</p>
                                        <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>(last 3 months average)</span>
                                    </div>
                                    {forecast.categories.map(cat => (
                                        <div key={cat.name} style={{ marginBottom: 20 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
                                                <CategoryIcon name={cat.icon} size={20} color={cat.color || 'var(--accent)'} />
                                                <span style={{ fontSize: 14, color: 'var(--text-primary)', fontWeight: 500, flex: 1, fontFamily: 'var(--font-body)' }}>{cat.name}</span>
                                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{fmt(cat.projected)}</span>
                                            </div>
                                            <div style={{ background: 'var(--border-subtle)', height: 6, borderRadius: 3, overflow: 'hidden', marginBottom: 4 }}>
                                                <div style={{ height: '100%', width: `${Math.min(cat.percentOfTotal, 100)}%`, background: cat.color || 'var(--accent)', borderRadius: 3 }} />
                                            </div>
                                            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)', margin: 0, fontVariantNumeric: 'tabular-nums' }}>{fmt(cat.spentSoFar)} spent so far this month</p>
                                        </div>
                                    ))}
                                </div>

                                {/* AI Insight */}
                                {forecast.insight && (
                                    <div className="glass-surface" style={{ padding: 'var(--space-4)', background: 'color-mix(in srgb, var(--color-info) 6%, var(--glass-surface))', borderColor: 'color-mix(in srgb, var(--color-info) 18%, var(--glass-border))' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
                                            <Sparkles size={16} color="var(--color-info)" />
                                            <span style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>AI Insight</span>
                                        </div>
                                        <div style={{ borderLeft: '3px solid var(--accent)', paddingLeft: 16 }}>
                                            <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.8, fontFamily: 'var(--font-body)' }}>{forecast.insight}</p>
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </>
                )}

            </div>
        </>
    );
}

export default function SavingsPlanPage() {
    return <Suspense><SavingsPlanPageInner /></Suspense>;
}
