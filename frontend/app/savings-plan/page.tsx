'use client';

import { useEffect, useState, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/store/authStore';
import { analyticsAPI, goalsAPI, transactionsAPI, aiAPI } from '@/lib/api';
import { useUserQuery } from '@/hooks/queries';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Skeleton, SkeletonCard } from '@/components/ui/Skeleton';
import { useIsMobile } from '@/hooks/useWindowSize';
import { Tabs } from '@/components/ui/Tabs';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { CardHeader, Rows, Stat, Switch, TONE_TEXT } from '@/components/ui/CardParts';
import { Input } from '@/components/ui/Input';
import { fmt } from '@/lib/utils';
import { type, truncate } from '@/lib/typography';
import { projectedDate, goalTrack, sortGoalsNeedingMore, savingStreak, roundUpTotal } from '@/lib/savingsPlan';

const AUTO_SAVE_KEY = 'fintrack-auto-save-plan';
const ROUND_UP_KEY = 'fintrack-round-up-plan';

const TABS = [
    { key: 'savings-plan', label: 'Savings plan' },
    { key: 'forecast',     label: 'Forecast' },
];

interface CalendarDay { day: number; actual?: number; projected?: number; isFuture: boolean; }
interface ForecastCategory { name: string; icon: string; color: string | null; avgMonthly: number; projected: number; spentSoFar: number; percentOfTotal: number; }
interface ForecastData { totalForecast: number; avgDaily: number; currentMonthSpent: number; daysElapsed: number; daysInMonth: number; daysRemaining: number; categories: ForecastCategory[]; calendarDays: CalendarDay[]; insight: string; insufficientData?: boolean; }

const DAYS_HEADER = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const NO_ROWS: any[] = [];

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

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

    const roundUpMonthly = useMemo(() => roundUpTotal(transactions), [transactions]);
    const streak = useMemo(() => savingStreak(trends), [trends]);

    const activeGoals = goals.filter(g => parseFloat(g.saved_amount) < parseFloat(g.target_amount));
    const sortedGoals = sortGoalsNeedingMore(activeGoals, g => goalTrack(g, savePlan[g.id] ?? 0));
    const fundedCount = activeGoals.filter(g => (savePlan[g.id] ?? 0) > 0).length;
    const autoSavePct = income > 0 ? (totalAutoSave / income * 100).toFixed(1) : '0';
    const roundUpGoalName = activeGoals.find(g => g.id === roundUpGoalId)?.name;

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

    const selectStyle: React.CSSProperties = {
        ...type.body, color: 'var(--text-primary)', width: '100%', height: 40, padding: '0 var(--space-3)',
        background: 'var(--glass-fill-1)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-md)',
        outline: 'none', boxSizing: 'border-box', cursor: 'pointer',
    };

    const showForecastData = !!forecast && !forecast.insufficientData && !forecastLoading;

    return (
        <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: 24, animation: 'fadeUp 200ms ease forwards' }}>

                {/* ── HEADER ── */}
                <div className="fin-page-head">
                    <div style={{ minWidth: 0 }}>
                        <p style={{ ...type.meta, margin: 0 }}>Automate your savings and forecast the month</p>
                        <h1 style={{ ...type.heading, margin: 0 }}>Savings planner</h1>
                    </div>
                    {tab === 'forecast' && forecastGenerated && !forecastLoading && (
                        <div className="fin-page-actions">
                            <Button variant="secondary" size="md" onClick={() => fetchForecast(true)}>Regenerate</Button>
                        </div>
                    )}
                </div>

                <Tabs tabs={TABS} active={tab} onChange={setTab} />

                {/* ══════════════════════ SAVINGS PLAN ══════════════════════ */}
                {tab === 'savings-plan' && (
                    <>
                        <Card>
                            <p style={{ ...type.label, margin: 0 }}>Set aside each month</p>
                            <p className="type-display" style={{ ...type.display, margin: '6px 0 0' }}>{fmt(totalAutoSave)}</p>
                            <p style={{ ...type.meta, margin: '6px 0 0' }}>
                                {income > 0 ? `${autoSavePct}% of your ${fmt(income)} monthly income` : 'Set an amount for each goal below.'}
                            </p>
                            <div className="dash-stats">
                                <Stat className="dash-stat" label="Round-ups"
                                    value={roundUpEnabled ? `~${fmt(roundUpMonthly)}` : 'Off'}
                                    sub={roundUpEnabled ? 'A month, last 30 days' : 'Turn on below'} />
                                <Stat className="dash-stat" label="Savings streak"
                                    value={streak > 0 ? plural(streak, 'month') : 'None yet'}
                                    sub={streak > 0 ? 'Spent less than you earned' : 'Spend less than you earn this month to start'} />
                                <Stat className="dash-stat" label="Goals being funded"
                                    value={fundedCount}
                                    sub={`Of ${plural(activeGoals.length, 'active goal')}`} />
                            </div>
                        </Card>

                        <div className="fin-two">
                            {/* ── PAY YOURSELF FIRST ── */}
                            <Card>
                                <CardHeader title="Pay yourself first" sub="A monthly amount for each goal. Goals that need more come first." />
                                {dataLoading ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                        {[1, 2].map(i => <Skeleton key={i} height={72} borderRadius={10} />)}
                                    </div>
                                ) : activeGoals.length === 0 ? (
                                    <p style={{ ...type.meta, margin: 0 }}>
                                        No active goals.{' '}
                                        <Link href="/goals" className="fin-link">Create one</Link>
                                    </p>
                                ) : (
                                    <Rows>
                                        {sortedGoals.map(goal => {
                                            const saved     = parseFloat(goal.saved_amount);
                                            const target    = parseFloat(goal.target_amount);
                                            const remaining = Math.max(target - saved, 0);
                                            const pct       = Math.min((saved / target) * 100, 100);
                                            const monthly   = savePlan[goal.id] ?? 0;
                                            const projected = projectedDate(remaining, monthly);
                                            const isOnTrack = goalTrack(goal, monthly);

                                            return (
                                                <div key={goal.id} style={{ alignItems: 'flex-start', gap: 'var(--space-4)' }}>
                                                    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                                                        <p style={{ ...type.bodyStrong, margin: 0, ...truncate }}>
                                                            {goal.icon || goal.emoji || '🎯'} {goal.name}
                                                        </p>
                                                        <ProgressBar pct={pct} color="var(--text-secondary)" height={4} />
                                                        <p style={{ ...type.meta, margin: 0 }}>{fmt(saved)} of {fmt(target)}</p>
                                                        {(isOnTrack !== null || projected) && (
                                                            <p style={{ ...type.meta, margin: 0 }}>
                                                                {isOnTrack === false && <span style={{ color: TONE_TEXT.caution }}>Needs more each month to hit your deadline.</span>}
                                                                {isOnTrack === true && 'On track for your deadline.'}
                                                                {projected && `${isOnTrack !== null ? ' ' : ''}At ${fmt(monthly)} a month, reached by ${projected}.`}
                                                            </p>
                                                        )}
                                                    </div>
                                                    <div style={{ width: 110, flexShrink: 0 }}>
                                                        <Input
                                                            label="A month"
                                                            aria-label={`A month for ${goal.name}`}
                                                            type="number" min="0"
                                                            value={monthly || ''}
                                                            placeholder="0"
                                                            onChange={e => updateSavePlan(goal.id, parseFloat(e.target.value) || 0)}
                                                            style={{ ...type.num, textAlign: 'right', fontFamily: 'var(--font-mono)' }}
                                                        />
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </Rows>
                                )}
                            </Card>

                            {/* ── ROUND-UPS ── */}
                            <Card>
                                <CardHeader
                                    title="Round-ups"
                                    sub="Round every purchase up to the next ₹10"
                                    flush={!roundUpEnabled}
                                    action={<Switch checked={roundUpEnabled} onChange={next => updateRoundUp({ enabled: next, goalId: roundUpGoalId })} aria-label="Round-up savings" />}
                                />
                                {roundUpEnabled && (
                                    <>
                                        <Rows>
                                            <div>
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <p style={{ ...type.bodyStrong, margin: 0 }}>Last 30 days</p>
                                                    <p style={{ ...type.meta, margin: '2px 0 0' }}>If every purchase were rounded up</p>
                                                </div>
                                                <span style={{ ...type.num, flexShrink: 0 }}>~{fmt(roundUpMonthly)} a month</span>
                                            </div>
                                            <div>
                                                <p style={{ ...type.bodyStrong, margin: 0, flex: 1 }}>Over a year</p>
                                                <span style={{ ...type.num, flexShrink: 0 }}>~{fmt(roundUpMonthly * 12)}</span>
                                            </div>
                                        </Rows>
                                        {activeGoals.length > 0 && (
                                            <div style={{ marginTop: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                                                <label htmlFor="round-up-goal" style={type.label}>Send round-ups to</label>
                                                <select
                                                    id="round-up-goal"
                                                    value={roundUpGoalId}
                                                    onChange={e => updateRoundUp({ enabled: roundUpEnabled, goalId: e.target.value })}
                                                    style={selectStyle}
                                                >
                                                    <option value="">No goal selected</option>
                                                    {activeGoals.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                                                </select>
                                                {roundUpGoalId && roundUpGoalName && (
                                                    <p style={{ ...type.meta, margin: 0 }}>
                                                        About {fmt(roundUpMonthly)} a month goes to {roundUpGoalName}.
                                                    </p>
                                                )}
                                            </div>
                                        )}
                                    </>
                                )}
                            </Card>
                        </div>
                    </>
                )}

                {/* ══════════════════════ FORECAST ══════════════════════ */}
                {tab === 'forecast' && (
                    <>
                        {/* Error */}
                        {forecastError && (
                            <Card>
                                <CardHeader title="Could not generate the forecast" flush />
                                <p style={{ ...type.meta, margin: '6px 0 var(--space-4)' }}>{forecastError}</p>
                                <Button variant="secondary" size="md" onClick={() => fetchForecast(true)}>Try again</Button>
                            </Card>
                        )}

                        {/* Loading */}
                        {forecastLoading && (
                            <Card>
                                <p style={{ ...type.meta, margin: '0 0 var(--space-3)' }}>Generating your forecast</p>
                                <Skeleton height={120} borderRadius={10} />
                            </Card>
                        )}

                        {/* Empty */}
                        {!forecastGenerated && !forecastLoading && !forecastError && (
                            <Card>
                                <CardHeader title="No forecast yet" sub="Uses your last 3 months of transactions to predict this month's spending." />
                                <Button variant="primary" size="md" onClick={() => fetchForecast()}>Generate forecast</Button>
                            </Card>
                        )}

                        {/* Insufficient data */}
                        {forecast?.insufficientData && !forecastLoading && (
                            <Card>
                                <CardHeader title="Not enough data yet" flush />
                                <p style={{ ...type.meta, margin: '6px 0 var(--space-4)' }}>Add at least 1 week of transactions to generate a forecast.</p>
                                <Button variant="secondary" size="md" onClick={() => router.push('/transactions')}>Go to transactions</Button>
                            </Card>
                        )}

                        {showForecastData && forecast && (
                            <>
                                <Card>
                                    <p style={{ ...type.label, margin: 0 }}>{`Expected to spend in ${MONTH_NAMES[month]}`}</p>
                                    <p className="type-display" style={{ ...type.display, margin: '6px 0 0' }}>{fmt(forecast.totalForecast)}</p>
                                    <div className="dash-stats">
                                        <Stat className="dash-stat" label="Spent so far" value={fmt(forecast.currentMonthSpent)} sub={`${plural(forecast.daysElapsed, 'day')} in`} />
                                        <Stat className="dash-stat" label="Daily average" value={fmt(forecast.avgDaily)} sub="Per day with spending" />
                                        <Stat className="dash-stat" label="Days left" value={`${forecast.daysRemaining}`} sub={`Until ${forecast.daysInMonth} ${MONTH_NAMES[month].slice(0, 3)}`} />
                                    </div>
                                    {forecast.insight && (
                                        <p style={{ ...type.body, margin: 'var(--space-4) 0 0' }}>{forecast.insight}</p>
                                    )}
                                </Card>

                                {/* Calendar */}
                                <Card padding={0} style={{ overflow: 'hidden' }}>
                                    <div style={{ padding: 'var(--space-5) var(--space-5) 0' }}>
                                        <CardHeader title={monthLabel} sub="What you spent, and what is expected (~)" />
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', borderTop: '1px solid var(--glass-border)', borderBottom: '1px solid var(--glass-border)' }}>
                                        {DAYS_HEADER.map(d => (
                                            <div key={d} style={{ ...type.meta, padding: '10px 0', textAlign: 'center' }}>{d}</div>
                                        ))}
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}>
                                        {Array.from({ length: firstDayOfMonth }).map((_, i) => (
                                            <div key={`empty-${i}`} style={{ minHeight: isMobile ? 60 : 72, borderRight: '1px solid var(--glass-border)', borderBottom: '1px solid var(--glass-border)' }} />
                                        ))}
                                        {forecast.calendarDays.map(cd => {
                                            const isToday = cd.day === todayDay;
                                            const hasActual = !cd.isFuture && (cd.actual || 0) > 0;
                                            const col = (firstDayOfMonth + cd.day - 1) % 7;
                                            return (
                                                <div key={cd.day} style={{
                                                    minHeight: isMobile ? 60 : 72,
                                                    padding: isMobile ? 4 : 6,
                                                    boxSizing: 'border-box',
                                                    borderRight: col !== 6 ? '1px solid var(--glass-border)' : 'none',
                                                    borderBottom: '1px solid var(--glass-border)',
                                                    minWidth: 0,
                                                }}>
                                                    <span style={{
                                                        ...(isToday ? type.label : type.meta),
                                                        width: isMobile ? 20 : 24, height: isMobile ? 20 : 24, borderRadius: '50%',
                                                        background: isToday ? 'var(--accent)' : 'transparent',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        color: isToday ? '#fff' : cd.isFuture ? 'var(--text-muted)' : 'var(--text-primary)',
                                                    }}>{cd.day}</span>
                                                    <div style={{ marginTop: 2 }}>
                                                        {hasActual ? (
                                                            <span style={{ ...type.numSmall, ...truncate, display: 'block', color: 'var(--text-primary)' }}>{fmt(cd.actual!)}</span>
                                                        ) : cd.isFuture && (cd.projected || 0) > 0 ? (
                                                            <span style={{ ...type.numSmall, ...truncate, display: 'block', color: 'var(--text-muted)' }}>~{fmt(cd.projected!)}</span>
                                                        ) : null}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </Card>

                                {/* Category breakdown */}
                                <Card>
                                    <CardHeader title="By category" sub="Expected this month, from your last 3 months" />
                                    <Rows>
                                        {forecast.categories.map(cat => (
                                            <div key={cat.name} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                                                    <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: cat.color || 'var(--text-muted)' }} />
                                                    <span style={{ ...type.bodyStrong, ...truncate, flex: 1, minWidth: 0 }}>{cat.name}</span>
                                                    <span style={{ ...type.numSmall, flexShrink: 0 }}>{Math.round(cat.percentOfTotal)}%</span>
                                                    <span style={{ ...type.num, flexShrink: 0 }}>{fmt(cat.projected)}</span>
                                                </div>
                                                <ProgressBar pct={cat.percentOfTotal} height={4} color="var(--text-secondary)" />
                                                <p style={{ ...type.meta, margin: 0 }}>{fmt(cat.spentSoFar)} spent so far</p>
                                            </div>
                                        ))}
                                    </Rows>
                                </Card>
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
