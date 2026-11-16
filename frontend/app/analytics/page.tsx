'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import {
    LineChart, Line,
    XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer,
} from 'recharts';
import { useAuthStore } from '@/store/authStore';
import { toast } from '@/store/toastStore';
import { analyticsAPI, transactionsAPI, aiAPI, insightsAPI } from '@/lib/api';
import { GCard } from '@/components/ui/GCard';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { useIsMobile } from '@/hooks/useWindowSize';
import { useThemeStore } from '@/store/themeStore';
import { Button } from '@/components/ui/Button';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { DatePicker } from '@/components/ui/DatePicker';
import { CountUp } from '@/components/ui/CountUp';
import { Card } from '@/components/ui/Card';
import { CardHeader, Rows, Stat, TextAction, TONE_TEXT } from '@/components/ui/CardParts';
import { useQueryClient } from '@tanstack/react-query';
import { useUserQuery, fetchAnalyticsOverview } from '@/hooks/queries';
import { Tabs } from '@/components/ui/Tabs';
import { EmptyState } from '@/components/ui/EmptyState';
import {
    Download, RefreshCw, TrendingUp, TrendingDown, ChevronLeft, ChevronRight, Brain, CheckCircle2, AlertTriangle,
    FileText, Search, Camera, BarChart3,
} from 'lucide-react';
const NO_ROWS: any[] = [];

const vizSkeleton = (h: number) => {
    const VizSkeleton = () => <div style={{ height: h, background: 'var(--glass-fill-1)', borderRadius: 8 }} />;
    VizSkeleton.displayName = 'VizSkeleton';
    return VizSkeleton;
};
const SpendingHeatmap = dynamic(() => import('@/components/analytics/SpendingHeatmap').then(m => m.SpendingHeatmap), { ssr: false, loading: vizSkeleton(100) });
const SankeyFlow = dynamic(() => import('@/components/analytics/SankeyFlow').then(m => m.SankeyFlow), { ssr: false, loading: vizSkeleton(200) });
const CategoryTrajectory = dynamic(() => import('@/components/analytics/CategoryTrajectory').then(m => m.CategoryTrajectory), { ssr: false, loading: vizSkeleton(200) });
// Non-default tabs: loaded on first open so they stay out of the page's initial bundle.
const CalendarTab = dynamic(() => import('@/components/analytics/CalendarTab').then(m => m.CalendarTab), { ssr: false, loading: vizSkeleton(400) });
const HealthTab = dynamic(() => import('@/components/analytics/health/HealthTab').then(m => m.HealthTab), { ssr: false, loading: vizSkeleton(400) });
import { exportToCSV, formatDate, fmt, isNonSavingsExpense, isRealIncome } from '@/lib/utils';
import { useChartAnimation } from '@/hooks/useChartAnimation';
import { type, truncate } from '@/lib/typography';
import { shareRows, comparePeriod, dayOfWeekSummary } from '@/lib/analytics';

// One row of tabs, always visible (the row scrolls sideways on mobile).
// Overview, Spending, Income and Trends share one data view and period.
// Deep links land here too: /reports, /year-review, /insights and
// /health-score all redirect to ?tab=<key>.
const OUTER_TABS = [
    { key: 'overview',    label: 'Overview' },
    { key: 'spending',    label: 'Spending' },
    { key: 'income',      label: 'Income' },
    { key: 'trends',      label: 'Trends' },
    { key: 'health',      label: 'Health' },
    { key: 'insights',    label: 'Insights' },
    { key: 'reports',     label: 'Reports' },
    { key: 'year-review', label: 'Year review' },
    { key: 'calendar',    label: 'Calendar' },
];
const ALL_TAB_KEYS = OUTER_TABS.map(t => t.key);

type DataSection = 'overview' | 'spending' | 'income' | 'trends';
const isDataSection = (t: string): t is DataSection => t === 'overview' || t === 'spending' || t === 'income' || t === 'trends';

const MONTH_NAMES = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const FULL_MONTHS = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// ── Chart colour state read from CSS custom properties at runtime ─────────────
// This ensures charts update when the theme changes.
type ChartColors = { inc: string; exp: string; accent2: string; tint: string; border: string; faint: string; };
// Values mirror DESIGN.md's dark theme (default) tokens: --color-inc,
// --color-exp, --accent (used for `accent2`), --accent-subtle, --border-subtle,
// --text-muted. Only used for the brief pre-hydration/SSR window.
const DEFAULT_CC: ChartColors = { inc: '#16a34a', exp: '#dc2626', accent2: '#2563eb', tint: 'rgba(37, 99, 235, 0.12)', border: 'rgba(255, 255, 255, 0.06)', faint: '#808080' };
function readChartColors(): ChartColors {
    if (typeof document === 'undefined') return DEFAULT_CC;
    const s = getComputedStyle(document.documentElement);
    const g = (v: string, fallbackKey: keyof ChartColors) => s.getPropertyValue(v).trim() || DEFAULT_CC[fallbackKey] || '';
    return {
        inc: g('--color-inc', 'inc'),
        exp: g('--color-exp', 'exp'),
        accent2: g('--accent', 'accent2'),
        tint: g('--accent-subtle', 'tint'),
        border: g('--border-subtle', 'border'),
        faint: g('--text-muted', 'faint'),
    };
}

// ── Shared custom tooltip ──────────────────────────────────────────────────────
const tooltipBox: React.CSSProperties = { background: 'var(--bg-surface-1)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '10px 14px', boxShadow: 'var(--shadow-card)' };

function ChartTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null;
    return (
        <div style={tooltipBox}>
            <p style={{ ...type.label, margin: '0 0 6px' }}>{label}</p>
            {payload.map((p: any) => (
                <p key={p.name} style={{ ...type.numSmall, margin: '3px 0', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span aria-hidden="true" style={{ width: 8, height: 2, background: p.stroke || p.fill, flexShrink: 0 }} />
                    {p.name}: {fmt(p.value)}
                </p>
            ))}
        </div>
    );
}

function SavingsTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null;
    return (
        <div style={tooltipBox}>
            <p style={{ ...type.label, margin: '0 0 6px' }}>{label}</p>
            <p style={{ ...type.numSmall, margin: 0 }}>Savings rate: {payload[0].value}%</p>
        </div>
    );
}

// ── Page header + tabs, shared by every tab ───────────────────────────────────
function AnalyticsHead({ tab, onTabChange, actions }: { tab: string; onTabChange: (key: string) => void; actions?: React.ReactNode }) {
    return (
        <>
            <div className="fin-page-head">
                <div style={{ minWidth: 0 }}>
                    <p style={{ ...type.meta, margin: 0 }}>Where your money comes from and goes</p>
                    <h1 style={{ ...type.heading, margin: 0 }}>Analytics</h1>
                </div>
                <div className="fin-page-actions">{actions}</div>
            </div>
            <Tabs tabs={OUTER_TABS} active={tab} onChange={onTabChange} />
        </>
    );
}

// Show / Hide card for the heavy visuals: the body renders only when open.
function ToggleCard({ title, sub, open, onToggle, children }: { title: string; sub: string; open: boolean; onToggle: () => void; children: React.ReactNode }) {
    return (
        <Card>
            <CardHeader title={title} sub={sub} flush={!open}
                action={<TextAction onClick={onToggle}>{open ? 'Hide' : 'Show'}</TextAction>} />
            {open && children}
        </Card>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// OVERVIEW / SPENDING / INCOME / TRENDS (formerly /analytics)
// ═══════════════════════════════════════════════════════════════════════════
function AnalyticsDataTabs({ section, onTabChange }: { section: DataSection; onTabChange: (key: string) => void }) {
    const chartAnim = useChartAnimation('analytics-overview', 700);
    const { theme } = useThemeStore();
    const isMobile = useIsMobile();
    const [cc, setCc] = useState<ChartColors>(DEFAULT_CC);

    const _now = new Date();
    const _nowMonth = _now.getMonth() + 1;
    const _nowYear  = _now.getFullYear();
    const [selMonth, setSelMonth] = useState(_nowMonth);
    const [selYear,  setSelYear]  = useState(_nowYear);
    const currentMonth = selMonth;
    const currentYear  = selYear;
    const isCurrentMonth = currentMonth === _nowMonth && currentYear === _nowYear;
    const [period, setPeriod] = useState<'month' | 'quarter' | 'year'>('month');
    // Spending and Trends always work in single months; only Overview and Income follow the period choice.
    const followsPeriod = section === 'overview' || section === 'income';
    const effectivePeriod: 'month' | 'quarter' | 'year' = followsPeriod ? period : 'month';

    const currentQuarter = Math.ceil(currentMonth / 3);
    const isCurrentPeriod = effectivePeriod === 'year'
        ? currentYear === _nowYear
        : effectivePeriod === 'quarter'
        ? currentQuarter === Math.ceil(_nowMonth / 3) && currentYear === _nowYear
        : isCurrentMonth;

    const navLabel = effectivePeriod === 'year'
        ? String(currentYear)
        : effectivePeriod === 'quarter'
        ? `Q${currentQuarter} ${currentYear}`
        : `${FULL_MONTHS[currentMonth]} ${currentYear}`;

    const goToPrev = () => {
        if (effectivePeriod === 'year') {
            setSelYear(y => y - 1);
        } else if (effectivePeriod === 'quarter') {
            if (currentQuarter === 1) { setSelMonth(10); setSelYear(y => y - 1); }
            else setSelMonth((currentQuarter - 2) * 3 + 1);
        } else {
            if (currentMonth === 1) { setSelMonth(12); setSelYear(y => y - 1); }
            else setSelMonth(m => m - 1);
        }
    };
    const goToNext = () => {
        if (isCurrentPeriod) return;
        if (effectivePeriod === 'year') {
            setSelYear(y => y + 1);
        } else if (effectivePeriod === 'quarter') {
            if (currentQuarter === 4) { setSelMonth(1); setSelYear(y => y + 1); }
            else setSelMonth(currentQuarter * 3 + 1);
        } else {
            if (currentMonth === 12) { setSelMonth(1); setSelYear(y => y + 1); }
            else setSelMonth(m => m + 1);
        }
    };
    const handleSetPeriod = (p: 'month' | 'quarter' | 'year') => {
        setPeriod(p);
        if (p === 'quarter') {
            // snap selMonth to first month of the current quarter so periodStats is consistent
            setSelMonth((Math.ceil(selMonth / 3) - 1) * 3 + 1);
        }
    };

    // The month's numbers, from the shared cache: revisits (and coming back
    // to a month) show them at once and refresh in the background.
    const overviewQuery = useUserQuery('analytics', ['overview', currentMonth, currentYear],
        () => fetchAnalyticsOverview(currentMonth, currentYear));
    const summary          = overviewQuery.data?.summary ?? null;
    const trends: any[]    = overviewQuery.data?.trends ?? NO_ROWS;
    const categories: any[] = overviewQuery.data?.categories ?? NO_ROWS;
    const yearlyData       = overviewQuery.data?.yearlyData ?? null;
    const paymentMethods: any[] = overviewQuery.data?.paymentMethods ?? NO_ROWS;
    const paymentTotal: number = overviewQuery.data?.paymentTotal ?? 0;
    const allTransactions: any[] = overviewQuery.data?.allTransactions ?? NO_ROWS;
    const dataLoading      = overviewQuery.isPending;
    // A whole year of rows for the heatmap: cached in memory only (too big
    // for localStorage), independent of the selected month.
    const yearTransactions: any[] = useUserQuery('transactions-year', [currentYear],
        async () => (await transactionsAPI.getAll({ year: currentYear })).data.transactions ?? [],
        { persist: false }).data ?? NO_ROWS;
    const [allocationPlan, setAllocationPlan]   = useState<any>(null);
    const [allocationLoading, setAllocationLoading] = useState(false);
    const [allocationError, setAllocationError] = useState('');
    const [planGenerated, setPlanGenerated]     = useState(false);

    const [showHeatmap,       setShowHeatmap]       = useState(false);
    const [showSankey,        setShowSankey]        = useState(false);
    const [showTrajectory,    setShowTrajectory]    = useState(false);

    // Re-read CSS custom properties whenever theme changes
    useEffect(() => { setCc(readChartColors()); }, [theme]);

    useEffect(() => { setAllocationPlan(null); setPlanGenerated(false); }, [currentMonth, currentYear]);

    useEffect(() => {
        if (overviewQuery.isError && !overviewQuery.data) toast.error('Failed to load analytics data');
    }, [overviewQuery.isError, overviewQuery.data]);

    // Read chart colours again once fresh data has rendered.
    useEffect(() => { if (overviewQuery.data) setCc(readChartColors()); }, [overviewQuery.data]);

    // ── Derived chart data ────────────────────────────────────────────────────

    // Trend map: { "2025-6": { income, expenses } }
    const trendsMap = useMemo(() => {
        const map: Record<string, { income: number; expenses: number }> = {};
        trends.forEach(row => {
            const key = `${row.year}-${row.month}`;
            if (!map[key]) map[key] = { income: 0, expenses: 0 };
            if (row.type === 'income') map[key].income = parseFloat(row.total);
            else map[key].expenses = parseFloat(row.total);
        });
        return map;
    }, [trends]);

    // Ordered month list for the trend charts
    const areaData = useMemo(() => {
        const entries = Object.entries(trendsMap).map(([key, v]) => {
            const [y, m] = key.split('-');
            return { sortKey: parseInt(y) * 100 + parseInt(m), month: MONTH_NAMES[parseInt(m)], ...v };
        }).sort((a, b) => a.sortKey - b.sortKey);
        const count = period === 'month' ? 6 : period === 'quarter' ? 9 : 12;
        return entries.slice(-count);
    }, [trendsMap, period]);

    // Weekly spending pattern from all transactions
    const weeklyData = useMemo(() => {
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const totals = [0, 0, 0, 0, 0, 0, 0];
        allTransactions.filter(isNonSavingsExpense).forEach(tx => {
            const dow = new Date((tx.date || '').split('T')[0] + 'T00:00:00').getDay();
            if (!isNaN(dow)) totals[dow] += parseFloat(tx.amount);
        });
        return days.map((day, i) => ({ day, amount: totals[i] }));
    }, [allTransactions]);

    // Monthly income trend for the Income tab
    const incomeAreaData = useMemo(() => areaData.map(d => ({ month: d.month, income: d.income })), [areaData]);

    // KPI computations
    const lastMonthKey      = (() => { let m = currentMonth - 1, y = currentYear; if (m === 0) { m = 12; y--; } return `${y}-${m}`; })();
    const lastMonthExp      = trendsMap[lastMonthKey]?.expenses ?? 0;
    const lastMonthInc      = trendsMap[lastMonthKey]?.income ?? 0;
    const vsLastMonth       = lastMonthExp > 0 ? Math.round(((( summary?.total_expenses ?? 0) - lastMonthExp) / lastMonthExp) * 100) : null;

    const getYearlyTotal = (year: number, type: string) => {
        if (!yearlyData) return 0;
        const row = yearlyData.totals?.find((t: any) => parseInt(t.year) === year && t.type === type);
        return row ? parseFloat(row.total) : 0;
    };
    const pctChange = (curr: number, last: number) => last === 0 ? null : ((curr - last) / last * 100).toFixed(1);

    const periodStats = useMemo(() => {
        if (effectivePeriod === 'month') {
            const spent = summary?.total_expenses ?? 0;
            const income = summary?.total_income ?? 0;
            const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
            const daysEl = isCurrentMonth ? new Date().getDate() : daysInMonth;
            return {
                totalSpent: spent,
                dailyAvg: daysEl > 0 ? spent / daysEl : 0,
                savingsRate: income > 0 ? Math.max(0, Math.round(((income - spent) / income) * 100)) : 0,
                vsLast: vsLastMonth,
                vsLabel: 'vs Last Month',
                periodLabel: FULL_MONTHS[currentMonth],
                days: daysEl,
                income,
                previousSpent: lastMonthExp,
                previousIncome: lastMonthInc,
                prevName: FULL_MONTHS[currentMonth === 1 ? 12 : currentMonth - 1],
            };
        }
        if (effectivePeriod === 'quarter') {
            const q = Math.ceil(currentMonth / 3);
            const qMonths = [q * 3 - 2, q * 3 - 1, q * 3];
            let qExp = 0, qInc = 0;
            qMonths.forEach(m => { const e = trendsMap[`${currentYear}-${m}`]; if (e) { qExp += e.expenses; qInc += e.income; } });
            const pq = q === 1 ? 4 : q - 1;
            const pqYear = q === 1 ? currentYear - 1 : currentYear;
            let pqExp = 0, pqInc = 0;
            [pq * 3 - 2, pq * 3 - 1, pq * 3].forEach(m => { const e = trendsMap[`${pqYear}-${m}`]; if (e) { pqExp += e.expenses; pqInc += e.income; } });
            const qStart = new Date(currentYear, (q - 1) * 3, 1);
            const qEnd = new Date(currentYear, q * 3, 0);
            const today = new Date();
            const isCurrentQ = today >= qStart && today <= qEnd;
            const totalDays = Math.round((qEnd.getTime() - qStart.getTime()) / 86400000) + 1;
            const daysEl = isCurrentQ ? Math.round((today.getTime() - qStart.getTime()) / 86400000) + 1 : totalDays;
            return {
                totalSpent: qExp,
                dailyAvg: daysEl > 0 ? qExp / daysEl : 0,
                savingsRate: qInc > 0 ? Math.max(0, Math.round(((qInc - qExp) / qInc) * 100)) : 0,
                vsLast: pqExp > 0 ? Math.round(((qExp - pqExp) / pqExp) * 100) : null,
                vsLabel: 'vs Last Quarter',
                periodLabel: `Q${q} ${currentYear}`,
                days: daysEl,
                income: qInc,
                previousSpent: pqExp,
                previousIncome: pqInc,
                prevName: `Q${pq} ${pqYear}`,
            };
        }
        // year
        const yExp = getYearlyTotal(currentYear, 'expense');
        const yInc = getYearlyTotal(currentYear, 'income');
        const pyExp = getYearlyTotal(currentYear - 1, 'expense');
        const pyInc = getYearlyTotal(currentYear - 1, 'income');
        const today = new Date();
        const yearStart = new Date(currentYear, 0, 1);
        const daysEl = currentYear === _nowYear ? Math.round((today.getTime() - yearStart.getTime()) / 86400000) + 1 : 365;
        return {
            totalSpent: yExp,
            dailyAvg: daysEl > 0 ? yExp / daysEl : 0,
            savingsRate: yInc > 0 ? Math.max(0, Math.round(((yInc - yExp) / yInc) * 100)) : 0,
            vsLast: pyExp > 0 ? Math.round(((yExp - pyExp) / pyExp) * 100) : null,
            vsLabel: 'vs Last Year',
            periodLabel: String(currentYear),
            days: daysEl,
            income: yInc,
            previousSpent: pyExp,
            previousIncome: pyInc,
            prevName: String(currentYear - 1),
        };
    }, [effectivePeriod, summary, trendsMap, currentMonth, currentYear, isCurrentMonth, vsLastMonth, lastMonthExp, lastMonthInc, yearlyData, _nowYear]);

    const merchantData = useMemo(() => {
        const map: Record<string, { total: number; count: number }> = {};
        allTransactions.filter((tx: any) => isNonSavingsExpense(tx) && tx.description).forEach((tx: any) => {
            const key = (tx.description as string).trim();
            if (!map[key]) map[key] = { total: 0, count: 0 };
            map[key].total += parseFloat(tx.amount);
            map[key].count += 1;
        });
        return Object.entries(map)
            .map(([name, { total, count }]) => ({ name, total, count }))
            .sort((a, b) => b.total - a.total)
            .slice(0, 10);
    }, [allTransactions]);

    const savingsRateData = useMemo(() =>
        areaData
            .filter(d => d.income > 0 || d.expenses > 0)
            .map(d => ({
                month: d.month,
                rate: d.income > 0 ? Math.round(((d.income - d.expenses) / d.income) * 100) : 0,
            })),
    [areaData]);

    const handleGeneratePlan = async (force?: boolean) => {
        setAllocationLoading(true); setAllocationError('');
        try {
            const res = await aiAPI.salaryAllocation(force);
            setAllocationPlan(res.data); setPlanGenerated(true);
        } catch (err: any) {
            setAllocationError(err?.response?.status === 429
                ? 'AI is taking a short break. Please try again in a few minutes.'
                : 'Failed to generate plan. Please try again.');
        } finally { setAllocationLoading(false); }
    };

    // ── Figures shared by the sections ────────────────────────────────────────
    const { totalSpent, income, previousSpent, previousIncome, prevName, periodLabel, savingsRate, days } = periodStats;
    const kept = income - totalSpent;
    const spendCompare = comparePeriod(totalSpent, previousSpent, prevName);
    const incomeCompare = previousIncome > 0 ? comparePeriod(income, previousIncome, prevName, true) : null;
    const dayWord = `${days} day${days !== 1 ? 's' : ''}`;

    const categoryRows = useMemo(
        () => shareRows(categories.map((c: any) => ({ name: c.name, total: parseFloat(c.total), color: c.color })), 6),
        [categories],
    );
    const dow = useMemo(() => dayOfWeekSummary(weeklyData.map(d => d.amount)), [weeklyData]);
    const pmPct = (pm: any) => (paymentTotal > 0 ? Math.round((parseFloat(String(pm.total)) / paymentTotal) * 100) : 0);
    const topMethod = paymentMethods.reduce<any>((best, pm) => (!best || parseFloat(String(pm.total)) > parseFloat(String(best.total)) ? pm : best), null);
    const topMerchant = merchantData[0];
    const topCategory = categoryRows[0];

    const hasTrend = areaData.length > 0;
    const axisTick = { fill: cc.faint, fontSize: 11, fontFamily: 'DM Mono, monospace' };

    // The summary card's label and display figure, shared by Overview and Spending.
    const summaryHead = (label: string, figure: number) => (
        <>
            <p style={{ ...type.label, margin: 0 }}>{label}</p>
            <p className="type-display" style={{ ...type.display, margin: '6px 0 0' }}>{fmt(figure)}</p>
        </>
    );

    return (
        <>
            <AnalyticsHead tab={section} onTabChange={onTabChange}
                actions={<Button variant="secondary" onClick={() => void exportToCSV(allTransactions, 'fintrack-all.csv')}>Export CSV</Button>} />

            {/* ── PERIOD ── */}
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
                    <button type="button" className="fin-icon-btn" onClick={goToPrev} aria-label="Previous period">
                        <ChevronLeft size={16} />
                    </button>
                    <span style={{ ...type.title, userSelect: 'none' }}>{navLabel}</span>
                    <button type="button" className="fin-icon-btn" onClick={goToNext} disabled={isCurrentPeriod} aria-label="Next period">
                        <ChevronRight size={16} />
                    </button>
                </div>
                {followsPeriod && <div style={{ display: 'inline-flex', gap: 2, padding: 3, borderRadius: 'var(--radius-md)', background: 'var(--glass-fill-1)' }}>
                    {(['month', 'quarter', 'year'] as const).map(p => (
                        <button key={p} type="button" aria-pressed={period === p} onClick={() => handleSetPeriod(p)}
                            style={{
                                ...type.label,
                                color: period === p ? 'var(--text-primary)' : 'var(--text-secondary)',
                                background: period === p ? 'var(--glass-fill-3)' : 'transparent',
                                border: 'none', cursor: 'pointer', padding: '6px 12px', borderRadius: 'var(--radius-sm)',
                                transition: 'background var(--transition-fast), color var(--transition-fast)',
                            }}>
                            {p === 'month' ? 'Month' : p === 'quarter' ? 'Quarter' : 'Year'}
                        </button>
                    ))}
                </div>}
            </div>

            {dataLoading ? (
                <>
                    <SkeletonCard height={150} />
                    <div className="fin-two">
                        <SkeletonCard height={220} />
                        <SkeletonCard height={220} />
                    </div>
                </>
            ) : (
                <>
                    {/* ── OVERVIEW ── */}
                    {section === 'overview' && (
                        <>
                            <Card>
                                {summaryHead(`Spent in ${periodLabel}`, totalSpent)}
                                <div className="dash-stats">
                                    <Stat className="dash-stat" label="Daily average" value={fmt(periodStats.dailyAvg)}
                                        sub={isCurrentPeriod ? `${dayWord} so far` : dayWord} />
                                    <Stat className="dash-stat" label={`Compared with ${prevName}`} value={spendCompare.value}
                                        sub={spendCompare.detail} subTone={spendCompare.tone} />
                                    <Stat className="dash-stat" label="Money in" value={fmt(income)} sub="All income" />
                                    <Stat className="dash-stat" label="Savings rate" value={`${savingsRate}%`}
                                        sub={kept < 0 ? 'Spent more than you earned' : `${fmt(kept)} kept`} subTone={kept < 0 ? 'bad' : 'neutral'} />
                                </div>
                            </Card>

                            <div className="fin-two">
                                <Card>
                                    <CardHeader title="Income and spending" sub={`Last ${areaData.length} months`} />
                                    {!hasTrend ? (
                                        <p style={{ ...type.meta, margin: 0 }}>No trend data yet. Add transactions to see the chart.</p>
                                    ) : (
                                        <>
                                            <ResponsiveContainer width="100%" height={220}>
                                                <LineChart data={areaData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                                                    <CartesianGrid horizontal vertical={false} stroke={cc.border} strokeWidth={1} />
                                                    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={axisTick} />
                                                    <YAxis hide />
                                                    <Tooltip content={<ChartTooltip />} />
                                                    <Line type="monotone" dataKey="income" name="Income" stroke={cc.inc} strokeWidth={2} {...chartAnim} dot={false} />
                                                    <Line type="monotone" dataKey="expenses" name="Expenses" stroke={cc.exp} strokeWidth={2} {...chartAnim} dot={false} />
                                                </LineChart>
                                            </ResponsiveContainer>
                                            <div style={{ display: 'flex', gap: 'var(--space-4)', marginTop: 'var(--space-3)' }}>
                                                {[{ label: 'Income', color: cc.inc }, { label: 'Expenses', color: cc.exp }].map(l => (
                                                    <div key={l.label} style={{ ...type.meta, display: 'flex', alignItems: 'center', gap: 6 }}>
                                                        <span aria-hidden="true" style={{ width: 8, height: 2, background: l.color, flexShrink: 0 }} />
                                                        {l.label}
                                                    </div>
                                                ))}
                                            </div>
                                        </>
                                    )}
                                </Card>

                                {savingsRateData.length >= 2 && (
                                    <Card>
                                        <CardHeader title="Savings rate" sub="Share of income kept, by month"
                                            action={<span style={type.num}>{savingsRate}%</span>} />
                                        <ResponsiveContainer width="100%" height={220}>
                                            <LineChart data={savingsRateData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                                                <CartesianGrid horizontal vertical={false} stroke={cc.border} strokeWidth={1} />
                                                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={axisTick} />
                                                <YAxis hide domain={['auto', 'auto']} />
                                                <Tooltip content={<SavingsTooltip />} />
                                                <Line type="monotone" dataKey="rate" name="Savings rate" stroke={cc.accent2} strokeWidth={2} {...chartAnim} dot={false} />
                                            </LineChart>
                                        </ResponsiveContainer>
                                    </Card>
                                )}
                            </div>
                        </>
                    )}

                    {/* ── SPENDING ── */}
                    {section === 'spending' && (
                        <>
                            <Card>
                                {summaryHead(`Spent in ${periodLabel} ${currentYear}`, totalSpent)}
                                <div className="dash-stats">
                                    <Stat className="dash-stat" label="Biggest category" value={topCategory ? topCategory.name : '—'}
                                        sub={topCategory ? `${fmt(topCategory.total)} · ${topCategory.pct}%` : 'No spending yet'} />
                                    <Stat className="dash-stat" label="Busiest day" value={dow.busiest ? dow.busiest.full : '—'}
                                        sub={dow.busiest ? `${fmt(dow.busiest.amount)} in total` : 'No spending yet'} />
                                    <Stat className="dash-stat" label="Most used way to pay" value={topMethod ? topMethod.method : '—'}
                                        sub={topMethod ? `${pmPct(topMethod)}% of spending` : 'No spending yet'} />
                                    <Stat className="dash-stat" label="Top merchant" value={topMerchant ? topMerchant.name : '—'}
                                        sub={topMerchant ? fmt(topMerchant.total) : 'No spending yet'} />
                                </div>
                            </Card>

                            <div className="fin-two">
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', minWidth: 0 }}>
                                    <Card>
                                        <CardHeader title="Where it went" sub="By category, biggest first" />
                                        {categoryRows.length === 0 ? (
                                            <p style={{ ...type.meta, margin: 0 }}>No expenses this month.</p>
                                        ) : (
                                            <Rows>
                                                {categoryRows.map(row => (
                                                    <div key={row.name} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
                                                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-3)' }}>
                                                            <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, alignSelf: 'center', background: row.name === 'Everything else' ? 'var(--text-muted)' : (row.color || 'var(--text-muted)') }} />
                                                            <span style={{ ...type.bodyStrong, ...truncate, flex: 1, minWidth: 0 }}>{row.name}</span>
                                                            <span style={type.numSmall}>{row.pct}%</span>
                                                            <span style={type.num}>{fmt(row.total)}</span>
                                                        </div>
                                                        <ProgressBar pct={row.pct} height={4} color="var(--text-secondary)" />
                                                    </div>
                                                ))}
                                            </Rows>
                                        )}
                                    </Card>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', minWidth: 0 }}>
                                    <Card>
                                        <CardHeader title="By day of the week" sub={`Weekends carry ${dow.weekendPct}% of spending`} />
                                        <div style={{ display: 'flex', gap: 'var(--space-2)', height: 120 }}>
                                            {dow.order.map(d => {
                                                const isPeak = !!dow.busiest && d.day === dow.busiest.day;
                                                const share = dow.busiest && dow.busiest.amount > 0 ? Math.max(4, (d.amount / dow.busiest.amount) * 100) : 4;
                                                return (
                                                    <div key={d.day} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                                                        <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end' }}>
                                                            <div role="img" aria-label={`${d.day}: ${fmt(d.amount)}`}
                                                                style={{ width: '100%', height: `${share}%`, borderRadius: 'var(--radius-sm)', background: isPeak ? 'var(--text-primary)' : 'var(--text-secondary)', opacity: isPeak ? 1 : 0.5 }} />
                                                        </div>
                                                        <span style={{ ...type.micro, textAlign: 'center' }}>{d.day}</span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </Card>

                                    {paymentMethods.length > 0 && (
                                        <Card>
                                            <CardHeader title="How you paid" sub="Share of spending by payment method" />
                                            <Rows>
                                                {paymentMethods.map((pm: any) => (
                                                    <div key={pm.method}>
                                                        <span style={{ ...type.bodyStrong, ...truncate, flex: 1, minWidth: 0 }}>{pm.method}</span>
                                                        <span style={type.numSmall}>{pmPct(pm)}%</span>
                                                        <span style={type.num}>{fmt(pm.total)}</span>
                                                    </div>
                                                ))}
                                            </Rows>
                                        </Card>
                                    )}

                                    {merchantData.length > 0 && (
                                        <Card>
                                            <CardHeader title="Top merchants" sub="Where you spent the most" />
                                            <Rows>
                                                {merchantData.slice(0, 5).map(m => (
                                                    <div key={m.name}>
                                                        <div style={{ flex: 1, minWidth: 0 }}>
                                                            <p style={{ ...type.bodyStrong, ...truncate, margin: 0 }}>{m.name}</p>
                                                            <p style={{ ...type.meta, margin: '2px 0 0' }}>{m.count} order{m.count !== 1 ? 's' : ''}</p>
                                                        </div>
                                                        <span style={type.num}>{fmt(m.total)}</span>
                                                    </div>
                                                ))}
                                            </Rows>
                                        </Card>
                                    )}
                                </div>
                            </div>

                            <ToggleCard title="Category trends" sub="Six months per category, improving or getting worse"
                                open={showTrajectory} onToggle={() => setShowTrajectory(v => !v)}>
                                <CategoryTrajectory transactions={allTransactions} isMobile={isMobile} />
                            </ToggleCard>

                            <ToggleCard title="Daily spending, this year" sub="One square per day, darker for more spending"
                                open={showHeatmap} onToggle={() => setShowHeatmap(v => !v)}>
                                <SpendingHeatmap transactions={yearTransactions} />
                            </ToggleCard>
                        </>
                    )}

                    {/* ── INCOME ── */}
                    {section === 'income' && (
                        <>
                            <Card>
                                {summaryHead(`Earned in ${periodLabel}`, income)}
                                <div className="dash-stats">
                                    <Stat className="dash-stat" label={`Compared with ${prevName}`} value={incomeCompare ? incomeCompare.value : '—'}
                                        sub={incomeCompare ? incomeCompare.detail : 'No earlier period to compare'} subTone={incomeCompare ? incomeCompare.tone : 'neutral'} />
                                    <Stat className="dash-stat" label="Spent" value={fmt(totalSpent)} sub={`In ${periodLabel}`} />
                                    <Stat className="dash-stat" label="Kept" value={fmt(kept)}
                                        sub={kept < 0 ? 'Spent more than you earned' : 'Money in less spent'} subTone={kept < 0 ? 'bad' : 'neutral'} />
                                    <Stat className="dash-stat" label="Savings rate" value={`${savingsRate}%`} sub="Share of income kept" />
                                </div>
                            </Card>

                            <div className={yearlyData ? 'fin-two' : undefined}>
                                <Card>
                                    <CardHeader title="Income trend" sub={`Last ${incomeAreaData.length} months`} />
                                    {incomeAreaData.length === 0 ? (
                                        <p style={{ ...type.meta, margin: 0 }}>No income data yet.</p>
                                    ) : (
                                        <ResponsiveContainer width="100%" height={180}>
                                            <LineChart data={incomeAreaData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                                                <CartesianGrid horizontal vertical={false} stroke={cc.border} strokeWidth={1} />
                                                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={axisTick} />
                                                <YAxis hide />
                                                <Tooltip content={<ChartTooltip />} />
                                                <Line type="monotone" dataKey="income" name="Income" stroke={cc.inc} strokeWidth={2} {...chartAnim} dot={false} />
                                            </LineChart>
                                        </ResponsiveContainer>
                                    )}
                                </Card>

                                {yearlyData && (
                                    <Card>
                                        <CardHeader title="Year over year" sub={`${yearlyData.years?.current} against ${yearlyData.years?.last}`} />
                                        <Rows>
                                            {[
                                                { label: 'Income', curr: getYearlyTotal(yearlyData.years?.current, 'income'), last: getYearlyTotal(yearlyData.years?.last, 'income'), higherIsBetter: true },
                                                { label: 'Expenses', curr: getYearlyTotal(yearlyData.years?.current, 'expense'), last: getYearlyTotal(yearlyData.years?.last, 'expense'), higherIsBetter: false },
                                                { label: 'Savings', curr: getYearlyTotal(yearlyData.years?.current, 'income') - getYearlyTotal(yearlyData.years?.current, 'expense'), last: getYearlyTotal(yearlyData.years?.last, 'income') - getYearlyTotal(yearlyData.years?.last, 'expense'), higherIsBetter: true },
                                            ].map(row => {
                                                const change = pctChange(row.curr, row.last);
                                                const isUp = change !== null && parseFloat(change) >= 0;
                                                // isGood is about the colour; a rise in Expenses is up but not welcome.
                                                const isGood = row.higherIsBetter ? isUp : !isUp;
                                                return (
                                                    <div key={row.label}>
                                                        <div style={{ flex: 1, minWidth: 0 }}>
                                                            <p style={{ ...type.bodyStrong, margin: 0 }}>{row.label}</p>
                                                            <p style={{ ...type.meta, margin: '2px 0 0' }}>{yearlyData.years?.last}: {fmt(row.last)}</p>
                                                        </div>
                                                        <div style={{ textAlign: 'right' }}>
                                                            <p style={{ ...type.num, margin: 0 }}>{fmt(row.curr)}</p>
                                                            {change && (
                                                                <p style={{ ...type.meta, margin: '2px 0 0', color: TONE_TEXT[isGood ? 'good' : 'caution'] }}>
                                                                    {isUp ? 'Up' : 'Down'} {Math.abs(parseFloat(change))}% on {yearlyData.years?.last}
                                                                </p>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </Rows>
                                    </Card>
                                )}
                            </div>

                            {/* AI Salary Allocation */}
                            <Card>
                                <CardHeader
                                    title="Salary allocation plan"
                                    sub={planGenerated && allocationPlan ? allocationPlan.summary : 'An AI-recommended 50/30/20 budget split based on your income and spending history'}
                                    action={
                                        planGenerated && allocationPlan && !allocationLoading
                                            ? <TextAction onClick={() => void handleGeneratePlan(true)}>Regenerate</TextAction>
                                            : !allocationLoading
                                            ? <Button size="sm" onClick={() => void handleGeneratePlan()}>Generate plan</Button>
                                            : undefined
                                    }
                                />

                                {allocationError && <p style={{ ...type.meta, color: 'var(--color-exp-text)', margin: '0 0 var(--space-3)' }}>{allocationError}</p>}

                                {allocationLoading && (
                                    <div style={{ padding: 'var(--space-6) 0', textAlign: 'center' }}>
                                        <div style={{ width: 28, height: 28, borderRadius: '50%', border: '3px solid var(--border-subtle)', borderTop: '3px solid var(--text-secondary)', animation: 'spin 0.8s linear infinite', margin: '0 auto' }} />
                                        <p style={{ ...type.meta, marginTop: 'var(--space-3)' }}>Analysing your spending patterns...</p>
                                    </div>
                                )}

                                {planGenerated && allocationPlan && !allocationLoading && (
                                    <>
                                        {allocationPlan.from_cache && (
                                            <p style={{ ...type.meta, margin: '0 0 var(--space-3)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                                                Cached, updates every 6h
                                                <TextAction onClick={() => void handleGeneratePlan(true)}>Refresh now</TextAction>
                                            </p>
                                        )}
                                        <Rows>
                                            <div>
                                                <span style={{ ...type.bodyStrong, flex: 1 }}>Monthly salary</span>
                                                <span style={type.num}>{fmt(allocationPlan.salary)}</span>
                                            </div>

                                            {allocationPlan.month_comparison && (
                                                <div style={{ flexDirection: 'column', alignItems: 'stretch', gap: 2 }}>
                                                    <span style={{ ...type.bodyStrong, color: allocationPlan.month_comparison.trend === 'improving' ? TONE_TEXT.good : allocationPlan.month_comparison.trend === 'worsening' ? TONE_TEXT.caution : undefined }}>
                                                        {allocationPlan.month_comparison.trend === 'improving' ? 'Spending improved vs last month' : allocationPlan.month_comparison.trend === 'worsening' ? 'Spending increased vs last month' : 'Spending stable vs last month'}
                                                    </span>
                                                    <span style={type.meta}>
                                                        Biggest change: {allocationPlan.month_comparison.biggest_change_category} {allocationPlan.month_comparison.biggest_change_amount >= 0 ? '+' : '−'}{fmt(Math.abs(allocationPlan.month_comparison.biggest_change_amount))}
                                                    </span>
                                                </div>
                                            )}

                                            {allocationPlan.allocation?.map((bucket: any) => (
                                                <div key={bucket.bucket} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
                                                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-3)' }}>
                                                        <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, alignSelf: 'center', background: bucket.color || 'var(--text-muted)' }} />
                                                        <span style={{ ...type.bodyStrong, flex: 1, minWidth: 0 }}>{bucket.bucket}</span>
                                                        <span style={type.numSmall}>{bucket.percentage}%</span>
                                                        <span style={type.num}>{fmt(bucket.amount)}</span>
                                                    </div>
                                                    {bucket.description && <p style={{ ...type.meta, margin: 0 }}>{bucket.description}</p>}
                                                    <ProgressBar pct={bucket.percentage} height={4} color="var(--text-secondary)" />
                                                    {bucket.categories?.map((cat: any) => (
                                                        <div key={cat.name} style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 'var(--space-3)' }}>
                                                            <div style={{ minWidth: 0 }}>
                                                                <p style={{ ...type.body, ...truncate, margin: 0 }}>{cat.name}</p>
                                                                <p style={{ ...type.meta, margin: 0 }}>
                                                                    {cat.recommended_amount > cat.last_month_actual ? 'Up from' : cat.recommended_amount < cat.last_month_actual ? 'Down from' : 'Same as'} {fmt(cat.last_month_actual)} last month
                                                                </p>
                                                            </div>
                                                            <span style={type.numSmall}>{fmt(cat.recommended_amount)}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            ))}
                                        </Rows>

                                        {allocationPlan.insights?.length > 0 && (
                                            <div style={{ marginTop: 'var(--space-5)' }}>
                                                <p style={{ ...type.label, margin: '0 0 var(--space-3)' }}>Insights</p>
                                                <Rows>
                                                    {allocationPlan.insights.map((insight: string, i: number) => (
                                                        <div key={i} style={{ alignItems: 'baseline' }}>
                                                            <span style={type.numSmall}>{i + 1}</span>
                                                            <span style={{ ...type.body, flex: 1, minWidth: 0 }}>{insight}</span>
                                                        </div>
                                                    ))}
                                                </Rows>
                                            </div>
                                        )}
                                    </>
                                )}
                            </Card>
                        </>
                    )}

                    {/* ── TRENDS ── */}
                    {section === 'trends' && (
                        <ToggleCard title="Where your money flows" sub="Income sources to spending categories, last 3 months"
                            open={showSankey} onToggle={() => setShowSankey(v => !v)}>
                            <SankeyFlow transactions={allTransactions} />
                        </ToggleCard>
                    )}
                </>
            )}
        </>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// INSIGHTS TAB (formerly /insights)
// ═══════════════════════════════════════════════════════════════════════════
const PATTERN_LABELS: Record<string, string> = {
    budget_anchoring: 'Budget Anchoring',
    present_bias: 'Present Bias (Early-Month Spending)',
    subscription_bloat: 'Subscription Bloat',
    idle_savings_despite_debt: 'Idle Savings Despite Debt',
};

function InsightsTab() {
    const { user } = useAuthStore();

    // Cached: reopening Insights shows the last results at once. A failed
    // load settles to "nothing to show", as before.
    const queryClient = useQueryClient();
    const patternsKey = ['insights', user?.id, 'patterns'];
    const patternsQuery = useUserQuery('insights', ['patterns'],
        () => insightsAPI.getBehavioralPatterns().then(res => res.data).catch(() => null));
    const patterns = patternsQuery.data ?? null;
    const patternsLoading = patternsQuery.isPending;
    const [refreshing, setRefreshing] = useState(false);

    const refreshPatterns = async () => {
        setRefreshing(true);
        try {
            const res = await insightsAPI.getBehavioralPatterns(true);
            queryClient.setQueryData(patternsKey, res.data);
        } catch { toast.error('Failed to refresh patterns — try again'); } finally { setRefreshing(false); }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
                <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>
                    Insights
                </h1>
                <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)' }}>
                    Patterns in your spending behavior.
                </p>
            </div>

            {/* ── BEHAVIORAL PATTERNS ── */}
            {patternsLoading ? (
                <SkeletonCard height={400} />
            ) : !patterns ? (
                <p style={{ fontSize: '13px', color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>Could not load behavioral patterns.</p>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {/* AI insight card */}
                    <div className="glass-surface" style={{ background: 'color-mix(in srgb, var(--accent) 10%, var(--glass-surface))', borderColor: 'color-mix(in srgb, var(--accent) 22%, var(--glass-border))', borderRadius: 'var(--radius-xl)', padding: '18px 20px', display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
                        <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <Brain size={18} color="white" />
                        </div>
                        <div>
                            <p style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 6px', fontFamily: 'var(--font-body)' }}>
                                AI Insight
                            </p>
                            <p style={{ fontSize: '14px', color: 'var(--text-primary)', lineHeight: 1.6, margin: 0, fontFamily: 'var(--font-body)' }}>
                                {patterns.ai_insight}
                            </p>
                        </div>
                    </div>

                    <div className="glass-field" style={{ display: 'inline-flex', alignSelf: 'flex-start', alignItems: 'center', padding: '5px 14px', borderRadius: '20px' }}>
                        <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>
                            {patterns.detected_count} of 5 patterns detected in your spending
                        </span>
                    </div>

                    <div className="glass-surface" style={{ borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
                        {patterns.patterns.map((p: any, idx: number) => (
                            <div key={p.pattern_name} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', padding: '14px 18px', borderBottom: idx < patterns.patterns.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
                                <div style={{ width: 32, height: 32, borderRadius: '50%', background: p.detected ? 'color-mix(in srgb, var(--color-warn) 12%, transparent)' : 'color-mix(in srgb, var(--color-inc) 12%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                    {p.detected
                                        ? <AlertTriangle size={15} color="var(--color-warn)" />
                                        : <CheckCircle2 size={15} color="var(--color-inc)" />}
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px', fontFamily: 'var(--font-body)' }}>
                                        {PATTERN_LABELS[p.pattern_name] || p.pattern_name}
                                    </p>
                                    {p.detected ? (
                                        <>
                                            {patternContext(p) && (
                                                <p style={{ fontSize: '12px', color: 'var(--color-warn)', margin: '0 0 4px', fontFamily: 'var(--font-body)' }}>
                                                    {patternContext(p)}
                                                </p>
                                            )}
                                            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0, lineHeight: 1.5, fontFamily: 'var(--font-body)' }}>
                                                {p.description}
                                            </p>
                                        </>
                                    ) : (
                                        <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)' }}>
                                            No signs of this pattern in your recent data.
                                        </p>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>

                    <Button onClick={refreshPatterns} isLoading={refreshing} variant="secondary" style={{ alignSelf: 'flex-start' }}>
                        <RefreshCw size={14} /> Refresh
                    </Button>
                </div>
            )}
        </div>
    );
}

// ── Human-readable context for detected patterns ─────────────────────────────
function patternContext(p: any): string {
    const d = p.supporting_data || {};
    switch (p.pattern_name) {
        case 'budget_anchoring': {
            const cats = (d.categories || []).filter((c: any) => c.near_limit_months >= 2);
            if (cats.length === 0) return '';
            const total = d.categories?.[0]?.total_months ?? cats[0].near_limit_months;
            return `You spent 85-100% of budget in ${cats[0].near_limit_months} out of ${total} months in ${cats.length} categor${cats.length === 1 ? 'y' : 'ies'}.`;
        }
        case 'present_bias':
            return `You spend ₹${Math.round(d.first_half_avg_daily || 0)}/day in the first half of the month vs ₹${Math.round(d.second_half_avg_daily || 0)}/day in the second half.`;
        case 'subscription_bloat':
            return `${d.recurring_subscription_count} recurring subscriptions detected over the last 3 months.`;
        case 'idle_savings_despite_debt':
            return `₹${Math.round(d.bank_balance || 0).toLocaleString('en-IN')} in savings vs ₹${Math.round(d.credit_card_outstanding || 0).toLocaleString('en-IN')} in credit card debt.`;
        default:
            return '';
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// REPORTS TAB (formerly /reports)
// ═══════════════════════════════════════════════════════════════════════════
const QUICK_RANGES = [
    { label: 'This Month',   getDates: () => { const n = new Date(); return { from: `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-01`, to: new Date().toISOString().split('T')[0] }; } },
    { label: 'Last Month',   getDates: () => { const d = new Date(); d.setMonth(d.getMonth()-1); const y=d.getFullYear(),m=d.getMonth()+1,l=new Date(y,m,0).getDate(); return { from:`${y}-${String(m).padStart(2,'0')}-01`, to:`${y}-${String(m).padStart(2,'0')}-${l}` }; } },
    { label: 'Last 3 Months', getDates: () => { const to=new Date().toISOString().split('T')[0]; const from=new Date(new Date().setMonth(new Date().getMonth()-3)).toISOString().split('T')[0]; return {from,to}; } },
    { label: 'Last 6 Months', getDates: () => { const to=new Date().toISOString().split('T')[0]; const from=new Date(new Date().setMonth(new Date().getMonth()-6)).toISOString().split('T')[0]; return {from,to}; } },
    { label: 'This Year',    getDates: () => { const y=new Date().getFullYear(); return { from:`${y}-01-01`, to:new Date().toISOString().split('T')[0] }; } },
];

const reportsCardSt: React.CSSProperties = { borderRadius: 'var(--radius-lg)', padding: '18px 20px', marginBottom: '16px' };

function ReportsTab() {
    const isMobile = useIsMobile();
    const today = new Date().toISOString().split('T')[0];
    const firstOfMonth = `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}-01`;

    const [from, setFrom]                 = useState(firstOfMonth);
    const [to, setTo]                     = useState(today);
    const [data, setData]                 = useState<any>(null);
    const [loading, setLoading]           = useState(false);
    const [searched, setSearched]         = useState(false);

    const fetchReport = async () => {
        if (!from || !to) return;
        setLoading(true);
        try { const res = await analyticsAPI.report(from, to); setData(res.data); setSearched(true); }
        catch (err) { console.error(err); toast.error('Failed to generate report — try again'); }
        finally { setLoading(false); }
    };

    const totalExpenses = data?.categories?.reduce((s: number, c: any) => s + parseFloat(c.total), 0) || 0;

    return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

                {/* Header */}
                <div className="glass-surface" style={{ borderRadius: 'var(--radius-xl)', padding: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
                        <div>
                            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 3px' }}>Reports</h1>
                            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)' }}>Custom date range analytics</p>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            {data && (
                                <Button variant="secondary" size="md" onClick={() => void exportToCSV(data.transactions, `fintrack-report-${from}-to-${to}.csv`)}>
                                    <Download size={16} />Export CSV
                                </Button>
                            )}
                        </div>
                    </div>
                </div>

                <div className="glass-surface" style={reportsCardSt}>
                    <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 14px' }}>Select Date Range</h3>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
                        {QUICK_RANGES.map(range => (
                            <button key={range.label} type="button" onClick={() => { const { from: f, to: t } = range.getDates(); setFrom(f); setTo(t); }}
                                className="glass-field"
                                style={{ padding: '6px 14px', borderRadius: 'var(--radius-md)', color: 'var(--text-secondary)', fontSize: '12px', cursor: 'pointer', transition: 'all 0.15s', fontFamily: 'var(--font-body)' }}
                                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--accent-subtle)'; (e.currentTarget as HTMLElement).style.color = 'var(--accent)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent-border)'; }}
                                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = ''; (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)'; (e.currentTarget as HTMLElement).style.borderColor = ''; }}>
                                {range.label}
                            </button>
                        ))}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr auto', gap: '12px', alignItems: 'end' }}>
                        <DatePicker label="From" value={from} onChange={setFrom} />
                        <DatePicker label="To" value={to} onChange={setTo} minDate={from} />
                        <Button onClick={fetchReport} isLoading={loading} size="md"><Search size={15} />Generate</Button>
                    </div>
                </div>

                {searched && data && (
                    <>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px' }}>
                            {[
                                { label: 'Income',       value: fmt(data.summary.income),    color: 'var(--color-inc)' },
                                { label: 'Expenses',     value: fmt(data.summary.expenses),  color: 'var(--color-exp)' },
                                { label: 'Balance',      value: fmt(data.summary.balance),   color: data.summary.balance >= 0 ? 'var(--color-inc)' : 'var(--color-exp)' },
                                { label: 'Savings Rate', value: `${data.summary.savings_rate}%`, color: 'var(--accent)' },
                                { label: 'Transactions', value: data.summary.transaction_count, color: 'var(--color-warn)' },
                            ].map(c => (
                                <GCard key={c.label}>
                                    <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '0 0 4px', fontFamily: 'var(--font-body)' }}>{c.label}</p>
                                    <p style={{ fontFamily: 'var(--font-mono)', fontSize: '1rem', fontWeight: 700, color: c.color, margin: 0, fontVariantNumeric: 'tabular-nums' }}>{c.value}</p>
                                </GCard>
                            ))}
                        </div>

                        {data.categories.length > 0 && (
                            <div className="glass-surface" style={reportsCardSt}>
                                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 14px' }}>Spending by Category</h3>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    {data.categories.map((cat: any) => {
                                        const pct = totalExpenses > 0 ? (parseFloat(cat.total) / totalExpenses) * 100 : 0;
                                        return (
                                            <div key={cat.name}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: cat.color }} />
                                                        <span style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 500, fontFamily: 'var(--font-body)' }}>{cat.name}</span>
                                                    </div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                        <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>{pct.toFixed(1)}%</span>
                                                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 600, color: 'var(--color-exp)', fontVariantNumeric: 'tabular-nums' }}>{fmt(parseFloat(cat.total))}</span>
                                                    </div>
                                                </div>
                                                <ProgressBar pct={pct} color={cat.color} height={4} />
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        <div className="glass-surface" style={{ ...reportsCardSt, padding: 0 }}>
                            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--glass-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Transactions ({data.transactions.length})</h3>
                                <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>{from} → {to}</span>
                            </div>
                            {data.transactions.length === 0 ? (
                                <div style={{ padding: '40px', textAlign: 'center' }}>
                                    <p style={{ fontSize: '13px', color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>No transactions in this range</p>
                                </div>
                            ) : (
                                data.transactions.map((tx: any) => {
                                    const isIncome = tx.type === 'income';
                                    return (
                                        <div key={tx.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderBottom: '1px solid var(--glass-border)', gap: '12px', transition: 'background var(--transition-fast)' }}
                                            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--glass-fill-2)'}
                                            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
                                                <div style={{ width: '34px', height: '34px', borderRadius: '10px', background: isIncome ? 'color-mix(in srgb, var(--color-inc) 10%, transparent)' : 'color-mix(in srgb, var(--color-exp) 10%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                    {isIncome ? <TrendingUp size={14} color="var(--color-inc)" /> : <TrendingDown size={14} color="var(--color-exp)" />}
                                                </div>
                                                <div style={{ minWidth: 0 }}>
                                                    <p style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: 'var(--font-body)' }}>{tx.description}</p>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                                                        {tx.category_name && <span style={{ fontSize: '11px', color: tx.category_color || 'var(--text-muted)', background: tx.category_color ? `${tx.category_color}20` : 'var(--glass-fill-2)', padding: '1px 6px', borderRadius: '4px', fontFamily: 'var(--font-body)' }}>{tx.category_name}</span>}
                                                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>{formatDate(tx.date)}</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <p style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 600, color: isIncome ? 'var(--color-inc)' : 'var(--color-exp)', margin: 0, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                                                {isIncome ? '+' : '−'}{fmt(parseFloat(tx.amount))}
                                            </p>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </>
                )}

                {!searched && (
                    <div className="glass-surface" style={{ ...reportsCardSt, padding: '60px', textAlign: 'center' }}>
                        <FileText size={32} color="var(--text-muted)" style={{ marginBottom: '12px' }} />
                        <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: 0, fontFamily: 'var(--font-body)' }}>Select a date range and click Generate</p>
                    </div>
                )}
            </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// YEAR REVIEW TAB (formerly /year-review)
// ═══════════════════════════════════════════════════════════════════════════
const yrFmt = (n: number) => '₹' + Math.round(Math.abs(n)).toLocaleString('en-IN');

function YearReviewTab() {
    const { user } = useAuthStore();
    const cardRef = useRef<HTMLDivElement>(null);

    const now = new Date();
    const cy  = now.getFullYear();

    const [selectedYear, setSelectedYear]   = useState(cy - 1);
    const [allTxs, setAllTxs]               = useState<any[]>([]);
    const [loading, setLoading]             = useState(true);
    const [screenshotMsg, setScreenshotMsg] = useState(false);

    useEffect(() => {
        if (!user) return;
        setLoading(true);
        transactionsAPI.getAll()
            .then(res => setAllTxs(res.data.transactions ?? []))
            .catch(() => toast.error('Failed to load transaction data'))
            .finally(() => setLoading(false));
    }, [user]);

    const yearTxs = useMemo(() =>
        allTxs.filter(t => {
            const y = new Date((t.date ?? '').split('T')[0] + 'T00:00:00').getFullYear();
            return y === selectedYear;
        }), [allTxs, selectedYear]);

    const stats = useMemo(() => {
        if (!yearTxs.length) return null;
        // Excludes investing, goal contributions, and internal transfers from
        // "spending"/"income" -- mirrors the same definition used everywhere
        // else in the app (backend/src/utils/savingsRate.js), so this tab's
        // savings rate agrees with the Dashboard/Analytics Overview instead of
        // recomputing its own from the raw, unfiltered transaction list.
        const expenses = yearTxs.filter(isNonSavingsExpense);
        const income   = yearTxs.filter(isRealIncome);

        const catMap: Record<string, number> = {};
        expenses.forEach(t => {
            const k = t.category_name ?? t.category ?? 'Other';
            catMap[k] = (catMap[k] ?? 0) + parseFloat(t.amount ?? 0);
        });
        const topCatEntry = Object.entries(catMap).sort((a, b) => b[1] - a[1])[0];

        const mMap: Record<number, { exp: number; inc: number }> = {};
        for (let m = 1; m <= 12; m++) mMap[m] = { exp: 0, inc: 0 };
        yearTxs.forEach(t => {
            const m = new Date((t.date ?? '').split('T')[0] + 'T00:00:00').getMonth() + 1;
            const a = parseFloat(t.amount ?? 0);
            if (isNonSavingsExpense(t)) mMap[m].exp += a;
            else if (isRealIncome(t)) mMap[m].inc += a;
        });

        const worstMonth = Object.entries(mMap)
            .filter(([, v]) => v.exp > 0)
            .sort((a, b) => b[1].exp - a[1].exp)[0];

        const bestSavingsMonth = Object.entries(mMap)
            .filter(([, v]) => v.inc > v.exp && v.inc > 0)
            .sort((a, b) => (b[1].inc - b[1].exp) - (a[1].inc - a[1].exp))[0];

        const totalExp = expenses.reduce((s, t) => s + parseFloat(t.amount ?? 0), 0);
        const totalInc = income.reduce((s, t) => s + parseFloat(t.amount ?? 0), 0);
        const saved    = Math.max(totalInc - totalExp, 0);
        const rate     = totalInc > 0 ? Math.round((saved / totalInc) * 100) : 0;

        return {
            count: yearTxs.length, totalExp, totalInc, saved, rate,
            topCategory: topCatEntry ? { name: topCatEntry[0], amount: topCatEntry[1] } : null,
            worstMonth:  worstMonth  ? { m: parseInt(worstMonth[0]),  exp:  worstMonth[1].exp  } : null,
            bestSavings: bestSavingsMonth ? { m: parseInt(bestSavingsMonth[0]), savings: bestSavingsMonth[1].inc - bestSavingsMonth[1].exp } : null,
        };
    }, [yearTxs]);


    const handleScreenshot = () => {
        cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => { setScreenshotMsg(true); setTimeout(() => setScreenshotMsg(false), 3000); }, 350);
    };

    const sCard: React.CSSProperties = { borderRadius: 'var(--radius-lg)', padding: '20px', marginBottom: 0 };

    return (
        <>
            {screenshotMsg && (
                <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 9999, background: 'var(--bg-surface-3)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '10px 20px', fontSize: '14px', color: 'var(--text-primary)', fontFamily: 'var(--font-body)', boxShadow: '0 4px 16px rgba(0,0,0,0.15)', whiteSpace: 'nowrap' }}>
                    Take a screenshot of the summary card to share your year! 📸
                </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

                {/* Header */}
                <div className="glass-surface" style={sCard}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
                        <div>
                            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 3px' }}>Year in Review 🎉</h1>
                            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)' }}>Your complete financial story for {selectedYear}</p>
                        </div>
                        <div style={{ display: 'flex', gap: '6px' }}>
                            {[cy - 2, cy - 1, cy].map(y => (
                                <button key={y} type="button" onClick={() => setSelectedYear(y)}
                                    className={selectedYear === y ? undefined : 'glass-field'}
                                    style={{ padding: '6px 12px', borderRadius: '999px', border: selectedYear === y ? '1px solid var(--accent)' : undefined, background: selectedYear === y ? 'var(--accent)' : undefined, color: selectedYear === y ? 'white' : 'var(--text-muted)', fontSize: '13px', fontWeight: selectedYear === y ? 600 : 400, cursor: 'pointer', fontFamily: 'var(--font-body)', transition: 'all var(--transition-fast)' }}>
                                    {y}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {loading ? (
                    <><SkeletonCard height={200} /><SkeletonCard height={200} /></>
                ) : !stats ? (
                    <div className="glass-surface" style={{ ...sCard, padding: 0 }}>
                        <EmptyState
                            icon={BarChart3}
                            title={`No data for ${selectedYear}`}
                            subtitle="Add transactions for this year to see your review."
                        />
                    </div>
                ) : (
                    <>
                        {/* Big animated count */}
                        <div className="glass-surface" style={{ ...sCard, textAlign: 'center', padding: '36px 24px' }}>
                            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'clamp(48px, 12vw, 72px)', fontWeight: 800, color: 'var(--accent)', margin: '0 0 6px', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                                <CountUp value={stats?.count ?? 0} duration={1400} enabled={!!stats} format={n => n.toLocaleString('en-IN')} />
                            </p>
                            <p style={{ fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px' }}>transactions in {selectedYear}</p>
                            <p style={{ fontSize: '13px', color: 'var(--text-muted)', fontFamily: 'var(--font-body)', margin: 0 }}>Every rupee tracked — great financial discipline!</p>
                        </div>

                        {/* 4-stat grid */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                            {[
                                { emoji: '💰', label: 'Total Income',   value: yrFmt(stats.totalInc), color: 'var(--color-inc)' },
                                { emoji: '💸', label: 'Total Spent',    value: yrFmt(stats.totalExp), color: 'var(--color-exp)' },
                                { emoji: '🏦', label: 'Total Saved',    value: yrFmt(stats.saved),    color: 'var(--accent)'    },
                                { emoji: '📈', label: 'Savings Rate',   value: `${stats.rate}%`,    color: 'var(--accent)'    },
                            ].map(s => (
                                <div key={s.label} className="glass-surface" style={{ borderRadius: 'var(--radius-md)', padding: '16px' }}>
                                    <div style={{ fontSize: 22, marginBottom: 6 }}>{s.emoji}</div>
                                    <p style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 4px', fontFamily: 'var(--font-body)' }}>{s.label}</p>
                                    <p style={{ fontFamily: 'var(--font-mono)', fontSize: '1.15rem', fontWeight: 700, color: s.color, margin: 0, fontVariantNumeric: 'tabular-nums' }}>{s.value}</p>
                                </div>
                            ))}
                        </div>

                        {/* Highlights */}
                        <div className="glass-surface" style={sCard}>
                            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 14px' }}>Highlights</h2>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {stats.topCategory && (
                                    <div className="glass-field" style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px', borderLeft: '4px solid var(--color-exp)' }}>
                                        <span style={{ fontSize: 24, flexShrink: 0 }}>🏆</span>
                                        <div>
                                            <p style={{ fontFamily: 'var(--font-body)', fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 2px' }}>Top Spending Category</p>
                                            <p style={{ fontFamily: 'var(--font-body)', fontSize: '14px', color: 'var(--text-primary)', margin: 0 }}>
                                                Your #1 category was <strong>{stats.topCategory.name}</strong> — {yrFmt(stats.topCategory.amount)} all year
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {stats.worstMonth && (
                                    <div className="glass-field" style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px', borderLeft: '4px solid var(--color-warn)' }}>
                                        <span style={{ fontSize: 24, flexShrink: 0 }}>📅</span>
                                        <div>
                                            <p style={{ fontFamily: 'var(--font-body)', fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 2px' }}>Most Expensive Month</p>
                                            <p style={{ fontFamily: 'var(--font-body)', fontSize: '14px', color: 'var(--text-primary)', margin: 0 }}>
                                                <strong>{FULL_MONTHS[stats.worstMonth.m]}</strong> — you spent {yrFmt(stats.worstMonth.exp)}
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {stats.bestSavings && (
                                    <div className="glass-field" style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px', borderLeft: '4px solid var(--color-inc)' }}>
                                        <span style={{ fontSize: 24, flexShrink: 0 }}>🌟</span>
                                        <div>
                                            <p style={{ fontFamily: 'var(--font-body)', fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 2px' }}>Best Savings Month</p>
                                            <p style={{ fontFamily: 'var(--font-body)', fontSize: '14px', color: 'var(--text-primary)', margin: 0 }}>
                                                <strong>{FULL_MONTHS[stats.bestSavings.m]}</strong> — saved {yrFmt(stats.bestSavings.savings)}
                                            </p>
                                        </div>
                                    </div>
                                )}

                            </div>
                        </div>

                        {/* Shareable card */}
                        <div className="glass-surface" style={sCard}>
                            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 14px' }}>Share Your Story</h2>

                            <div ref={cardRef} style={{ background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent) 100%)', borderRadius: 'var(--radius-xl)', padding: '28px 24px', color: 'white', marginBottom: '14px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
                                    <div>
                                        <p style={{ fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: 800, margin: '0 0 2px', letterSpacing: '-0.01em' }}>FinTrack {selectedYear}</p>
                                        <p style={{ fontFamily: 'var(--font-body)', fontSize: '12px', opacity: 0.8, margin: 0 }}>Year in Review</p>
                                    </div>
                                    <span style={{ fontSize: 32 }}>🎯</span>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: stats.bestSavings ? '12px' : 0 }}>
                                    {[
                                        { label: 'Transactions',      value: stats.count.toLocaleString('en-IN') },
                                        { label: 'Total Saved',       value: yrFmt(stats.saved) },
                                        { label: 'Biggest Category',  value: stats.topCategory?.name ?? '—' },
                                        { label: 'Savings Rate',      value: `${stats.rate}%` },
                                    ].map(s => (
                                        <div key={s.label} style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 'var(--radius-md)', padding: '10px 14px', backdropFilter: 'blur(4px)' }}>
                                            <p style={{ fontFamily: 'var(--font-body)', fontSize: '10px', opacity: 0.75, margin: '0 0 3px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.label}</p>
                                            <p style={{ fontFamily: 'var(--font-mono)', fontSize: '15px', fontWeight: 700, margin: 0, fontVariantNumeric: 'tabular-nums', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.value}</p>
                                        </div>
                                    ))}
                                </div>

                                {stats.bestSavings && (
                                    <p style={{ fontFamily: 'var(--font-body)', fontSize: '12px', opacity: 0.9, margin: 0, textAlign: 'center', background: 'rgba(255,255,255,0.12)', borderRadius: 'var(--radius-sm)', padding: '8px 12px' }}>
                                        🌟 Best month: {FULL_MONTHS[stats.bestSavings.m]} — saved {yrFmt(stats.bestSavings.savings)}
                                    </p>
                                )}
                            </div>

                            <button type="button" onClick={handleScreenshot}
                                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '12px 20px', background: 'var(--accent-subtle)', border: '1px solid var(--accent-border)', borderRadius: 'var(--radius-md)', color: 'var(--accent)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)', width: '100%' }}>
                                <Camera size={15} /> Screenshot this card to share
                            </button>
                        </div>
                    </>
                )}
            </div>
        </>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// OUTER SHELL
// ═══════════════════════════════════════════════════════════════════════════
function AnalyticsPageInner() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { user, isLoading, loadFromStorage } = useAuthStore();

    const paramTab = searchParams.get('tab');
    const [tab, setTab] = useState(paramTab && ALL_TAB_KEYS.includes(paramTab) ? paramTab : 'overview');
    // A deep link to another tab while this page is already mounted (e.g. the
    // More sheet's Reports entry) changes only the query string -- follow it.
    const [lastParamTab, setLastParamTab] = useState(paramTab);
    if (paramTab !== lastParamTab) {
        setLastParamTab(paramTab);
        if (paramTab && ALL_TAB_KEYS.includes(paramTab)) setTab(paramTab);
    }

    useEffect(() => { loadFromStorage(); }, []);
    useEffect(() => { if (!isLoading && !user) router.push('/login'); }, [user, isLoading]);

    if (isLoading || !user) {
        return (
            <>
                <SkeletonCard height={80} style={{ marginBottom: '16px' }} />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
                    {[1, 2, 3, 4].map(i => <SkeletonCard key={i} height={72} />)}
                </div>
                <SkeletonCard height={240} style={{ marginBottom: '16px' }} />
                <SkeletonCard height={180} />
            </>
        );
    }

    return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingBottom: '24px', animation: 'fadeUp 200ms ease forwards' }}>

                {isDataSection(tab) ? (
                    <AnalyticsDataTabs section={tab} onTabChange={setTab} />
                ) : (
                    <>
                        <AnalyticsHead tab={tab} onTabChange={setTab} />
                        {tab === 'health' && <HealthTab />}
                        {tab === 'insights' && <InsightsTab />}
                        {tab === 'reports' && <ReportsTab />}
                        {tab === 'year-review' && <YearReviewTab />}
                        {tab === 'calendar' && <CalendarTab />}
                    </>
                )}
            </div>
    );
}

export default function AnalyticsPage() {
    return <Suspense><AnalyticsPageInner /></Suspense>;
}
