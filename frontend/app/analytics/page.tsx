'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import {
    AreaChart, Area, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer,
} from 'recharts';
import { useAuthStore } from '@/store/authStore';
import { toast } from '@/store/toastStore';
import { analyticsAPI, transactionsAPI, aiAPI, accountsAPI, insightsAPI } from '@/lib/api';
import { GCard } from '@/components/ui/GCard';
import { Badge } from '@/components/ui/Badge';
import { Skeleton, SkeletonCard } from '@/components/ui/Skeleton';
import { useIsMobile } from '@/hooks/useWindowSize';
import { useThemeStore } from '@/store/themeStore';
import { Button } from '@/components/ui/Button';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { DatePicker } from '@/components/ui/DatePicker';
import { Tabs } from '@/components/ui/Tabs';
import { EmptyState } from '@/components/ui/EmptyState';
import {
    Download, Sparkles, RefreshCw, Wallet, TrendingUp, TrendingDown, Calendar, Award,
    ChevronLeft, ChevronDown, ChevronRight, Brain, CheckCircle2, AlertTriangle,
    Utensils, Home, Car, Tv, ShoppingBag, HeartPulse, GraduationCap, PiggyBank,
    FileText, Search, Camera, AlertCircle, Lightbulb, Loader2, BarChart3,
} from 'lucide-react';
const vizSkeleton = (h: number) => () => <div style={{ height: h, background: 'var(--bg-surface-2)', borderRadius: 8 }} />;
const SpendingHeatmap = dynamic(() => import('@/components/analytics/SpendingHeatmap').then(m => m.SpendingHeatmap), { ssr: false, loading: vizSkeleton(100) });
const SankeyFlow = dynamic(() => import('@/components/analytics/SankeyFlow').then(m => m.SankeyFlow), { ssr: false, loading: vizSkeleton(200) });
const CategoryTrajectory = dynamic(() => import('@/components/analytics/CategoryTrajectory').then(m => m.CategoryTrajectory), { ssr: false, loading: vizSkeleton(200) });
const RegretAnalysis = dynamic(() => import('@/components/analytics/RegretAnalysis').then(m => m.RegretAnalysis), { ssr: false, loading: vizSkeleton(150) });
import { exportToCSV, formatCurrency, formatDate, fmt } from '@/lib/utils';

const OUTER_TABS = [
    { key: 'overview', label: 'Overview' },
    { key: 'insights', label: 'Insights' },
    { key: 'reports', label: 'Reports' },
    { key: 'year-review', label: 'Year Review' },
    { key: 'personality', label: 'Personality' },
];

const MONTH_NAMES = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const FULL_MONTHS = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// ── Chart colour state read from CSS custom properties at runtime ─────────────
// This ensures charts update when the theme changes.
type ChartColors = { inc: string; exp: string; accent2: string; tint: string; border: string; faint: string; bgCard: string; };
const DEFAULT_CC: ChartColors = { inc: '#059669', exp: '#ea580c', accent2: '#f97316', tint: '#fed7aa', border: '#e5e7eb', faint: '#94a3b8', bgCard: '#ffffff' };
function readChartColors(): ChartColors {
    if (typeof document === 'undefined') return DEFAULT_CC;
    const s = getComputedStyle(document.documentElement);
    const g = (v: string, fallbackKey: keyof ChartColors) => s.getPropertyValue(v).trim() || DEFAULT_CC[fallbackKey] || '';
    return {
        inc: g('--color-inc', 'inc'),
        exp: g('--accent', 'exp'),
        accent2: g('--accent', 'accent2'),
        tint: g('--accent-subtle', 'tint'),
        border: g('--border-subtle', 'border'),
        faint: g('--text-muted', 'faint'),
        bgCard: g('--bg-surface-1', 'bgCard'),
    };
}

// ── Shared custom tooltip ──────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null;
    return (
        <div style={{ background: 'var(--bg-surface-1)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '10px 14px', boxShadow: 'var(--shadow-card)' }}>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '0 0 6px', fontFamily: 'var(--font-body)', fontWeight: 600 }}>{label}</p>
            {payload.map((p: any) => (
                <p key={p.name} style={{ fontSize: '13px', color: p.stroke || p.fill, margin: '3px 0', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>
                    {p.name}: {fmt(p.value)}
                </p>
            ))}
        </div>
    );
}

// ── Section header ─────────────────────────────────────────────────────────────
function SectionHead({ title }: { title: string }) {
    return <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 14px' }}>{title}</h2>;
}

// ═══════════════════════════════════════════════════════════════════════════
// OVERVIEW TAB (formerly /analytics)
// ═══════════════════════════════════════════════════════════════════════════
function AnalyticsOverviewTab() {
    const router = useRouter();
    const { user } = useAuthStore();
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

    const currentQuarter = Math.ceil(currentMonth / 3);
    const isCurrentPeriod = period === 'year'
        ? currentYear === _nowYear
        : period === 'quarter'
        ? currentQuarter === Math.ceil(_nowMonth / 3) && currentYear === _nowYear
        : isCurrentMonth;

    const navLabel = period === 'year'
        ? String(currentYear)
        : period === 'quarter'
        ? `Q${currentQuarter} ${currentYear}`
        : `${FULL_MONTHS[currentMonth]} ${currentYear}`;

    const goToPrev = () => {
        if (period === 'year') {
            setSelYear(y => y - 1);
        } else if (period === 'quarter') {
            if (currentQuarter === 1) { setSelMonth(10); setSelYear(y => y - 1); }
            else setSelMonth((currentQuarter - 2) * 3 + 1);
        } else {
            if (currentMonth === 1) { setSelMonth(12); setSelYear(y => y - 1); }
            else setSelMonth(m => m - 1);
        }
    };
    const goToNext = () => {
        if (isCurrentPeriod) return;
        if (period === 'year') {
            setSelYear(y => y + 1);
        } else if (period === 'quarter') {
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

    const [summary, setSummary]                 = useState<any>(null);
    const [trends, setTrends]                   = useState<any[]>([]);
    const [categories, setCategories]           = useState<any[]>([]);
    const [yearlyData, setYearlyData]           = useState<any>(null);
    const [paymentMethods, setPaymentMethods]   = useState<any[]>([]);
    const [paymentTotal, setPaymentTotal]       = useState(0);
    const [allTransactions, setAllTransactions] = useState<any[]>([]);
    const [yearTransactions, setYearTransactions] = useState<any[]>([]);
    const [accounts, setAccounts]               = useState<any[]>([]);
    const [accountsLoading, setAccountsLoading] = useState(true);
    const [regretData, setRegretData]           = useState<any>(null);
    const [regretLoading, setRegretLoading]     = useState(false);
    const [allocationPlan, setAllocationPlan]   = useState<any>(null);
    const [allocationLoading, setAllocationLoading] = useState(false);
    const [allocationError, setAllocationError] = useState('');
    const [planGenerated, setPlanGenerated]     = useState(false);
    const [dataLoading, setDataLoading]         = useState(true);

    const [showHeatmap,       setShowHeatmap]       = useState(true);
    const [showSankey,        setShowSankey]        = useState(true);
    const [showTrajectory,    setShowTrajectory]    = useState(true);
    const [showRegretAnalysis, setShowRegretAnalysis] = useState(true);

    // Re-read CSS custom properties whenever theme changes
    useEffect(() => { setCc(readChartColors()); }, [theme]);

    useEffect(() => { setAllocationPlan(null); setRegretData(null); setPlanGenerated(false); setRegretLoading(false); }, [currentMonth, currentYear]);

    useEffect(() => {
        if (!user) return;
        const fetchData = async () => {
            setDataLoading(true);
            try {
                const [summaryRes, trendsRes, allTxRes, yearlyRes, pmRes] = await Promise.all([
                    analyticsAPI.summary({ month: currentMonth, year: currentYear }),
                    analyticsAPI.trends(),
                    transactionsAPI.getAll({ month: currentMonth, year: currentYear }),
                    analyticsAPI.yearly(currentYear),
                    analyticsAPI.paymentMethods({ month: currentMonth, year: currentYear }),
                ]);
                setSummary(summaryRes.data.summary);
                setCategories(summaryRes.data.category_breakdown ?? []);
                setTrends(trendsRes.data.trends ?? []);
                setAllTransactions(allTxRes.data.transactions ?? []);
                setYearlyData(yearlyRes.data);
                setPaymentMethods(pmRes.data.breakdown ?? []);
                setPaymentTotal(pmRes.data.total ?? 0);
                // Read chart colours after DOM has updated with any new theme
                setCc(readChartColors());
            } catch (err) {
                console.error(err);
                toast.error('Failed to load analytics data');
            }
            finally { setDataLoading(false); }
        };
        fetchData();
        // Fetch full year for heatmap — independent of selected month
        transactionsAPI.getAll({ year: currentYear })
            .then((res: any) => setYearTransactions(res.data.transactions ?? []))
            .catch(() => {});
        accountsAPI.getAll()
            .then((res: any) => setAccounts(res.data.accounts ?? []))
            .catch(() => setAccounts([]))
            .finally(() => setAccountsLoading(false));
    }, [user, currentMonth, currentYear]);

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

    // Ordered month list for area chart
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
        allTransactions.filter(tx => tx.type === 'expense').forEach(tx => {
            const dow = new Date((tx.date || '').split('T')[0] + 'T00:00:00').getDay();
            if (!isNaN(dow)) totals[dow] += parseFloat(tx.amount);
        });
        return days.map((day, i) => ({ day, amount: totals[i] }));
    }, [allTransactions]);
    const maxWeeklyAmt = Math.max(...weeklyData.map(d => d.amount), 1);

    // Monthly income trend for the Income tab
    const incomeAreaData = useMemo(() => areaData.map(d => ({ month: d.month, income: d.income })), [areaData]);

    // KPI computations
    const totalExpenses     = categories.reduce((s, c) => s + parseFloat(c.total ?? 0), 0);
    const daysInSelectedMonth = new Date(currentYear, currentMonth, 0).getDate();
    const daysElapsed         = isCurrentMonth ? new Date().getDate() : daysInSelectedMonth;
    const dailyAvg          = daysElapsed > 0 ? (summary?.total_expenses ?? 0) / daysElapsed : 0;
    const savingsRate       = summary?.total_income > 0 ? Math.max(0, Math.round(((summary.total_income - summary.total_expenses) / summary.total_income) * 100)) : 0;
    const lastMonthKey      = (() => { let m = currentMonth - 1, y = currentYear; if (m === 0) { m = 12; y--; } return `${y}-${m}`; })();
    const lastMonthExp      = trendsMap[lastMonthKey]?.expenses ?? 0;
    const lastMonthInc      = trendsMap[lastMonthKey]?.income ?? 0;
    const vsLastMonth       = lastMonthExp > 0 ? Math.round(((( summary?.total_expenses ?? 0) - lastMonthExp) / lastMonthExp) * 100) : null;
    const incVsLastMonth    = lastMonthInc > 0 ? Math.round((((summary?.total_income ?? 0) - lastMonthInc) / lastMonthInc) * 100) : null;
    const totalBalance      = accounts.reduce((s: number, a: any) => s + parseFloat(a.current_balance ?? a.starting_balance ?? 0), 0);

    const monthlyExpenses   = Object.values(trendsMap).map(d => d.expenses).filter(v => v > 0);
    const avgMonthlyExpense = monthlyExpenses.length ? monthlyExpenses.reduce((a, b) => a + b, 0) / monthlyExpenses.length : 0;

    const getYearlyTotal = (year: number, type: string) => {
        if (!yearlyData) return 0;
        const row = yearlyData.totals?.find((t: any) => parseInt(t.year) === year && t.type === type);
        return row ? parseFloat(row.total) : 0;
    };
    const pctChange = (curr: number, last: number) => last === 0 ? null : ((curr - last) / last * 100).toFixed(1);

    const periodStats = useMemo(() => {
        if (period === 'month') {
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
            };
        }
        if (period === 'quarter') {
            const q = Math.ceil(currentMonth / 3);
            const qMonths = [q * 3 - 2, q * 3 - 1, q * 3];
            let qExp = 0, qInc = 0;
            qMonths.forEach(m => { const e = trendsMap[`${currentYear}-${m}`]; if (e) { qExp += e.expenses; qInc += e.income; } });
            const pq = q === 1 ? 4 : q - 1;
            const pqYear = q === 1 ? currentYear - 1 : currentYear;
            let pqExp = 0;
            [pq * 3 - 2, pq * 3 - 1, pq * 3].forEach(m => { const e = trendsMap[`${pqYear}-${m}`]; if (e) pqExp += e.expenses; });
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
            };
        }
        // year
        const yExp = getYearlyTotal(currentYear, 'expense');
        const yInc = getYearlyTotal(currentYear, 'income');
        const pyExp = getYearlyTotal(currentYear - 1, 'expense');
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
        };
    }, [period, summary, trendsMap, currentMonth, currentYear, isCurrentMonth, vsLastMonth, yearlyData, _nowYear]);

    const hexToRgba = (hex: string, alpha: number) => {
        if (hex.startsWith('rgb')) return hex; // already rgba — just return
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r},${g},${b},${alpha})`;
    };

    const merchantData = useMemo(() => {
        const map: Record<string, { total: number; count: number }> = {};
        allTransactions.filter((tx: any) => tx.type === 'expense' && tx.description).forEach((tx: any) => {
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
    const maxMerchantTotal = merchantData.length > 0 ? merchantData[0].total : 1;

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

    // ── Shared card wrapper ───────────────────────────────────────────────────
    const sectionCard: React.CSSProperties = { background: 'var(--bg-surface-1)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: '20px', marginBottom: '16px' };

    return (
        <>
            {/* ── HEADER ── */}
            <div style={{ ...sectionCard, marginBottom: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 3px' }}>Analytics</h1>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <button onClick={goToPrev} style={{ display: 'flex', alignItems: 'center', padding: '2px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', borderRadius: '4px' }} aria-label="Previous period">
                                <ChevronLeft size={14} />
                            </button>
                            <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontFamily: 'var(--font-body)', userSelect: 'none' }}>{navLabel} — spending overview</span>
                            <button onClick={goToNext} disabled={isCurrentPeriod} style={{ display: 'flex', alignItems: 'center', padding: '2px', background: 'none', border: 'none', cursor: isCurrentPeriod ? 'default' : 'pointer', color: isCurrentPeriod ? 'var(--border-subtle)' : 'var(--text-muted)', borderRadius: '4px' }} aria-label="Next period">
                                <ChevronRight size={14} />
                            </button>
                        </div>
                    </div>
                    <button type="button" onClick={() => void exportToCSV(allTransactions, 'fintrack-all.csv')}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', background: 'var(--bg-surface-2)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', color: 'var(--text-secondary)', fontSize: '13px', fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                        <Download size={14} /> Export
                    </button>
                </div>
            </div>

            {/* ── OVERVIEW ── */}
            <>
                    {/* Period pills + 2x2 KPI grid */}
                    <div>
                        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                            {(['month', 'quarter', 'year'] as const).map(p => (
                                <button key={p} type="button" onClick={() => handleSetPeriod(p)}
                                    style={{ padding: '6px 14px', borderRadius: '999px', border: `1px solid ${period === p ? 'var(--accent)' : 'var(--border-subtle)'}`, background: period === p ? 'var(--accent)' : 'var(--bg-surface-1)', color: period === p ? 'white' : 'var(--text-muted)', fontSize: '13px', fontWeight: period === p ? 600 : 400, cursor: 'pointer', fontFamily: 'var(--font-body)', transition: 'all var(--transition-fast)', textTransform: 'capitalize' }}>
                                    {p}
                                </button>
                            ))}
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                            {[
                                { label: 'Total Spent', value: fmt(periodStats.totalSpent), sub: periodStats.periodLabel, color: 'var(--color-exp)' },
                                { label: 'Daily Average', value: fmt(periodStats.dailyAvg), sub: period === 'month' ? 'this month' : period === 'quarter' ? 'this quarter' : 'this year', color: 'var(--color-warn)' },
                                { label: periodStats.vsLabel, value: periodStats.vsLast !== null ? `${periodStats.vsLast > 0 ? '+' : ''}${periodStats.vsLast}%` : '—', sub: 'expenses', color: periodStats.vsLast !== null && periodStats.vsLast > 0 ? 'var(--color-exp)' : 'var(--color-inc)' },
                                { label: 'Savings Rate', value: `${periodStats.savingsRate}%`, sub: 'of income saved', color: 'var(--accent)' },
                            ].map(kpi => (
                                <GCard key={kpi.label}>
                                    <p style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 6px', fontFamily: 'var(--font-body)' }}>{kpi.label}</p>
                                    <p style={{ fontFamily: 'var(--font-mono)', fontSize: '1.3rem', fontWeight: 700, color: kpi.color, margin: '0 0 2px', fontVariantNumeric: 'tabular-nums', animation: 'numberReveal 350ms cubic-bezier(0.22,1,0.36,1) both' }}>{kpi.value}</p>
                                    <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)' }}>{kpi.sub}</p>
                                </GCard>
                            ))}
                        </div>
                    </div>

                    {/* Income vs Expenses area chart */}
                    <div style={sectionCard}>
                        <SectionHead title="Income vs Expenses" />
                        {dataLoading ? <SkeletonCard height={200} /> : areaData.length === 0 ? (
                            <p style={{ fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center', padding: '40px 0' }}>No trend data yet. Add transactions to see the chart.</p>
                        ) : (
                            <ResponsiveContainer width="100%" height={220}>
                                <AreaChart data={areaData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                                    <defs>
                                        <linearGradient id="incGrad" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor={cc.inc} stopOpacity={0.25} />
                                            <stop offset="95%" stopColor={cc.inc} stopOpacity={0} />
                                        </linearGradient>
                                        <linearGradient id="expGrad" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor={cc.exp} stopOpacity={0.20} />
                                            <stop offset="95%" stopColor={cc.exp} stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid horizontal vertical={false} stroke={cc.border} strokeWidth={1} />
                                    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: cc.faint, fontSize: 11, fontFamily: 'DM Mono, monospace' }} />
                                    <YAxis hide />
                                    <Tooltip content={<ChartTooltip />} />
                                    <Area type="monotone" dataKey="income" name="Income" stroke={cc.inc} strokeWidth={2} fill="url(#incGrad)" dot={false} />
                                    <Area type="monotone" dataKey="expenses" name="Expenses" stroke={cc.exp} strokeWidth={2} fill="url(#expGrad)" dot={false} />
                                </AreaChart>
                            </ResponsiveContainer>
                        )}
                        {!dataLoading && areaData.length > 0 && (
                            <div style={{ display: 'flex', gap: '16px', marginTop: '10px' }}>
                                {[{ label: 'Income', color: cc.inc }, { label: 'Expenses', color: cc.exp }].map(l => (
                                    <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <div style={{ width: 20, height: 2, background: l.color, borderRadius: 1 }} />
                                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>{l.label}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Savings Rate Sparkline */}
                    {!dataLoading && savingsRateData.length >= 2 && (
                        <div style={sectionCard}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                                <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Monthly Savings Rate</h2>
                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '18px', fontWeight: 700, color: savingsRate >= 0 ? 'var(--color-inc)' : 'var(--color-exp)', fontVariantNumeric: 'tabular-nums' }}>{savingsRate}%</span>
                            </div>
                            <ResponsiveContainer width="100%" height={120}>
                                <LineChart data={savingsRateData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                                    <CartesianGrid horizontal vertical={false} stroke={cc.border} strokeWidth={1} />
                                    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: cc.faint, fontSize: 10, fontFamily: 'DM Mono, monospace' }} />
                                    <YAxis hide domain={['auto', 'auto']} />
                                    <Tooltip formatter={(v: any) => [`${v}%`, 'Savings rate']} contentStyle={{ background: 'var(--bg-surface-1)', border: '1px solid var(--border-subtle)', borderRadius: 8, fontSize: 12 }} />
                                    <Line type="monotone" dataKey="rate" name="Savings rate" stroke={cc.inc} strokeWidth={2} dot={{ r: 3, fill: cc.inc }} />
                                </LineChart>
                            </ResponsiveContainer>
                            <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '8px 0 0', fontFamily: 'var(--font-body)' }}>% of income saved after expenses, month by month</p>
                        </div>
                    )}

                    {/* Bank Balances */}
                    {(accountsLoading || accounts.length > 0) && (
                        <div style={sectionCard}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
                                <div>
                                    <p style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>Bank Balances</p>
                                    <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>Live balances across all accounts</p>
                                </div>
                                {!accountsLoading && (
                                    <div style={{ textAlign: 'right' }}>
                                        <p style={{ margin: '0 0 2px', fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>Total Balance</p>
                                        <p style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: totalBalance >= 0 ? 'var(--color-inc)' : 'var(--color-exp)', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>
                                            {fmt(totalBalance)}
                                        </p>
                                    </div>
                                )}
                            </div>
                            <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '4px', scrollbarWidth: 'none' } as React.CSSProperties}>
                                {accountsLoading
                                    ? [1, 2, 3].map(i => <div key={i} style={{ minWidth: '160px', height: '130px', background: 'var(--bg-surface-3)', borderRadius: 'var(--radius-md)', flexShrink: 0, opacity: 0.5 }} />)
                                    : accounts.map((a: any) => {
                                        const bal = parseFloat(a.current_balance ?? 0);
                                        const net = bal - parseFloat(a.starting_balance ?? 0);
                                        return (
                                            <div key={a.id} style={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border-subtle)', borderLeft: `3px solid ${a.color || 'var(--accent)'}`, borderRadius: 'var(--radius-md)', padding: '14px', minWidth: '160px', flexShrink: 0 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
                                                    <span style={{ fontSize: '15px' }}>{a.icon || '🏦'}</span>
                                                    <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'var(--font-display)' }}>{a.name}</span>
                                                    {a.is_default && <Badge style={{ marginLeft: 'auto', flexShrink: 0 }}>default</Badge>}
                                                </div>
                                                <p style={{ margin: '0 0 2px', fontSize: '18px', fontWeight: 700, color: bal >= 0 ? 'var(--color-inc)' : 'var(--color-exp)', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>{fmt(bal)}</p>
                                                <p style={{ margin: '0 0 4px', fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>Started {fmt(parseFloat(a.starting_balance ?? 0))}</p>
                                                <p style={{ margin: 0, fontSize: '11px', color: net >= 0 ? 'var(--color-inc)' : 'var(--color-exp)', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>{net >= 0 ? '▲ +' : '▼ '}{fmt(Math.abs(net))} net</p>
                                            </div>
                                        );
                                    })
                                }
                            </div>
                            {!accountsLoading && (
                                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
                                    <button type="button" onClick={() => router.push('/accounts')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', color: 'var(--accent)', fontWeight: 600, fontFamily: 'var(--font-body)', padding: 0 }}>Manage accounts →</button>
                                </div>
                            )}
                        </div>
                    )}
            </>

            {/* ── SPENDING ── */}
            <>
                    {/* Spending Breakdown — Pie + list */}
                    <div style={sectionCard}>
                        <SectionHead title={`Spending — ${FULL_MONTHS[currentMonth]}`} />
                        {dataLoading ? <SkeletonCard height={150} /> : categories.length === 0 ? (
                            <p style={{ fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center', padding: '32px 0' }}>No expenses this month.</p>
                        ) : (
                            <div style={{ display: 'flex', gap: isMobile ? '12px' : '24px', alignItems: 'center', flexDirection: isMobile ? 'column' : 'row' }}>
                                <div style={{ flexShrink: 0 }}>
                                    <ResponsiveContainer width={120} height={120}>
                                        <PieChart>
                                            <Pie data={categories} dataKey="total" nameKey="name" innerRadius={36} outerRadius={54} paddingAngle={2} startAngle={90} endAngle={-270}>
                                                {categories.map((cat: any) => (
                                                    <Cell key={cat.name} fill={cat.color || cc.exp} />
                                                ))}
                                            </Pie>
                                            <Tooltip content={<ChartTooltip />} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>
                                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    {categories.slice(0, 6).map((cat: any) => {
                                        const amt = parseFloat(cat.total ?? 0);
                                        const pct = totalExpenses > 0 ? Math.round((amt / totalExpenses) * 100) : 0;
                                        return (
                                            <div key={cat.name} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <div style={{ width: 8, height: 8, borderRadius: '50%', background: cat.color || cc.exp, flexShrink: 0 }} />
                                                <span style={{ flex: 1, fontSize: '13px', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'var(--font-body)' }}>{cat.name}</span>
                                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{fmt(amt)}</span>
                                                <Badge color="var(--text-muted)" bg="var(--bg-surface-3)">{pct}%</Badge>
                                            </div>
                                        );
                                    })}
                                    <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '10px', display: 'flex', justifyContent: 'space-between' }}>
                                        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}>Total</span>
                                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 700, color: 'var(--color-exp)', fontVariantNumeric: 'tabular-nums' }}>{fmt(totalExpenses)}</span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Day-of-Week Spending Heatmap */}
                    <div style={sectionCard}>
                        <SectionHead title="Spending by Day of Week" />
                        {dataLoading ? <SkeletonCard height={120} /> : (() => {
                            // Mon-first order: indices 1,2,3,4,5,6,0
                            const monFirst = [1,2,3,4,5,6,0].map(i => weeklyData[i]);
                            const peakDay  = monFirst.reduce((a, b) => b.amount > a.amount ? b : a, monFirst[0]);
                            const troughDay = monFirst.filter(d => d.amount > 0).reduce((a, b) => b.amount < a.amount ? b : a, peakDay);
                            const ratio = troughDay && troughDay.amount > 0 ? (peakDay.amount / troughDay.amount) : 0;
                            return (
                                <>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '6px', marginBottom: '10px' }}>
                                        {monFirst.map((d) => {
                                            const pct = maxWeeklyAmt > 0 ? d.amount / maxWeeklyAmt : 0;
                                            const isPeak = d.amount === maxWeeklyAmt && d.amount > 0;
                                            const intensity = Math.round(pct * 55) + (d.amount > 0 ? 8 : 0);
                                            return (
                                                <div key={d.day} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                                                    <span style={{ fontSize: '10px', color: isPeak ? cc.exp : 'var(--text-muted)', fontFamily: 'var(--font-body)', fontWeight: isPeak ? 700 : 400 }}>{d.day}</span>
                                                    <div style={{ width: '100%', aspectRatio: '1', borderRadius: 'var(--radius-sm)', background: d.amount > 0 ? `color-mix(in srgb, ${cc.exp} ${intensity}%, var(--bg-surface-2))` : 'var(--bg-surface-2)', border: isPeak ? `1.5px solid color-mix(in srgb, ${cc.exp} 40%, transparent)` : '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 0.3s ease' }} />
                                                    <span style={{ fontSize: '9px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', textAlign: 'center', lineHeight: 1.2 }}>
                                                        {d.amount > 0 ? (d.amount >= 1000 ? `${Math.round(d.amount/1000)}k` : Math.round(d.amount)) : '—'}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    {peakDay.amount > 0 && (
                                        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0, fontFamily: 'var(--font-body)' }}>
                                            {ratio >= 1.5
                                                ? <><span style={{ color: cc.exp, fontWeight: 600 }}>{peakDay.day}s</span> are your biggest spend days — {fmt(peakDay.amount)} this month{ratio >= 2 ? `, ${ratio.toFixed(1)}× more than ${troughDay.day}s` : ''}</>
                                                : <>Spending is spread fairly evenly — peak on <span style={{ color: cc.exp, fontWeight: 600 }}>{peakDay.day}s</span> at {fmt(peakDay.amount)}</>
                                            }
                                        </p>
                                    )}
                                </>
                            );
                        })()}
                    </div>

                    {/* Payment Methods */}
                    {paymentMethods.length > 0 && (
                        <div style={sectionCard}>
                            <SectionHead title={`Payment Methods — ${FULL_MONTHS[currentMonth]}`} />
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {paymentMethods.map((pm: any) => {
                                    const METHOD_COLORS: Record<string, string> = { 'UPI': 'var(--color-inc)', 'Credit Card': 'var(--color-exp)', 'Debit Card': 'var(--accent)', 'Net Banking': 'var(--accent)', 'Wallet': 'var(--color-warn)', 'Cash': 'var(--text-muted)' };
                                    const color = METHOD_COLORS[pm.method] || 'var(--text-muted)';
                                    return (
                                        <div key={pm.method}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
                                                    <span style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 500, fontFamily: 'var(--font-body)' }}>{pm.method}</span>
                                                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>{pm.count} txn{pm.count !== 1 ? 's' : ''}</span>
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                    <Badge color="var(--text-muted)" bg="var(--bg-surface-3)">{pm.percent}%</Badge>
                                                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 600, color: 'var(--color-exp)', minWidth: '80px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmt(pm.total)}</span>
                                                </div>
                                            </div>
                                            <div style={{ height: '5px', background: 'var(--border-subtle)', borderRadius: '3px', overflow: 'hidden' }}>
                                                <div style={{ height: '100%', width: `${pm.percent}%`, background: color, borderRadius: '3px', transition: 'width 0.5s ease' }} />
                                            </div>
                                        </div>
                                    );
                                })}
                                <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '10px', display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}>Total</span>
                                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 700, color: 'var(--color-exp)', fontVariantNumeric: 'tabular-nums' }}>{fmt(paymentTotal)}</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Merchant Breakdown */}
                    {!dataLoading && merchantData.length > 0 && (
                        <div style={sectionCard}>
                            <SectionHead title={`Top Merchants — ${FULL_MONTHS[currentMonth]}`} />
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {merchantData.map((m, i) => (
                                    <div key={m.name}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                                                <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', minWidth: 18 }}>{i + 1}</span>
                                                <span style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 500, fontFamily: 'var(--font-body)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</span>
                                                <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-body)', flexShrink: 0 }}>{m.count}×</span>
                                            </div>
                                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 600, color: 'var(--color-exp)', flexShrink: 0, marginLeft: 8, fontVariantNumeric: 'tabular-nums' }}>{fmt(m.total)}</span>
                                        </div>
                                        <div style={{ height: 4, background: 'var(--border-subtle)', borderRadius: 2, overflow: 'hidden' }}>
                                            <div style={{ height: '100%', width: `${(m.total / maxMerchantTotal) * 100}%`, background: 'var(--color-exp)', borderRadius: 2, transition: 'width 0.5s ease' }} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Category Trajectory (collapsible) */}
                    <div style={sectionCard}>
                        <button type="button" onClick={() => setShowTrajectory(v => !v)}
                            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left' }}>
                            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                                Category Trajectory
                            </h2>
                            {showTrajectory ? <ChevronDown size={16} color="var(--text-muted)" /> : <ChevronRight size={16} color="var(--text-muted)" />}
                        </button>
                        {!showTrajectory && <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '6px 0 0', fontFamily: 'var(--font-body)' }}>6-month sparklines per category — green = improving, red = rising</p>}
                        {showTrajectory && (
                            <div style={{ marginTop: 16 }}>
                                {dataLoading ? <div style={{ height: 200, background: 'var(--bg-surface-2)', borderRadius: 8 }} /> : <CategoryTrajectory transactions={allTransactions} isMobile={isMobile} />}
                            </div>
                        )}
                    </div>

                    {/* Spending Heatmap (collapsible) */}
                    <div style={sectionCard}>
                        <button type="button" onClick={() => setShowHeatmap(v => !v)}
                            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left' }}>
                            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                                Spending Intensity — Last 12 Months
                            </h2>
                            {showHeatmap ? <ChevronDown size={16} color="var(--text-muted)" /> : <ChevronRight size={16} color="var(--text-muted)" />}
                        </button>
                        {!showHeatmap && <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '6px 0 0', fontFamily: 'var(--font-body)' }}>GitHub-style calendar showing daily spending intensity</p>}
                        {showHeatmap && (
                            <div style={{ marginTop: 16 }}>
                                {dataLoading ? <div style={{ height: 100, background: 'var(--bg-surface-2)', borderRadius: 8 }} /> : <SpendingHeatmap transactions={yearTransactions} />}
                            </div>
                        )}
                    </div>
            </>

            {/* ── INCOME ── */}
            <>
                    {/* Income KPIs */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                        {[
                            { label: 'Total Income', value: fmt(summary?.total_income ?? 0), sub: FULL_MONTHS[currentMonth], color: 'var(--color-inc)' },
                            { label: 'vs Last Month', value: incVsLastMonth !== null ? `${incVsLastMonth > 0 ? '+' : ''}${incVsLastMonth}%` : '—', sub: 'income', color: incVsLastMonth !== null && incVsLastMonth >= 0 ? 'var(--color-inc)' : 'var(--color-exp)' },
                        ].map(kpi => (
                            <GCard key={kpi.label}>
                                <p style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 6px', fontFamily: 'var(--font-body)' }}>{kpi.label}</p>
                                <p style={{ fontFamily: 'var(--font-mono)', fontSize: '1.3rem', fontWeight: 700, color: kpi.color, margin: '0 0 2px', fontVariantNumeric: 'tabular-nums', animation: 'numberReveal 350ms cubic-bezier(0.22,1,0.36,1) both' }}>{kpi.value}</p>
                                <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)' }}>{kpi.sub}</p>
                            </GCard>
                        ))}
                    </div>

                    {/* Income trend chart */}
                    <div style={sectionCard}>
                        <SectionHead title="Income Trend" />
                        {dataLoading ? <SkeletonCard height={180} /> : incomeAreaData.length === 0 ? (
                            <p style={{ fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center', padding: '40px 0' }}>No income data yet.</p>
                        ) : (
                            <ResponsiveContainer width="100%" height={180}>
                                <AreaChart data={incomeAreaData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                                    <defs>
                                        <linearGradient id="incTrendGrad" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor={cc.inc} stopOpacity={0.25} />
                                            <stop offset="95%" stopColor={cc.inc} stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid horizontal vertical={false} stroke={cc.border} strokeWidth={1} />
                                    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: cc.faint, fontSize: 11, fontFamily: 'DM Mono, monospace' }} />
                                    <YAxis hide />
                                    <Tooltip content={<ChartTooltip />} />
                                    <Area type="monotone" dataKey="income" name="Income" stroke={cc.inc} strokeWidth={2} fill="url(#incTrendGrad)" dot={false} />
                                </AreaChart>
                            </ResponsiveContainer>
                        )}
                    </div>

                    {/* Year over Year */}
                    {yearlyData && (
                        <div style={sectionCard}>
                            <SectionHead title={`Year-over-Year — ${yearlyData.years?.current} vs ${yearlyData.years?.last}`} />
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px' }}>
                                {[
                                    { label: `${yearlyData.years?.current} Income`, curr: getYearlyTotal(yearlyData.years?.current, 'income'), last: getYearlyTotal(yearlyData.years?.last, 'income'), color: 'var(--color-inc)' },
                                    { label: `${yearlyData.years?.current} Expenses`, curr: getYearlyTotal(yearlyData.years?.current, 'expense'), last: getYearlyTotal(yearlyData.years?.last, 'expense'), color: 'var(--color-exp)' },
                                    { label: `${yearlyData.years?.current} Savings`, curr: getYearlyTotal(yearlyData.years?.current, 'income') - getYearlyTotal(yearlyData.years?.current, 'expense'), last: getYearlyTotal(yearlyData.years?.last, 'income') - getYearlyTotal(yearlyData.years?.last, 'expense'), color: 'var(--accent)' },
                                ].map(card => {
                                    const change = pctChange(card.curr, card.last);
                                    const isUp = change !== null && parseFloat(change) >= 0;
                                    return (
                                        <div key={card.label} style={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '14px' }}>
                                            <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '0 0 6px', fontFamily: 'var(--font-body)' }}>{card.label}</p>
                                            <p style={{ fontFamily: 'var(--font-mono)', fontSize: '1.1rem', fontWeight: 700, color: card.color, margin: '0 0 6px', fontVariantNumeric: 'tabular-nums' }}>{fmt(card.curr)}</p>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '4px' }}>
                                                <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>{yearlyData.years?.last}: {fmt(card.last)}</span>
                                                {change && <Badge color={isUp ? 'var(--color-inc)' : 'var(--color-exp)'} bg={isUp ? 'color-mix(in srgb, var(--color-inc) 10%, transparent)' : 'color-mix(in srgb, var(--color-exp) 10%, transparent)'}>{isUp ? '↑' : '↓'}{Math.abs(parseFloat(change))}%</Badge>}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* AI Salary Allocation */}
                    <div style={{ ...sectionCard, overflow: 'hidden' }}>
                        {!planGenerated && !allocationLoading && (
                            <div style={{ textAlign: 'center', padding: '16px 0' }}>
                                <Wallet size={40} color="var(--accent)" style={{ margin: '0 auto 12px' }} />
                                <p style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 8px', fontFamily: 'var(--font-display)' }}>Salary Allocation Plan</p>
                                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', maxWidth: '400px', margin: '0 auto 20px', lineHeight: 1.6, fontFamily: 'var(--font-body)' }}>
                                    Get an AI-recommended 50/30/20 budget split based on your income and spending history.
                                </p>
                                <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '20px' }}>
                                    {['50/30/20 Rule', 'Goal-Based', 'Indian Context'].map(pill => (
                                        <span key={pill} style={{ background: 'var(--bg-surface-3)', border: '1px solid var(--border-subtle)', borderRadius: '20px', padding: '4px 12px', fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>{pill}</span>
                                    ))}
                                </div>
                                {allocationError && <p style={{ color: 'var(--color-exp)', fontSize: '13px', marginBottom: '12px', fontFamily: 'var(--font-body)' }}>{allocationError}</p>}
                                <Button onClick={() => handleGeneratePlan()} variant="primary" size="md">
                                    <Sparkles size={16} />Generate My Plan
                                </Button>
                            </div>
                        )}

                        {allocationLoading && (
                            <div style={{ padding: '40px 0', textAlign: 'center' }}>
                                <div style={{ width: '28px', height: '28px', borderRadius: '50%', border: '3px solid var(--border-subtle)', borderTop: `3px solid var(--accent)`, animation: 'spin 0.8s linear infinite', margin: '0 auto' }} />
                                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '14px', fontFamily: 'var(--font-body)' }}>Analysing your spending patterns…</p>
                            </div>
                        )}

                        {planGenerated && allocationPlan && !allocationLoading && (
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
                                    <div>
                                        <p style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>Salary Allocation Plan</p>
                                        <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-secondary)', maxWidth: '480px', fontFamily: 'var(--font-body)' }}>{allocationPlan.summary}</p>
                                        {allocationPlan.from_cache && (
                                            <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px', fontFamily: 'var(--font-body)' }}>
                                                Cached · updates every 6h
                                                <button type="button" onClick={() => handleGeneratePlan(true)} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: '11px', padding: 0, marginLeft: '4px', fontFamily: 'var(--font-body)' }}>Refresh now</button>
                                            </span>
                                        )}
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <p style={{ margin: '0 0 4px', fontSize: '20px', fontWeight: 700, color: 'var(--color-inc)', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>{fmt(allocationPlan.salary)}</p>
                                        <p style={{ margin: '0 0 8px', fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>monthly salary</p>
                                        <Button onClick={() => handleGeneratePlan(true)} variant="secondary" size="sm"><RefreshCw size={12} />Regenerate</Button>
                                    </div>
                                </div>

                                {allocationPlan.month_comparison && (
                                    <GCard style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginBottom: '14px' }}>
                                        <span style={{ fontSize: '13px', color: allocationPlan.month_comparison.trend === 'improving' ? 'var(--color-inc)' : allocationPlan.month_comparison.trend === 'worsening' ? 'var(--color-exp)' : 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>
                                            {allocationPlan.month_comparison.trend === 'improving' ? '▲ Spending improved vs last month' : allocationPlan.month_comparison.trend === 'worsening' ? '▼ Spending increased vs last month' : '→ Spending stable vs last month'}
                                        </span>
                                        <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>
                                            Biggest change: {allocationPlan.month_comparison.biggest_change_category} {allocationPlan.month_comparison.biggest_change_amount >= 0 ? '+' : ''}{fmt(Math.abs(allocationPlan.month_comparison.biggest_change_amount))}
                                        </span>
                                    </GCard>
                                )}

                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '12px', marginBottom: '16px' }}>
                                    {allocationPlan.allocation?.map((bucket: any) => (
                                        <div key={bucket.bucket} style={{ background: 'var(--bg-surface-2)', border: '1px solid var(--border-subtle)', borderLeft: `4px solid ${bucket.color}`, borderRadius: 'var(--radius-md)', padding: '16px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                                <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>{bucket.bucket}</span>
                                                <Badge color={bucket.color} bg={hexToRgba(bucket.color, 0.12)}>{bucket.percentage}%</Badge>
                                            </div>
                                            <p style={{ margin: '0 0 4px', fontSize: '20px', fontWeight: 700, color: bucket.color, fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>{fmt(bucket.amount)}</p>
                                            <p style={{ margin: '0 0 10px', fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>{bucket.description}</p>
                                            <div style={{ height: '4px', borderRadius: '2px', background: 'var(--border-subtle)', marginBottom: '10px' }}>
                                                <div style={{ height: '100%', width: `${bucket.percentage}%`, background: bucket.color, borderRadius: '2px' }} />
                                            </div>
                                            {bucket.categories?.map((cat: any, ci: number) => (
                                                <div key={cat.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: ci < bucket.categories.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
                                                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>{cat.name}</span>
                                                    <div style={{ textAlign: 'right' }}>
                                                        <p style={{ margin: 0, fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}>
                                                            {cat.recommended_amount > cat.last_month_actual ? <span style={{ color: 'var(--color-inc)', fontSize: '10px' }}>▲ </span> : cat.recommended_amount < cat.last_month_actual ? <span style={{ color: 'var(--color-exp)', fontSize: '10px' }}>▼ </span> : null}
                                                            {fmt(cat.recommended_amount)}
                                                        </p>
                                                        <p style={{ margin: 0, fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-body)', fontVariantNumeric: 'tabular-nums' }}>actual: {fmt(cat.last_month_actual)}</p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ))}
                                </div>

                                {allocationPlan.insights?.length > 0 && (
                                    <div>
                                        <p style={{ margin: '0 0 10px', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>Insights</p>
                                        {allocationPlan.insights.map((insight: string, i: number) => (
                                            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '10px 14px', background: 'var(--bg-surface-2)', borderRadius: 'var(--radius-md)', marginBottom: '8px' }}>
                                                <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: 'var(--accent-subtle)', color: 'var(--accent)', fontSize: '11px', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i + 1}</div>
                                                <span style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5, fontFamily: 'var(--font-body)' }}>{insight}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
            </>

            {/* ── TRENDS ── */}
            <>
                    {/* Money Flow Sankey (collapsible) */}
                    <div style={sectionCard}>
                        <button type="button" onClick={() => setShowSankey(v => !v)}
                            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left' }}>
                            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                                Where Your Money Flows
                            </h2>
                            {showSankey ? <ChevronDown size={16} color="var(--text-muted)" /> : <ChevronRight size={16} color="var(--text-muted)" />}
                        </button>
                        {!showSankey && <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '6px 0 0', fontFamily: 'var(--font-body)' }}>Income sources → spending categories (last 3 months)</p>}
                        {showSankey && (
                            <div style={{ marginTop: 16 }}>
                                {dataLoading ? <div style={{ height: 200, background: 'var(--bg-surface-2)', borderRadius: 8 }} /> : <SankeyFlow transactions={allTransactions} />}
                            </div>
                        )}
                    </div>

                    {/* Regret Score */}
                    <div style={sectionCard}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
                            <div>
                                <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 3px' }}>🤦 Regret Score</h2>
                                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0, fontFamily: 'var(--font-body)' }}>Mark transactions as regretted using 🤦 in your transaction list</p>
                            </div>
                            <button type="button"
                                onClick={async () => { setRegretLoading(true); try { const res = await aiAPI.regretPatterns(); setRegretData(res.data); } catch { toast.error('Failed to analyse regrets — try again'); } finally { setRegretLoading(false); } }}
                                disabled={regretLoading}
                                style={{ padding: '8px 16px', background: 'color-mix(in srgb, var(--color-exp) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--color-exp) 20%, transparent)', borderRadius: 'var(--radius-md)', color: 'var(--color-exp)', fontSize: '13px', fontWeight: 600, cursor: regretLoading ? 'wait' : 'pointer', opacity: regretLoading ? 0.7 : 1, fontFamily: 'var(--font-body)' }}>
                                {regretLoading ? 'Analysing…' : regretData ? 'Refresh' : 'Analyse Regrets'}
                            </button>
                        </div>

                        {!regretData && !regretLoading && (
                            <p style={{ fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center', padding: '16px 0', fontFamily: 'var(--font-body)' }}>Click "Analyse Regrets" to see AI patterns in your regretted purchases.</p>
                        )}

                        {regretData && (
                            <>
                                {regretData.count === 0 ? (
                                    <p style={{ fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center', padding: '20px 0', fontFamily: 'var(--font-body)' }}>No regretted transactions yet.</p>
                                ) : (
                                    <>
                                        <div style={{ display: 'flex', gap: '10px', marginBottom: '14px', flexWrap: 'wrap' }}>
                                            {[
                                                { label: 'Regretted', value: `${regretData.count} transactions` },
                                                ...(regretData.total > 0 ? [{ label: 'Total Regret Value', value: fmt(regretData.total) }] : []),
                                            ].map(s => (
                                                <GCard key={s.label}>
                                                    <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '0 0 4px', fontFamily: 'var(--font-body)' }}>{s.label}</p>
                                                    <p style={{ fontFamily: 'var(--font-mono)', fontSize: '1rem', fontWeight: 700, color: 'var(--color-exp)', margin: 0, fontVariantNumeric: 'tabular-nums' }}>{s.value}</p>
                                                </GCard>
                                            ))}
                                        </div>
                                        {regretData.insight && (
                                            <div style={{ padding: '12px 16px', background: 'color-mix(in srgb, var(--color-exp) 6%, var(--bg-surface-1))', border: '1px solid color-mix(in srgb, var(--color-exp) 15%, transparent)', borderRadius: 'var(--radius-md)', marginBottom: '12px', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6, fontFamily: 'var(--font-body)' }}>
                                                {regretData.insight}
                                            </div>
                                        )}
                                        {regretData.patterns?.length > 0 && (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                {regretData.patterns.map((p: any, i: number) => (
                                                    <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '12px 14px', background: 'var(--bg-surface-2)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)' }}>
                                                        <span style={{ fontSize: '16px', flexShrink: 0 }}>⚠️</span>
                                                        <div style={{ flex: 1 }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px', flexWrap: 'wrap' }}>
                                                                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>{p.pattern}</span>
                                                                <Badge color="var(--color-exp)" bg="color-mix(in srgb, var(--color-exp) 8%, transparent)">{p.count}× · {fmt(p.total_amount)}</Badge>
                                                            </div>
                                                            <p style={{ fontSize: '12px', color: 'var(--color-inc)', margin: 0, fontFamily: 'var(--font-body)' }}>💡 {p.tip}</p>
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

                    {/* Purchase Regret Analysis (collapsible) */}
                    <div style={sectionCard}>
                        <button type="button" onClick={() => setShowRegretAnalysis(v => !v)}
                            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left' }}>
                            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                                😬 Purchase Regret Analysis
                            </h2>
                            {showRegretAnalysis ? <ChevronDown size={16} color="var(--text-muted)" /> : <ChevronRight size={16} color="var(--text-muted)" />}
                        </button>
                        {!showRegretAnalysis && (
                            <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '6px 0 0', fontFamily: 'var(--font-body)' }}>
                                Regret rate, by-category breakdown, amount brackets, and mindful score
                            </p>
                        )}
                        {showRegretAnalysis && (
                            <div style={{ marginTop: 16 }}>
                                {dataLoading
                                    ? <div style={{ height: 120, background: 'var(--bg-surface-2)', borderRadius: 8 }} />
                                    : <RegretAnalysis transactions={allTransactions} />
                                }
                            </div>
                        )}
                    </div>
            </>
        </>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// INSIGHTS TAB (formerly /insights)
// ═══════════════════════════════════════════════════════════════════════════
const GROUP_ICONS: Record<string, any> = {
    food_dining: Utensils,
    housing_rent: Home,
    transport: Car,
    entertainment_subscriptions: Tv,
    shopping_clothing: ShoppingBag,
    health_wellness: HeartPulse,
    education: GraduationCap,
    savings_investments: PiggyBank,
};

const PATTERN_LABELS: Record<string, string> = {
    budget_anchoring: 'Budget Anchoring',
    present_bias: 'Present Bias (Early-Month Spending)',
    subscription_bloat: 'Subscription Bloat',
    category_regret_concentration: 'Regret Concentration',
    idle_savings_despite_debt: 'Idle Savings Despite Debt',
};

const INCOME_BRACKET_LABELS: Record<string, string> = {
    under_5L: 'Under ₹5L/year',
    five_to_10L: '₹5L–10L/year',
    ten_to_20L: '₹10L–20L/year',
    above_20L: 'Above ₹20L/year',
};

function statusBadge(status: string, isSavings: boolean) {
    if (status === 'below_benchmark') {
        return isSavings
            ? { label: 'Below', color: 'var(--color-exp)', bg: 'color-mix(in srgb, var(--color-exp) 10%, transparent)' }
            : { label: 'Below', color: 'var(--color-inc)', bg: 'color-mix(in srgb, var(--color-inc) 10%, transparent)' };
    }
    if (status === 'above_benchmark') {
        return isSavings
            ? { label: 'Above', color: 'var(--color-inc)', bg: 'color-mix(in srgb, var(--color-inc) 10%, transparent)' }
            : { label: 'Above', color: 'var(--color-warn)', bg: 'color-mix(in srgb, var(--color-warn) 10%, transparent)' };
    }
    return { label: 'Within', color: 'var(--color-info)', bg: 'color-mix(in srgb, var(--color-info) 10%, transparent)' };
}

// ── Benchmark range bar with user position marker ───────────────────────────
function BenchmarkBar({ userPct, min, max }: { userPct: number; min: number; max: number }) {
    const scaleMax = Math.max(max * 1.4, userPct * 1.15, 10);
    const minPos = (min / scaleMax) * 100;
    const maxPos = (max / scaleMax) * 100;
    const userPos = Math.min(100, (userPct / scaleMax) * 100);

    return (
        <div style={{ position: 'relative', height: '8px', background: 'var(--bg-surface-2)', borderRadius: '999px', marginTop: '6px' }}>
            <div style={{
                position: 'absolute', top: 0, bottom: 0,
                left: `${minPos}%`, width: `${Math.max(maxPos - minPos, 1)}%`,
                background: 'var(--accent-subtle)', border: '1px solid var(--accent-border)', borderRadius: '999px',
            }} />
            <div style={{
                position: 'absolute', top: '-3px', left: `calc(${userPos}% - 2px)`,
                width: '4px', height: '14px', borderRadius: '2px', background: 'var(--accent)',
            }} />
        </div>
    );
}

function InsightsTab() {
    const { user } = useAuthStore();
    const [tab, setTab] = useState<'benchmarks' | 'behavioral'>('benchmarks');

    const [benchmarks, setBenchmarks] = useState<any>(null);
    const [benchmarksLoading, setBenchmarksLoading] = useState(true);

    const [patterns, setPatterns] = useState<any>(null);
    const [patternsLoading, setPatternsLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    useEffect(() => {
        if (!user) return;
        insightsAPI.getPeerBenchmarks().then(res => setBenchmarks(res.data)).catch(() => {}).finally(() => setBenchmarksLoading(false));
        insightsAPI.getBehavioralPatterns().then(res => setPatterns(res.data)).catch(() => {}).finally(() => setPatternsLoading(false));
    }, [user]);

    const refreshPatterns = async () => {
        setRefreshing(true);
        try {
            const res = await insightsAPI.getBehavioralPatterns(true);
            setPatterns(res.data);
        } catch { toast.error('Failed to refresh patterns — try again'); } finally { setRefreshing(false); }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
                <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>
                    Insights
                </h1>
                <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)' }}>
                    How you compare to peers, and patterns in your spending behavior.
                </p>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: '6px', borderBottom: '1px solid var(--border-subtle)' }}>
                {[
                    { key: 'benchmarks', label: 'Peer Benchmarks' },
                    { key: 'behavioral', label: 'Behavioral Patterns' },
                ].map(t => (
                    <button
                        key={t.key}
                        type="button"
                        onClick={() => setTab(t.key as any)}
                        style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            padding: '10px 4px', marginRight: '16px',
                            fontSize: '13px', fontWeight: 600, fontFamily: 'var(--font-body)',
                            color: tab === t.key ? 'var(--accent)' : 'var(--text-muted)',
                            borderBottom: tab === t.key ? '2px solid var(--accent)' : '2px solid transparent',
                            marginBottom: '-1px',
                        }}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {/* ── TAB 1: PEER BENCHMARKS ── */}
            {tab === 'benchmarks' && (
                benchmarksLoading ? (
                    <SkeletonCard height={400} />
                ) : !benchmarks ? (
                    <p style={{ fontSize: '13px', color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>Could not load peer benchmarks.</p>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                        <div style={{ display: 'inline-flex', alignSelf: 'flex-start', alignItems: 'center', padding: '5px 14px', borderRadius: '20px', background: 'var(--accent-subtle)', border: '1px solid var(--accent-border)' }}>
                            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--accent)', fontFamily: 'var(--font-body)' }}>
                                Based on your income bracket: {INCOME_BRACKET_LABELS[benchmarks.income_bracket] || benchmarks.income_bracket}
                            </span>
                        </div>

                        <div style={{ background: 'var(--bg-surface-1)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: '14px 18px' }}>
                            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.6, fontFamily: 'var(--font-body)' }}>{benchmarks.summary}</p>
                        </div>

                        <div style={{ background: 'var(--bg-surface-1)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
                            {benchmarks.benchmark_groups.map((g: any, idx: number) => {
                                const Icon = GROUP_ICONS[g.group] || PiggyBank;
                                const badge = statusBadge(g.status, false);
                                return (
                                    <div key={g.group} style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 18px', borderBottom: idx < benchmarks.benchmark_groups.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
                                        <div style={{ width: 36, height: 36, borderRadius: 'var(--radius-sm)', background: 'var(--bg-surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                            <Icon size={16} color="var(--text-secondary)" />
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                                                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}>{g.label}</span>
                                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>{g.user_pct}%</span>
                                            </div>
                                            <BenchmarkBar userPct={g.user_pct} min={g.benchmark_min} max={g.benchmark_max} />
                                            <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>
                                                Benchmark: {g.benchmark_min}% – {g.benchmark_max}%
                                            </span>
                                        </div>
                                        <span style={{ fontSize: '11px', fontWeight: 700, color: badge.color, background: badge.bg, padding: '3px 10px', borderRadius: '20px', flexShrink: 0, fontFamily: 'var(--font-body)' }}>
                                            {badge.label}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Savings rate comparison */}
                        {benchmarks.savings_rate_comparison && (() => {
                            const s = benchmarks.savings_rate_comparison;
                            const badge = statusBadge(s.status, true);
                            return (
                                <div>
                                    <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 8px' }}>Savings Rate</h2>
                                    <div style={{ background: 'var(--bg-surface-1)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: '14px 18px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                                            <div style={{ width: 36, height: 36, borderRadius: 'var(--radius-sm)', background: 'var(--bg-surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                <PiggyBank size={16} color="var(--text-secondary)" />
                                            </div>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                                                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}>Your savings rate</span>
                                                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>{s.user_pct}%</span>
                                                </div>
                                                <BenchmarkBar userPct={s.user_pct} min={s.benchmark_min} max={s.benchmark_max} />
                                                <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>
                                                    Benchmark: {s.benchmark_min}% – {s.benchmark_max}%
                                                </span>
                                            </div>
                                            <span style={{ fontSize: '11px', fontWeight: 700, color: badge.color, background: badge.bg, padding: '3px 10px', borderRadius: '20px', flexShrink: 0, fontFamily: 'var(--font-body)' }}>
                                                {badge.label}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })()}
                    </div>
                )
            )}

            {/* ── TAB 2: BEHAVIORAL PATTERNS ── */}
            {tab === 'behavioral' && (
                patternsLoading ? (
                    <SkeletonCard height={400} />
                ) : !patterns ? (
                    <p style={{ fontSize: '13px', color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>Could not load behavioral patterns.</p>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                        {/* AI insight card */}
                        <div style={{ background: 'var(--accent-subtle)', border: '1.5px solid var(--accent-border)', borderRadius: 'var(--radius-xl)', padding: '18px 20px', display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
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

                        <div style={{ display: 'inline-flex', alignSelf: 'flex-start', alignItems: 'center', padding: '5px 14px', borderRadius: '20px', background: 'var(--bg-surface-2)', border: '1px solid var(--border-subtle)' }}>
                            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', fontFamily: 'var(--font-body)' }}>
                                {patterns.detected_count} of 5 patterns detected in your spending
                            </span>
                        </div>

                        <div style={{ background: 'var(--bg-surface-1)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
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
                                                <p style={{ fontSize: '12px', color: 'var(--color-warn)', margin: '0 0 4px', fontFamily: 'var(--font-body)' }}>
                                                    {patternContext(p)}
                                                </p>
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
                )
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
        case 'category_regret_concentration':
            return `${d.top_category_pct}% of your regretted purchases (${d.total_regretted} total) were in ${d.top_category}.`;
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

const reportsCardSt: React.CSSProperties = { background: 'var(--bg-surface-1)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: '18px 20px', marginBottom: '16px' };

function ReportsTab() {
    const isMobile = useIsMobile();
    const today = new Date().toISOString().split('T')[0];
    const firstOfMonth = `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}-01`;

    const [from, setFrom]                 = useState(firstOfMonth);
    const [to, setTo]                     = useState(today);
    const [data, setData]                 = useState<any>(null);
    const [loading, setLoading]           = useState(false);
    const [searched, setSearched]         = useState(false);
    const [activeTab, setActiveTab]       = useState<'range' | 'health'>('range');
    const [healthReport, setHealthReport] = useState<any>(null);
    const [healthLoading, setHealthLoading] = useState(false);

    const fetchReport = async () => {
        if (!from || !to) return;
        setLoading(true);
        try { const res = await analyticsAPI.report(from, to); setData(res.data); setSearched(true); }
        catch (err) { console.error(err); toast.error('Failed to generate report — try again'); }
        finally { setLoading(false); }
    };

    const totalExpenses = data?.categories?.reduce((s: number, c: any) => s + parseFloat(c.total), 0) || 0;

    const gradeColor = (grade: string) => {
        if (['A+','A'].includes(grade)) return 'var(--color-inc)';
        if (grade === 'B') return 'var(--accent)';
        if (grade === 'C') return 'var(--color-warn)';
        return 'var(--color-exp)';
    };

    const tabStyle = (active: boolean): React.CSSProperties => ({ padding: '8px 16px', borderRadius: 'var(--radius-md)', border: 'none', background: active ? 'var(--bg-surface-1)' : 'transparent', color: active ? 'var(--text-primary)' : 'var(--text-secondary)', fontSize: '13px', fontWeight: active ? 600 : 400, cursor: 'pointer', fontFamily: 'var(--font-body)', transition: 'all 0.15s' });

    return (
        <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

                {/* Header */}
                <div style={{ background: 'var(--bg-surface-1)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xl)', padding: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
                        <div>
                            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 3px' }}>Reports</h1>
                            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)' }}>Custom date range analytics</p>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            {activeTab === 'range' && data && (
                                <Button variant="secondary" size="md" onClick={() => void exportToCSV(data.transactions, `fintrack-report-${from}-to-${to}.csv`)}>
                                    <Download size={16} />Export CSV
                                </Button>
                            )}
                            {activeTab === 'health' && healthReport && (
                                <Button variant="secondary" size="md" onClick={() => window.print()}><Download size={16} />Print / Save PDF</Button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Tabs */}
                <div style={{ display: 'flex', gap: '4px', background: 'var(--bg-surface-2)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '4px', width: 'fit-content' }}>
                    {([{ key: 'range', label: '📊 Date Range Report' }, { key: 'health', label: '🏆 Health Report Card' }] as const).map(t => (
                        <button key={t.key} type="button" onClick={() => setActiveTab(t.key)} style={tabStyle(activeTab === t.key)}>{t.label}</button>
                    ))}
                </div>

                {activeTab === 'range' && (
                    <>
                        <div style={reportsCardSt}>
                            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 14px' }}>Select Date Range</h3>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
                                {QUICK_RANGES.map(range => (
                                    <button key={range.label} type="button" onClick={() => { const { from: f, to: t } = range.getDates(); setFrom(f); setTo(t); }}
                                        style={{ padding: '6px 14px', borderRadius: 'var(--radius-md)', background: 'var(--bg-surface-2)', border: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', fontSize: '12px', cursor: 'pointer', transition: 'all 0.15s', fontFamily: 'var(--font-body)' }}
                                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--accent-subtle)'; (e.currentTarget as HTMLElement).style.color = 'var(--accent)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent-border)'; }}
                                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-surface-2)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-secondary)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-subtle)'; }}>
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
                                    <div style={reportsCardSt}>
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

                                <div style={{ ...reportsCardSt, padding: 0 }}>
                                    <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
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
                                                <div key={tx.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', borderBottom: '1px solid var(--border-subtle)', gap: '12px', transition: 'background var(--transition-fast)' }}
                                                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-surface-3)'}
                                                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
                                                        <div style={{ width: '34px', height: '34px', borderRadius: '10px', background: isIncome ? 'color-mix(in srgb, var(--color-inc) 10%, transparent)' : 'color-mix(in srgb, var(--color-exp) 10%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                            {isIncome ? <TrendingUp size={14} color="var(--color-inc)" /> : <TrendingDown size={14} color="var(--color-exp)" />}
                                                        </div>
                                                        <div style={{ minWidth: 0 }}>
                                                            <p style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: 'var(--font-body)' }}>{tx.description}</p>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                                                                {tx.category_name && <span style={{ fontSize: '11px', color: tx.category_color || 'var(--text-muted)', background: `${tx.category_color || 'var(--bg-surface-2)'}20`, padding: '1px 6px', borderRadius: '4px', fontFamily: 'var(--font-body)' }}>{tx.category_name}</span>}
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
                            <div style={{ ...reportsCardSt, padding: '60px', textAlign: 'center' }}>
                                <FileText size={32} color="var(--text-muted)" style={{ marginBottom: '12px' }} />
                                <p style={{ color: 'var(--text-muted)', fontSize: '13px', margin: 0, fontFamily: 'var(--font-body)' }}>Select a date range and click Generate</p>
                            </div>
                        )}
                    </>
                )}

                {activeTab === 'health' && (
                    <>
                        {!healthReport && (
                            <div style={{ ...reportsCardSt, padding: '60px 40px', textAlign: 'center' }}>
                                <div style={{ fontSize: '3rem', marginBottom: '12px' }}>🏆</div>
                                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 8px' }}>Financial Health Report Card</h3>
                                <p style={{ color: 'var(--text-secondary)', fontSize: '13px', margin: '0 0 24px', maxWidth: '360px', marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.6, fontFamily: 'var(--font-body)' }}>AI analyses your current month's transactions, budgets, and goals to give you an overall financial health score.</p>
                                <Button onClick={async () => { setHealthLoading(true); try { const res = await aiAPI.healthReport(); setHealthReport(res.data); } catch (e) { console.error(e); toast.error('Failed to generate health report — try again'); } finally { setHealthLoading(false); } }} isLoading={healthLoading} size="md">
                                    <Sparkles size={15} />Generate Health Report
                                </Button>
                            </div>
                        )}

                        {healthReport && (
                            <div id="health-report-printable">
                                {/* Score hero */}
                                <div style={{ ...reportsCardSt, textAlign: 'center' }}>
                                    <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '80px', height: '80px', borderRadius: '50%', background: `color-mix(in srgb, ${gradeColor(healthReport.grade)} 12%, transparent)`, border: `3px solid ${gradeColor(healthReport.grade)}`, marginBottom: '12px' }}>
                                        <span style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', fontWeight: 700, color: gradeColor(healthReport.grade) }}>{healthReport.grade}</span>
                                    </div>
                                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: '2.2rem', fontWeight: 700, color: gradeColor(healthReport.grade), lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                                        {healthReport.health_score}<span style={{ fontSize: '1rem', color: 'var(--text-muted)', fontWeight: 400, fontFamily: 'var(--font-body)' }}>/100</span>
                                    </div>
                                    <p style={{ color: 'var(--text-secondary)', fontSize: '13px', margin: '8px auto 0', maxWidth: '480px', lineHeight: 1.6, fontFamily: 'var(--font-body)' }}>{healthReport.narrative}</p>
                                    <Button variant="secondary" size="sm" onClick={async () => { setHealthLoading(true); try { const res = await aiAPI.healthReport(); setHealthReport(res.data); } catch (e) { console.error(e); toast.error('Failed to generate health report — try again'); } finally { setHealthLoading(false); } }} isLoading={healthLoading} style={{ marginTop: '16px' }}>
                                        <Sparkles size={13} />Regenerate
                                    </Button>
                                </div>

                                {/* Scores */}
                                {healthReport.scores && (
                                    <div style={reportsCardSt}>
                                        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 16px' }}>Score Breakdown</h3>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                            {Object.entries(healthReport.scores).map(([key, val]: [string, any]) => {
                                                const colors: Record<string, string> = { spending: 'var(--color-exp)', savings: 'var(--color-inc)', budget: 'var(--accent)', goals: 'var(--color-warn)', consistency: 'var(--accent)' };
                                                const color = colors[key] || 'var(--color-inc)';
                                                return (
                                                    <div key={key}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                                            <span style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 500, textTransform: 'capitalize', fontFamily: 'var(--font-body)' }}>{key.replace(/_/g, ' ')}</span>
                                                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 600, color, fontVariantNumeric: 'tabular-nums' }}>{val}/100</span>
                                                        </div>
                                                        <ProgressBar pct={val} color={color} height={6} />
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {/* Strengths + Improvements */}
                                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px' }}>
                                    {healthReport.strengths?.length > 0 && (
                                        <div style={reportsCardSt}>
                                            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '14px', fontWeight: 600, color: 'var(--color-inc)', margin: '0 0 14px' }}>✅ Strengths</h3>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                                {healthReport.strengths.map((s: string, i: number) => (
                                                    <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                                                        <span style={{ color: 'var(--color-inc)', fontSize: '13px', flexShrink: 0, marginTop: '1px' }}>•</span>
                                                        <span style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5, fontFamily: 'var(--font-body)' }}>{s}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    {healthReport.improvements?.length > 0 && (
                                        <div style={reportsCardSt}>
                                            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '14px', fontWeight: 600, color: 'var(--color-warn)', margin: '0 0 14px' }}>⚡ Areas to Improve</h3>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                                {healthReport.improvements.map((s: string, i: number) => (
                                                    <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                                                        <span style={{ color: 'var(--color-warn)', fontSize: '13px', flexShrink: 0, marginTop: '1px' }}>•</span>
                                                        <span style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5, fontFamily: 'var(--font-body)' }}>{s}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Budget performance */}
                                {healthReport.budget_performance?.length > 0 && (
                                    <div style={reportsCardSt}>
                                        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 14px' }}>Budget Performance</h3>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                            {healthReport.budget_performance.map((b: any, i: number) => {
                                                const used = Math.min(b.percentage_used, 100);
                                                const over = b.percentage_used > 100;
                                                return (
                                                    <div key={i}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                                                            <span style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 500, fontFamily: 'var(--font-body)' }}>{b.category}</span>
                                                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: over ? 'var(--color-exp)' : 'var(--color-inc)', fontWeight: 600 }}>{b.percentage_used?.toFixed(0)}%{over ? ' over' : ''}</span>
                                                        </div>
                                                        <ProgressBar pct={used} color={over ? 'var(--color-exp)' : 'var(--color-inc)'} height={5} />
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {/* Goals progress */}
                                {healthReport.goals_progress?.length > 0 && (
                                    <div style={reportsCardSt}>
                                        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 14px' }}>Goals Progress</h3>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                            {healthReport.goals_progress.map((g: any, i: number) => (
                                                <div key={i}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
                                                        <span style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 500, fontFamily: 'var(--font-body)' }}>{g.name}</span>
                                                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--accent)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{g.percentage?.toFixed(0)}%</span>
                                                    </div>
                                                    <ProgressBar pct={Math.min(g.percentage, 100)} height={5} />
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </>
                )}
            </div>
            <style>{`
                @media print {
                    body > * { display: none !important; }
                    #health-report-printable, #health-report-printable * { display: revert !important; }
                    #health-report-printable { position: fixed; top: 0; left: 0; width: 100%; background: white; color: black; padding: 20px; }
                }
            `}</style>
        </>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// YEAR REVIEW TAB (formerly /year-review)
// ═══════════════════════════════════════════════════════════════════════════
const yrFmt = (n: number) => '₹' + Math.round(Math.abs(n)).toLocaleString('en-IN');

function useCountUp(target: number, duration = 1400, enabled = true) {
    const [val, setVal] = useState(0);
    useEffect(() => {
        if (!enabled || target === 0) { setVal(target); return; }
        let cur = 0;
        const step = target / (duration / 16);
        const t = setInterval(() => {
            cur = Math.min(cur + step, target);
            setVal(Math.floor(cur));
            if (cur >= target) clearInterval(t);
        }, 16);
        return () => clearInterval(t);
    }, [target, duration, enabled]);
    return val;
}

function YearReviewTab() {
    const { user } = useAuthStore();
    const cardRef = useRef<HTMLDivElement>(null);

    const now = new Date();
    const cy  = now.getFullYear();

    const [selectedYear, setSelectedYear]   = useState(cy - 1);
    const [allTxs, setAllTxs]               = useState<any[]>([]);
    const [loading, setLoading]             = useState(true);
    const [personality, setPersonality]     = useState('');
    const [screenshotMsg, setScreenshotMsg] = useState(false);

    useEffect(() => {
        if (!user) return;
        setLoading(true);
        transactionsAPI.getAll()
            .then(res => setAllTxs(res.data.transactions ?? []))
            .catch(() => toast.error('Failed to load transaction data'))
            .finally(() => setLoading(false));
        // Try to read cached personality label
        try {
            const raw = localStorage.getItem('fintrack-personality') ?? localStorage.getItem('fintrack-personality-label');
            if (raw) {
                const parsed = JSON.parse(raw);
                setPersonality(typeof parsed === 'string' ? parsed : (parsed?.label ?? parsed?.personality_type ?? ''));
            }
        } catch {}
    }, [user]);

    const yearTxs = useMemo(() =>
        allTxs.filter(t => {
            const y = new Date((t.date ?? '').split('T')[0] + 'T00:00:00').getFullYear();
            return y === selectedYear;
        }), [allTxs, selectedYear]);

    const stats = useMemo(() => {
        if (!yearTxs.length) return null;
        const expenses = yearTxs.filter(t => t.type === 'expense');
        const income   = yearTxs.filter(t => t.type === 'income');

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
            if (t.type === 'expense') mMap[m].exp += a;
            else mMap[m].inc += a;
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

    const animCount = useCountUp(stats?.count ?? 0, 1400, !!stats);

    const handleScreenshot = () => {
        cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => { setScreenshotMsg(true); setTimeout(() => setScreenshotMsg(false), 3000); }, 350);
    };

    const sCard: React.CSSProperties = { background: 'var(--bg-surface-1)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: '20px', marginBottom: 0 };

    return (
        <>
            {screenshotMsg && (
                <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 9999, background: 'var(--bg-surface-3)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '10px 20px', fontSize: '14px', color: 'var(--text-primary)', fontFamily: 'var(--font-body)', boxShadow: '0 4px 16px rgba(0,0,0,0.15)', whiteSpace: 'nowrap' }}>
                    Take a screenshot of the summary card to share your year! 📸
                </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

                {/* Header */}
                <div style={sCard}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
                        <div>
                            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 3px' }}>Year in Review 🎉</h1>
                            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)' }}>Your complete financial story for {selectedYear}</p>
                        </div>
                        <div style={{ display: 'flex', gap: '6px' }}>
                            {[cy - 2, cy - 1, cy].map(y => (
                                <button key={y} type="button" onClick={() => setSelectedYear(y)}
                                    style={{ padding: '6px 12px', borderRadius: '999px', border: `1px solid ${selectedYear === y ? 'var(--accent)' : 'var(--border-subtle)'}`, background: selectedYear === y ? 'var(--accent)' : 'var(--bg-surface-2)', color: selectedYear === y ? 'white' : 'var(--text-muted)', fontSize: '13px', fontWeight: selectedYear === y ? 600 : 400, cursor: 'pointer', fontFamily: 'var(--font-body)', transition: 'all var(--transition-fast)' }}>
                                    {y}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {loading ? (
                    <><SkeletonCard height={200} /><SkeletonCard height={200} /></>
                ) : !stats ? (
                    <div style={{ ...sCard, padding: 0 }}>
                        <EmptyState
                            icon={BarChart3}
                            title={`No data for ${selectedYear}`}
                            subtitle="Add transactions for this year to see your review."
                        />
                    </div>
                ) : (
                    <>
                        {/* Big animated count */}
                        <div style={{ ...sCard, textAlign: 'center', padding: '36px 24px', background: 'var(--bg-surface-1)' }}>
                            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'clamp(48px, 12vw, 72px)', fontWeight: 800, color: 'var(--accent)', margin: '0 0 6px', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                                {animCount.toLocaleString('en-IN')}
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
                                <div key={s.label} style={{ background: 'var(--bg-surface-1)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '16px' }}>
                                    <div style={{ fontSize: 22, marginBottom: 6 }}>{s.emoji}</div>
                                    <p style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 4px', fontFamily: 'var(--font-body)' }}>{s.label}</p>
                                    <p style={{ fontFamily: 'var(--font-mono)', fontSize: '1.15rem', fontWeight: 700, color: s.color, margin: 0, fontVariantNumeric: 'tabular-nums' }}>{s.value}</p>
                                </div>
                            ))}
                        </div>

                        {/* Highlights */}
                        <div style={sCard}>
                            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 14px' }}>Highlights</h2>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {stats.topCategory && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px', background: 'var(--bg-surface-2)', borderRadius: 'var(--radius-md)', borderLeft: '4px solid var(--color-exp)' }}>
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
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px', background: 'var(--bg-surface-2)', borderRadius: 'var(--radius-md)', borderLeft: '4px solid var(--color-warn)' }}>
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
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px', background: 'var(--bg-surface-2)', borderRadius: 'var(--radius-md)', borderLeft: '4px solid var(--color-inc)' }}>
                                        <span style={{ fontSize: 24, flexShrink: 0 }}>🌟</span>
                                        <div>
                                            <p style={{ fontFamily: 'var(--font-body)', fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 2px' }}>Best Savings Month</p>
                                            <p style={{ fontFamily: 'var(--font-body)', fontSize: '14px', color: 'var(--text-primary)', margin: 0 }}>
                                                <strong>{FULL_MONTHS[stats.bestSavings.m]}</strong> — saved {yrFmt(stats.bestSavings.savings)}
                                            </p>
                                        </div>
                                    </div>
                                )}

                                {personality && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 16px', background: 'var(--bg-surface-2)', borderRadius: 'var(--radius-md)', borderLeft: '4px solid var(--accent)' }}>
                                        <span style={{ fontSize: 24, flexShrink: 0 }}>🧠</span>
                                        <div>
                                            <p style={{ fontFamily: 'var(--font-body)', fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 2px' }}>Your Money Personality</p>
                                            <p style={{ fontFamily: 'var(--font-body)', fontSize: '14px', color: 'var(--text-primary)', margin: 0 }}>{personality}</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Shareable card */}
                        <div style={sCard}>
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
// PERSONALITY TAB (formerly /personality)
// ═══════════════════════════════════════════════════════════════════════════
const DIMENSION_META: Record<string, { color: string; icon: string }> = {
    consistency:   { color: 'var(--color-inc)',  icon: '📊' },
    discipline:    { color: 'var(--accent)',      icon: '🎯' },
    goal_focus:    { color: 'var(--color-warn)',  icon: '🏆' },
    risk_appetite: { color: 'var(--color-exp)',   icon: '⚡' },
    savings_habit: { color: 'var(--accent)',    icon: '💰' },
};

const DIMENSION_LABELS: Record<string, string> = {
    consistency:   'Consistency',
    discipline:    'Discipline',
    goal_focus:    'Goal Focus',
    risk_appetite: 'Risk Appetite',
    savings_habit: 'Savings Habit',
};

function scoreColor(score: number) {
    if (score >= 70) return 'var(--color-inc)';
    if (score >= 40) return 'var(--color-warn)';
    return 'var(--color-exp)';
}
function scoreLabel(score: number) {
    if (score >= 80) return 'Excellent';
    if (score >= 60) return 'Good';
    if (score >= 40) return 'Average';
    return 'Needs Work';
}

const personalityCardSt: React.CSSProperties = {
    background: 'var(--bg-surface-1)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 'var(--radius-lg)',
    padding: '20px 24px',
};

function PersonalityTab() {
    const [data, setData]         = useState<any>(null);
    const [loading, setLoading]   = useState(false);
    const [generated, setGenerated] = useState(false);
    const [error, setError]       = useState('');

    const generate = async () => {
        setLoading(true); setError('');
        try {
            const res = await aiAPI.personality();
            setData(res.data); setGenerated(true);
        } catch (err: any) {
            setError(err?.response?.data?.message || err?.response?.data?.error || 'Failed to generate profile. Please try again.');
            setData(null);
        } finally { setLoading(false); }
    };

    const dims = data?.dimensions ? Object.entries(data.dimensions) : [];
    const strengths = dims.filter(([, d]: [string, any]) => d.score >= 65);
    const watchOuts = dims.filter(([, d]: [string, any]) => d.score < 50);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

            {/* Header */}
            <div style={{ background: 'var(--bg-surface-1)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xl)', padding: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 3px' }}>Personality</h1>
                        <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)' }}>AI spending profile</p>
                    </div>
                    {generated && !loading && (
                        <Button variant="secondary" size="md" onClick={generate}>Refresh</Button>
                    )}
                </div>
            </div>

            {/* Empty state */}
            {!generated && !loading && !error && (
                <div style={{ textAlign: 'center', padding: '48px 24px' }}>
                    <p style={{ fontSize: '48px', marginBottom: '12px' }}>🧠</p>
                    <p style={{ fontFamily: 'var(--font-display)', fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 8px' }}>No analysis yet</p>
                    <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: '0 0 20px', fontFamily: 'var(--font-body)' }}>Add some transactions first, then generate your personality report</p>
                    <Button variant="primary" size="md" onClick={generate}><Brain size={15} /> Analyse My Personality</Button>
                </div>
            )}

            {/* Loading */}
            {loading && (
                <div style={{ ...personalityCardSt, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px', gap: '16px' }}>
                    <Loader2 size={28} color="var(--accent)" style={{ animation: 'spin 1s linear infinite' }} />
                    <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: 0, fontFamily: 'var(--font-body)' }}>Building your financial profile…</p>
                </div>
            )}

            {/* Error */}
            {error && !loading && (
                <div style={{ ...personalityCardSt, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px', padding: '40px' }}>
                    <AlertTriangle size={28} color="var(--color-exp)" />
                    <p style={{ fontSize: '14px', color: 'var(--text-secondary)', margin: 0, textAlign: 'center', fontFamily: 'var(--font-body)' }}>{error}</p>
                    <button type="button" onClick={generate} style={{ background: 'none', border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '8px 20px', color: 'var(--text-primary)', fontSize: '14px', cursor: 'pointer', fontFamily: 'var(--font-body)' }}>Try again</button>
                </div>
            )}

            {/* Result */}
            {generated && data && !loading && (
                <>
                    <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                        {/* LEFT: Hero card */}
                        <div style={{ flex: '1.2 1 300px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <div style={{ background: 'color-mix(in srgb, var(--accent-3) 8%, var(--bg-surface-1))', border: '1px solid color-mix(in srgb, var(--accent-3) 25%, transparent)', borderRadius: 'var(--radius-lg)', padding: '28px 24px' }}>
                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                    <Badge color="var(--accent-3)" bg="color-mix(in srgb, var(--accent-3) 15%, transparent)">✦ FINANCIAL PROFILE</Badge>
                                    {data.from_cache && <Badge>Cached</Badge>}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginTop: '16px' }}>
                                    <div style={{ fontSize: '40px', lineHeight: 1 }}>{data.personality_emoji || '🧠'}</div>
                                    <p style={{ fontFamily: 'var(--font-display)', fontSize: '26px', fontWeight: 700, color: 'var(--text-primary)', margin: 0, lineHeight: 1.1 }}>
                                        {data.personality_type}
                                    </p>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '14px' }}>
                                    <div style={{ background: `color-mix(in srgb, ${scoreColor(data.overall_score)} 12%, transparent)`, border: `1px solid color-mix(in srgb, ${scoreColor(data.overall_score)} 30%, transparent)`, borderRadius: '20px', padding: '5px 14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '22px', fontWeight: 700, color: scoreColor(data.overall_score), fontVariantNumeric: 'tabular-nums' }}>{data.overall_score}</span>
                                        <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>/100</span>
                                    </div>
                                    <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>{scoreLabel(data.overall_score)}</span>
                                </div>
                                <div style={{ height: '1px', background: 'var(--border-subtle)', margin: '20px 0' }} />
                                <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.7, margin: 0, fontFamily: 'var(--font-body)' }}>{data.summary}</p>
                            </div>

                            {/* Dimension scores */}
                            <div style={personalityCardSt}>
                                <p style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', margin: '0 0 14px', fontWeight: 600, fontFamily: 'var(--font-body)' }}>Dimension scores</p>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    {dims.map(([key, dim]: [string, any]) => {
                                        const meta = DIMENSION_META[key] || { color: 'var(--text-muted)', icon: '•' };
                                        return (
                                            <div key={key}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        <span style={{ fontSize: '13px' }}>{meta.icon}</span>
                                                        <span style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 500, fontFamily: 'var(--font-body)' }}>{DIMENSION_LABELS[key] || key}</span>
                                                        <Badge color={meta.color} bg={`color-mix(in srgb, ${meta.color} 12%, transparent)`}>{dim.label}</Badge>
                                                    </div>
                                                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', fontWeight: 700, color: scoreColor(dim.score), fontVariantNumeric: 'tabular-nums' }}>{dim.score}</span>
                                                </div>
                                                <div style={{ height: '6px', background: 'var(--bg-surface-3)', borderRadius: '3px', overflow: 'hidden' }}>
                                                    <div style={{ height: '100%', width: `${dim.score}%`, background: meta.color, borderRadius: '3px', transition: 'width 0.8s ease' }} />
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            <button type="button" onClick={() => { setGenerated(false); setData(null); }}
                                style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: '13px', cursor: 'pointer', textAlign: 'left', padding: '0', fontFamily: 'var(--font-body)' }}>
                                ↻ Regenerate profile
                            </button>
                        </div>

                        {/* RIGHT */}
                        <div style={{ flex: '1 1 260px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <div style={personalityCardSt}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                                    <Sparkles size={16} color="var(--accent)" />
                                    <span style={{ fontFamily: 'var(--font-display)', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>Traits</span>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    {dims.map(([key, dim]: [string, any]) => (
                                        <div key={key} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                                            <div style={{ width: '6px', height: '6px', borderRadius: '3px', background: 'var(--accent)', flexShrink: 0, marginTop: '5px' }} />
                                            <span style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5, fontFamily: 'var(--font-body)' }}>{dim.description}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {strengths.length > 0 && (
                                <div style={personalityCardSt}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                                        <TrendingUp size={16} color="var(--color-inc)" />
                                        <span style={{ fontFamily: 'var(--font-display)', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>Strengths</span>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        {strengths.map(([key, dim]: [string, any]) => (
                                            <div key={key} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                                                <div style={{ width: '6px', height: '6px', borderRadius: '3px', background: 'var(--color-inc)', flexShrink: 0, marginTop: '5px' }} />
                                                <span style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5, fontFamily: 'var(--font-body)' }}>
                                                    Strong {DIMENSION_LABELS[key] || key} ({dim.score}/100) — {dim.label}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {watchOuts.length > 0 && (
                                <div style={personalityCardSt}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                                        <AlertCircle size={16} color="var(--color-warn)" />
                                        <span style={{ fontFamily: 'var(--font-display)', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>Watch Outs</span>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        {watchOuts.map(([key, dim]: [string, any]) => (
                                            <div key={key} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                                                <div style={{ width: '6px', height: '6px', borderRadius: '3px', background: 'var(--color-warn)', flexShrink: 0, marginTop: '5px' }} />
                                                <span style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5, fontFamily: 'var(--font-body)' }}>
                                                    {DIMENSION_LABELS[key] || key} needs attention ({dim.score}/100) — {dim.label}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Tips */}
                    <GCard style={{ background: 'color-mix(in srgb, var(--accent) 4%, var(--bg-surface-1))', border: '1px solid color-mix(in srgb, var(--accent) 15%, transparent)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                            <Lightbulb size={16} color="var(--accent)" />
                            <span style={{ fontFamily: 'var(--font-display)', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>What to focus on</span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {dims.map(([key, dim]: [string, any], i: number) => (
                                <div key={key} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                                    <div style={{ width: '24px', height: '24px', flexShrink: 0, borderRadius: '12px', background: 'var(--accent-subtle)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '13px', fontFamily: 'var(--font-mono)' }}>
                                        {i + 1}
                                    </div>
                                    <div>
                                        <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 2px', fontFamily: 'var(--font-display)' }}>{DIMENSION_LABELS[key] || key}</p>
                                        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.6, fontFamily: 'var(--font-body)' }}>
                                            {dim.score >= 70 ? `You're doing well here. Maintain your ${dim.label.toLowerCase()} habits.` : dim.score >= 50 ? `Good foundation — push to improve ${DIMENSION_LABELS[key]?.toLowerCase()} toward 70+.` : `Focus area: ${dim.description}`}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </GCard>

                    <p style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center', fontFamily: 'var(--font-body)' }}>
                        AI-generated analysis based on your last 90 days of transactions. Results update every 24 hours.
                    </p>
                </>
            )}
        </div>
    );
}

// ═══════════════════════════════════════════════════════════════════════════
// OUTER SHELL
// ═══════════════════════════════════════════════════════════════════════════
function AnalyticsPageInner() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { user, isLoading, loadFromStorage } = useAuthStore();

    const initialTab = searchParams.get('tab');
    const [tab, setTab] = useState(OUTER_TABS.some(t => t.key === initialTab) ? initialTab! : 'overview');

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

                <Tabs tabs={OUTER_TABS} active={tab} onChange={setTab} />

                {tab === 'overview' && <AnalyticsOverviewTab />}
                {tab === 'insights' && <InsightsTab />}
                {tab === 'reports' && <ReportsTab />}
                {tab === 'year-review' && <YearReviewTab />}
                {tab === 'personality' && <PersonalityTab />}
            </div>
    );
}

export default function AnalyticsPage() {
    return <Suspense><AnalyticsPageInner /></Suspense>;
}
