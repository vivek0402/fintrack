'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { TrendingUp, TrendingDown, Wallet, Award, Sparkles, RefreshCw } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { analyticsAPI, transactionsAPI, recurringAPI, budgetsAPI, aiAPI, goalsAPI } from '@/lib/api';
import { getCurrentMonthYear } from '@/lib/utils';
import { useCountUp } from '@/hooks/useCountUp';
import { useIsMobile } from '@/hooks/useWindowSize';
import { useThemeStore } from '@/store/themeStore';
import { AppLayout } from '@/components/layout/AppLayout';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Button } from '@/components/ui/Button';
import { Skeleton, SkeletonCard } from '@/components/ui/Skeleton';
import { HealthScoreWidget } from '@/components/dashboard/HealthScoreWidget';

const MONTH_NAMES = ['', 'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
const MONTH_SHORT = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const fmt = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');

function getDateLabel(dateStr: string): string {
    const today     = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const d = (dateStr || '').split('T')[0];
    if (d === today)     return 'Today';
    if (d === yesterday) return 'Yesterday';
    return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

// ── Sparkline SVG chart ───────────────────────────────────────────────────────
function SparklineChart({ data, incColor, expColor }: {
    data: { month: string; income: number; expenses: number }[];
    incColor: string; expColor: string;
}) {
    if (!data.length) return <div style={{ height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>No data yet</p>
    </div>;

    const W = 600, H = 100, PL = 8, PR = 8, PT = 8, PB = 20;
    const plotW = W - PL - PR, plotH = H - PT - PB;
    const maxVal = Math.max(...data.flatMap(d => [d.income, d.expenses]), 1);
    const xPos = (i: number) => PL + (i / (data.length - 1)) * plotW;
    const yPos = (v: number) => PT + (1 - Math.min(v / maxVal, 1)) * plotH;

    const incPts: [number, number][] = data.map((d, i) => [xPos(i), yPos(d.income)]);
    const expPts: [number, number][] = data.map((d, i) => [xPos(i), yPos(d.expenses)]);

    const smoothPath = (pts: [number, number][]) => {
        if (pts.length < 2) return '';
        let path = `M${pts[0][0]},${pts[0][1]}`;
        for (let i = 0; i < pts.length - 1; i++) {
            const cpx = pts[i][0] + (pts[i + 1][0] - pts[i][0]) * 0.5;
            path += ` C${cpx},${pts[i][1]} ${cpx},${pts[i + 1][1]} ${pts[i + 1][0]},${pts[i + 1][1]}`;
        }
        return path;
    };

    const incPath = smoothPath(incPts);
    const expPath = smoothPath(expPts);
    const lastInc = incPts[incPts.length - 1];
    const lastExp = expPts[expPts.length - 1];

    return (
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{ display: 'block' }}>
            {/* Area fills */}
            <path d={`${incPath} L${lastInc[0]},${PT + plotH} L${PL},${PT + plotH} Z`} fill={incColor} fillOpacity="0.08" />
            <path d={`${expPath} L${lastExp[0]},${PT + plotH} L${PL},${PT + plotH} Z`} fill={expColor} fillOpacity="0.06" />
            {/* Lines */}
            <path d={incPath} fill="none" stroke={incColor} strokeWidth="2" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            <path d={expPath} fill="none" stroke={expColor} strokeWidth="2" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            {/* End dots */}
            <circle cx={lastInc[0]} cy={lastInc[1]} r="4" fill={incColor} vectorEffect="non-scaling-stroke" />
            <circle cx={lastExp[0]} cy={lastExp[1]} r="4" fill={expColor} vectorEffect="non-scaling-stroke" />
            {/* Month labels */}
            {data.map((d, i) => (
                <text key={i} x={xPos(i)} y={H - 4} textAnchor="middle" fontSize="9"
                    fill={i === data.length - 1 ? 'var(--text-secondary)' : 'var(--text-faint)'}
                    fontWeight={i === data.length - 1 ? '600' : '400'}
                    fontFamily="DM Mono, monospace">{d.month}</text>
            ))}
        </svg>
    );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
    const router = useRouter();
    const { user, isLoading, loadFromStorage } = useAuthStore();
    const { theme, palette } = useThemeStore();
    const { month, year } = getCurrentMonthYear();
    const isMobile = useIsMobile();

    const [summary, setSummary]         = useState<any>(null);
    const [trends, setTrends]           = useState<any[]>([]);
    const [transactions, setTransactions] = useState<any[]>([]);
    const [budgets, setBudgets]         = useState<any[]>([]);
    const [goals, setGoals]             = useState<any[]>([]);
    const [dataLoading, setDataLoading] = useState(true);
    const [aiInsight, setAiInsight]     = useState('');
    const [aiLoading, setAiLoading]     = useState(true);
    const [aiReportLoading, setAiReportLoading] = useState(false);
    const [salaryData, setSalaryData]   = useState<any>(null);
    const [salaryDismissed, setSalaryDismissed] = useState(false);

    // Chart colours (read from CSS vars)
    const [incColor, setIncColor] = useState('#059669');
    const [expColor, setExpColor] = useState('#ea580c');

    useEffect(() => {
        const s = getComputedStyle(document.documentElement);
        setIncColor(s.getPropertyValue('--color-inc').trim() || '#059669');
        setExpColor(s.getPropertyValue('--color-exp').trim() || '#ea580c');
    }, [theme, palette]);

    // Animated numbers
    const heroIncome   = useCountUp(summary?.total_income   ?? 0, 900, !dataLoading);
    const heroExpenses = useCountUp(summary?.total_expenses ?? 0, 900, !dataLoading);
    const heroNet      = useCountUp((summary?.total_income ?? 0) - (summary?.total_expenses ?? 0), 900, !dataLoading);

    const hour     = new Date().getHours();
    const greeting = `Good ${hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'}, ${user?.full_name?.split(' ')[0] ?? 'there'}`;
    const savingsPct = summary?.total_income > 0
        ? Math.max(0, Math.round(((summary.total_income - summary.total_expenses) / summary.total_income) * 100))
        : 0;
    const netBalance = (summary?.total_income ?? 0) - (summary?.total_expenses ?? 0);

    // Savings rate badge
    const savingsBadge = savingsPct >= 20
        ? { label: `${savingsPct}% · Good`, color: 'var(--color-inc)', bg: 'color-mix(in srgb, var(--color-inc) 12%, transparent)' }
        : savingsPct >= 10
        ? { label: `${savingsPct}% · Fair`, color: 'var(--color-warn)', bg: 'color-mix(in srgb, var(--color-warn) 12%, transparent)' }
        : { label: 'Needs work',            color: 'var(--color-exp)',  bg: 'color-mix(in srgb, var(--color-exp) 12%, transparent)'  };

    useEffect(() => { loadFromStorage(); }, []);
    useEffect(() => { if (!isLoading && !user) router.push('/login'); }, [user, isLoading]);
    useEffect(() => {
        setSalaryDismissed(localStorage.getItem(`salary-banner-dismissed-${month}-${year}`) === 'true');
    }, [month, year]);

    useEffect(() => {
        if (!user) return;
        const CACHE_KEY = `dashboard-cache-${user.id}-${month}-${year}`;
        const CACHE_TTL = 10 * 60 * 1000;

        const fetchData = async () => {
            try {
                const cached = localStorage.getItem(CACHE_KEY);
                if (cached) {
                    const { data, ts } = JSON.parse(cached);
                    if (Date.now() - ts < CACHE_TTL) {
                        setSummary(data.summary);
                        setTrends(data.trends ?? []);
                        setTransactions(data.transactions);
                        setBudgets(data.budgets);
                        setGoals(data.goals ?? []);
                        setDataLoading(false);
                        return;
                    }
                }
            } catch { /* stale cache */ }

            setDataLoading(true);
            try {
                recurringAPI.process().catch(() => {});
                const [summaryRes, trendsRes, txRes, budgetsRes, goalsRes] = await Promise.all([
                    analyticsAPI.summary({ month, year }),
                    analyticsAPI.trends(),
                    transactionsAPI.getAll({ month, year }),
                    budgetsAPI.getAll({ month, year }),
                    goalsAPI.getAll(),
                ]);
                const data = {
                    summary:      summaryRes.data.summary,
                    trends:       trendsRes.data.trends ?? [],
                    transactions: txRes.data.transactions,
                    budgets:      budgetsRes.data.budgets,
                    goals:        goalsRes.data.goals ?? [],
                };
                setSummary(data.summary);
                setTrends(data.trends);
                setTransactions(data.transactions);
                setBudgets(data.budgets);
                setGoals(data.goals);
                try { localStorage.setItem(CACHE_KEY, JSON.stringify({ data, ts: Date.now() })); } catch {}
            } catch (err) { console.error('[Dashboard]', err); }
            finally { setDataLoading(false); }
        };

        fetchData();
        aiAPI.salaryIntelligence().then(res => { if (res.data?.detected) setSalaryData(res.data); }).catch(() => {});
        aiAPI.report().then(res => setAiInsight(res.data?.report ?? '')).catch(() => {}).finally(() => setAiLoading(false));
    }, [user]);

    // Sparkline data (last 6 months)
    const sparklineData = useMemo(() => {
        const map: Record<string, { month: string; income: number; expenses: number }> = {};
        trends.forEach((row: any) => {
            const key = `${row.year}-${String(row.month).padStart(2, '0')}`;
            if (!map[key]) map[key] = { month: MONTH_SHORT[row.month] || '', income: 0, expenses: 0 };
            if (row.type === 'income')  map[key].income   = parseFloat(row.total);
            if (row.type === 'expense') map[key].expenses = parseFloat(row.total);
        });
        return Object.entries(map)
            .sort(([a], [b]) => a.localeCompare(b))
            .slice(-6)
            .map(([, v]) => v);
    }, [trends]);

    // Over-budget count
    const overBudget = budgets.filter((b: any) => parseFloat(b.spent) > parseFloat(b.amount)).length;

    if (isLoading || !user) return (
        <AppLayout>
            <SkeletonCard height={60} style={{ marginBottom: '24px' }} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '12px', marginBottom: '16px' }}>
                {[1,2,3,4].map(i => <SkeletonCard key={i} height={100} />)}
            </div>
            <SkeletonCard height={220} style={{ marginBottom: '16px' }} />
            <SkeletonCard height={100} style={{ marginBottom: '16px' }} />
            <SkeletonCard height={260} />
        </AppLayout>
    );

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <AppLayout>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingBottom: '24px', animation: 'fadeUp 200ms ease forwards' }}>

                {/* ── PAGE HEADER (no card) ── */}
                <div style={{ marginBottom: '4px' }}>
                    <h1 style={{ fontFamily: 'var(--font-head)', fontSize: isMobile ? '20px' : '24px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>
                        {greeting} 👋
                    </h1>
                    <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)' }}>
                        {MONTH_NAMES[month]} {year} — Overview
                    </p>
                </div>

                {/* ── FOUR STAT TILES ── */}
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: '12px' }}>
                    {[
                        { label: 'Total Income',   value: fmt(heroIncome),   sub: MONTH_NAMES[month], color: 'var(--color-inc)',  tint: 'color-mix(in srgb, var(--color-inc) 10%, var(--bg-card))',  border: 'color-mix(in srgb, var(--color-inc) 22%, transparent)',  Icon: TrendingUp   },
                        { label: 'Total Expenses', value: fmt(heroExpenses), sub: MONTH_NAMES[month], color: 'var(--color-exp)',  tint: 'color-mix(in srgb, var(--color-exp) 10%, var(--bg-card))',  border: 'color-mix(in srgb, var(--color-exp) 22%, transparent)',  Icon: TrendingDown },
                        { label: 'Net Balance',    value: fmt(Math.abs(heroNet)), sub: netBalance < 0 ? 'Deficit' : 'All time', color: 'var(--accent)', tint: 'color-mix(in srgb, var(--accent) 10%, var(--bg-card))', border: 'color-mix(in srgb, var(--accent) 22%, transparent)', Icon: Wallet },
                        { label: 'Savings Rate',   value: `${savingsPct}%`, sub: savingsBadge.label,  color: savingsBadge.color, tint: savingsBadge.bg, border: 'transparent', Icon: Award, isSavings: true },
                    ].map(tile => (
                        <div key={tile.label} style={{ background: tile.tint, border: `1px solid ${tile.border}`, borderRadius: 'var(--radius-lg)', padding: '16px 18px', position: 'relative', overflow: 'hidden' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                                <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', fontFamily: 'var(--font-body)' }}>{tile.label}</span>
                                <div style={{ width: 28, height: 28, borderRadius: 'var(--radius-sm)', background: `color-mix(in srgb, ${tile.color} 15%, transparent)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <tile.Icon size={14} color={tile.color} />
                                </div>
                            </div>
                            {dataLoading ? (
                                <Skeleton width="70%" height={28} borderRadius={4} />
                            ) : (
                                <p style={{ fontFamily: 'var(--font-mono)', fontSize: '22px', fontWeight: 700, color: tile.color, margin: '0 0 4px', fontVariantNumeric: 'tabular-nums', animation: 'numberReveal 350ms cubic-bezier(0.22,1,0.36,1) both' }}>
                                    {tile.value}
                                </p>
                            )}
                            <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)' }}>{tile.sub}</p>
                        </div>
                    ))}
                </div>

                {/* ── HEALTH SCORE WIDGET ── */}
                <HealthScoreWidget
                    summary={summary}
                    budgets={budgets}
                    goals={goals}
                    trends={trends}
                    loading={dataLoading}
                />

                {/* ── HERO CARD — 3 column ── */}
                <div style={{ background: 'var(--accent-light)', border: '1.5px solid var(--accent-border)', borderRadius: 'var(--radius-xl)', overflow: 'hidden', display: 'flex', flexDirection: isMobile ? 'column' : 'row' }}>

                    {/* Left: This Month balance */}
                    <div style={{ padding: '20px 24px', borderRight: isMobile ? 'none' : '1px solid var(--accent-border)', borderBottom: isMobile ? '1px solid var(--accent-border)' : 'none', flexShrink: 0, width: isMobile ? 'auto' : '200px', minWidth: isMobile ? 'auto' : '200px' }}>
                        <p style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 6px', fontFamily: 'var(--font-body)' }}>
                            This month
                        </p>
                        {dataLoading ? (
                            <Skeleton width="90%" height={32} borderRadius={4} style={{ marginBottom: '8px' }} />
                        ) : (
                            <p style={{ fontFamily: 'var(--font-mono)', fontSize: '28px', fontWeight: 800, color: heroNet >= 0 ? 'var(--text-primary)' : 'var(--color-exp)', margin: '0 0 8px', letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', animation: 'numberReveal 400ms cubic-bezier(0.22,1,0.36,1) both' }}>
                                {fmt(heroNet)}
                            </p>
                        )}
                        <div style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 10px', borderRadius: '20px', background: heroNet >= 0 ? 'color-mix(in srgb, var(--color-inc) 10%, transparent)' : 'color-mix(in srgb, var(--color-exp) 10%, transparent)', marginBottom: '8px' }}>
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', fontWeight: 600, color: heroNet >= 0 ? 'var(--color-inc)' : 'var(--color-exp)', fontVariantNumeric: 'tabular-nums' }}>
                                {heroNet >= 0 ? '+' : ''}{fmt(heroNet)} this month
                            </span>
                        </div>
                        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-muted)', margin: 0, fontVariantNumeric: 'tabular-nums' }}>
                            {fmt(heroIncome)} in · {fmt(heroExpenses)} out
                        </p>
                    </div>

                    {/* Middle: 6-month trend */}
                    <div style={{ flex: 1, padding: '20px 20px 16px', minWidth: 0, borderRight: isMobile ? 'none' : '1px solid var(--accent-border)', borderBottom: isMobile ? '1px solid var(--accent-border)' : 'none' }}>
                        <p style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 12px', fontFamily: 'var(--font-body)' }}>
                            6-month trend
                        </p>
                        {dataLoading ? (
                            <Skeleton width="100%" height={80} borderRadius={6} />
                        ) : (
                            <SparklineChart data={sparklineData} incColor={incColor} expColor={expColor} />
                        )}
                        <div style={{ display: 'flex', gap: '14px', marginTop: '8px' }}>
                            {[{ label: 'Income', color: incColor }, { label: 'Expenses', color: expColor }].map(l => (
                                <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                    <div style={{ width: 16, height: 2, background: l.color, borderRadius: 1 }} />
                                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>{l.label}</span>
                                </div>
                            ))}
                        </div>

                        {/* Top spending */}
                        {!dataLoading && (
                            <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px solid var(--accent-border)' }}>
                                <p style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 6px', fontFamily: 'var(--font-body)' }}>
                                    Top spending
                                </p>
                                {budgets.length === 0 ? (
                                    <p style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>No spending data yet</p>
                                ) : (() => {
                                    const top = [...budgets].sort((a: any, b: any) => parseFloat(b.spent) - parseFloat(a.spent))[0];
                                    const pct  = top && parseFloat(top.amount) > 0 ? Math.round((parseFloat(top.spent) / parseFloat(top.amount)) * 100) : 0;
                                    return (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                                                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: top.category_color || expColor, flexShrink: 0 }} />
                                                    <span style={{ fontSize: '12px', color: 'var(--text-primary)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'var(--font-body)' }}>{top.category_name}</span>
                                                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', flexShrink: 0, fontFamily: 'var(--font-body)' }}>{pct}% of budget</span>
                                                </div>
                                                <ProgressBar pct={pct} height={3} color={top.category_color || expColor} />
                                            </div>
                                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--color-exp)', fontWeight: 600, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{fmt(parseFloat(top.spent))}</span>
                                        </div>
                                    );
                                })()}
                            </div>
                        )}
                    </div>

                    {/* Right: AI Insight */}
                    <div style={{ padding: '20px 24px', flexShrink: 0, width: isMobile ? 'auto' : '260px', minWidth: isMobile ? 'auto' : '260px', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
                            <Sparkles size={14} color="var(--accent)" />
                            <span style={{ fontFamily: 'var(--font-head)', fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>AI Insight</span>
                        </div>
                        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6, margin: '0 0 14px', flex: 1, fontFamily: 'var(--font-body)' }}>
                            {aiLoading ? 'Generating your monthly AI summary…' : aiInsight || 'Tap generate to get your monthly AI summary.'}
                        </p>
                        <Button
                            onClick={async () => {
                                setAiReportLoading(true);
                                try { const res = await aiAPI.report(); setAiInsight(res.data?.report ?? ''); }
                                catch { }
                                finally { setAiReportLoading(false); }
                            }}
                            isLoading={aiReportLoading}
                            size="sm"
                            style={{ alignSelf: 'flex-start' }}
                        >
                            <RefreshCw size={12} /> Generate Report
                        </Button>
                    </div>
                </div>

                {/* ── BUDGETS ── */}
                <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '18px 20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: budgets.length > 0 ? '14px' : '0' }}>
                        <h2 style={{ fontFamily: 'var(--font-head)', fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Budgets</h2>
                        {overBudget > 0 && (
                            <span style={{ fontSize: '11px', color: 'var(--color-exp)', background: 'color-mix(in srgb, var(--color-exp) 10%, transparent)', padding: '2px 8px', borderRadius: '20px', fontFamily: 'var(--font-body)' }}>
                                {overBudget} over budget
                            </span>
                        )}
                        <button type="button" onClick={() => router.push('/budgets')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', color: 'var(--accent)', fontWeight: 600, padding: 0, fontFamily: 'var(--font-body)' }}>
                            See all →
                        </button>
                    </div>
                    {dataLoading ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {[1,2].map(i => <div key={i}><Skeleton width="50%" height={12} borderRadius={4} style={{ marginBottom: '6px' }} /><Skeleton width="100%" height={5} borderRadius={999} /></div>)}
                        </div>
                    ) : budgets.length === 0 ? (
                        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)' }}>All budgets on track ✅</p>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {budgets.slice(0, 4).map((b: any) => {
                                const pct = parseFloat(b.amount) > 0 ? (parseFloat(b.spent) / parseFloat(b.amount)) * 100 : 0;
                                const over = pct > 100;
                                return (
                                    <div key={b.id ?? b.category_id}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                                            <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}>{b.name ?? b.category_name}</span>
                                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: over ? 'var(--color-exp)' : 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                                                {fmt(parseFloat(b.spent))} / {fmt(parseFloat(b.amount))}
                                            </span>
                                        </div>
                                        <ProgressBar pct={pct} height={4} />
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* ── RECENT TRANSACTIONS ── */}
                <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                        <h2 style={{ fontFamily: 'var(--font-head)', fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Recent Transactions</h2>
                        <button type="button" onClick={() => router.push('/transactions')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', color: 'var(--accent)', fontWeight: 600, padding: 0, display: 'flex', alignItems: 'center', gap: '4px', fontFamily: 'var(--font-body)' }}>
                            View all →
                        </button>
                    </div>
                    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
                        {dataLoading ? (
                            [1,2,3,4,5].map(i => (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', borderBottom: i < 5 ? '1px solid var(--border)' : 'none' }}>
                                    <Skeleton width={36} height={36} borderRadius={999} />
                                    <div style={{ flex: 1 }}>
                                        <Skeleton width="55%" height={12} borderRadius={4} style={{ marginBottom: '6px' }} />
                                        <Skeleton width="35%" height={10} borderRadius={4} />
                                    </div>
                                    <Skeleton width={70} height={14} borderRadius={4} />
                                </div>
                            ))
                        ) : transactions.length === 0 ? (
                            <p style={{ fontSize: '13px', color: 'var(--text-muted)', padding: '28px', textAlign: 'center', margin: 0, fontFamily: 'var(--font-body)' }}>
                                No transactions yet — add your first one!
                            </p>
                        ) : (
                            transactions.slice(0, 5).map((tx: any, idx: number) => {
                                const amount   = parseFloat(String(tx.amount));
                                const isIncome = tx.type === 'income';
                                return (
                                    <div key={tx.id} onClick={() => router.push('/transactions')}
                                        style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', borderBottom: idx < Math.min(transactions.length, 5) - 1 ? '1px solid var(--border)' : 'none', cursor: 'pointer', transition: 'background var(--transition-fast)' }}
                                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
                                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
                                        <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--bg-alt)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '17px' }}>
                                            {tx.category_icon || '💳'}
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <p style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'var(--font-body)' }}>{tx.description}</p>
                                            <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '2px 0 0', fontFamily: 'var(--font-body)' }}>
                                                {tx.category_name || 'Uncategorized'} · {getDateLabel(tx.date)}
                                            </p>
                                        </div>
                                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 600, color: isIncome ? 'var(--color-inc)' : 'var(--text-primary)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                                            {isIncome ? '+' : '−'}{fmt(amount)}
                                        </span>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>

            </div>
        </AppLayout>
    );
}
