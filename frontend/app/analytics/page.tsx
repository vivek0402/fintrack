'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import {
    AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer,
} from 'recharts';
import { useAuthStore } from '@/store/authStore';
import { analyticsAPI, transactionsAPI, aiAPI, accountsAPI } from '@/lib/api';
import { AppLayout } from '@/components/layout/AppLayout';
import { GCard } from '@/components/ui/GCard';
import { Badge } from '@/components/ui/Badge';
import { Skeleton, SkeletonCard } from '@/components/ui/Skeleton';
import { useIsMobile } from '@/hooks/useWindowSize';
import { useThemeStore } from '@/store/themeStore';
import { Button } from '@/components/ui/Button';
import { Download, Sparkles, RefreshCw, Wallet, TrendingUp, TrendingDown, Calendar, Award, ChevronLeft, ChevronDown, ChevronRight } from 'lucide-react';
import { SpendingHeatmap } from '@/components/analytics/SpendingHeatmap';
import { SankeyFlow } from '@/components/analytics/SankeyFlow';
import { CategoryTrajectory } from '@/components/analytics/CategoryTrajectory';
import { RegretAnalysis } from '@/components/analytics/RegretAnalysis';
import { exportToCSV, formatCurrency } from '@/lib/utils';

const MONTH_NAMES = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const FULL_MONTHS = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const fmt = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');

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

// ── Main page ──────────────────────────────────────────────────────────────────
export default function AnalyticsPage() {
    const router = useRouter();
    const { user, isLoading, loadFromStorage } = useAuthStore();
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

    const goToPrevMonth = () => {
        if (currentMonth === 1) { setSelMonth(12); setSelYear(y => y - 1); }
        else setSelMonth(m => m - 1);
    };
    const goToNextMonth = () => {
        if (isCurrentMonth) return;
        if (currentMonth === 12) { setSelMonth(1); setSelYear(y => y + 1); }
        else setSelMonth(m => m + 1);
    };
    const [period, setPeriod] = useState<'month' | 'quarter' | 'year'>('month');

    const [summary, setSummary]                 = useState<any>(null);
    const [trends, setTrends]                   = useState<any[]>([]);
    const [categories, setCategories]           = useState<any[]>([]);
    const [yearlyData, setYearlyData]           = useState<any>(null);
    const [paymentMethods, setPaymentMethods]   = useState<any[]>([]);
    const [paymentTotal, setPaymentTotal]       = useState(0);
    const [allTransactions, setAllTransactions] = useState<any[]>([]);
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

    useEffect(() => { loadFromStorage(); }, []);
    useEffect(() => { if (!isLoading && !user) router.push('/login'); }, [user, isLoading]);

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
            } catch (err) { console.error(err); }
            finally { setDataLoading(false); }
        };
        fetchData();
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

    const hexToRgba = (hex: string, alpha: number) => {
        if (hex.startsWith('rgb')) return hex; // already rgba — just return
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r},${g},${b},${alpha})`;
    };

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

    // ── Loading skeleton ──────────────────────────────────────────────────────
    if (isLoading || !user) return (
        <AppLayout>
            <SkeletonCard height={80} style={{ marginBottom: '16px' }} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
                {[1, 2, 3, 4].map(i => <SkeletonCard key={i} height={72} />)}
            </div>
            <SkeletonCard height={240} style={{ marginBottom: '16px' }} />
            <SkeletonCard height={180} />
        </AppLayout>
    );

    // ── Shared card wrapper ───────────────────────────────────────────────────
    const sectionCard: React.CSSProperties = { background: 'var(--bg-surface-1)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: '20px', marginBottom: '16px' };

    return (
        <AppLayout>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingBottom: '24px', animation: 'fadeUp 200ms ease forwards' }}>

                {/* ── HEADER ── */}
                <div style={{ ...sectionCard, marginBottom: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 3px' }}>Analytics</h1>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <button onClick={goToPrevMonth} style={{ display: 'flex', alignItems: 'center', padding: '2px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', borderRadius: '4px' }} aria-label="Previous month">
                                    <ChevronLeft size={14} />
                                </button>
                                <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontFamily: 'var(--font-body)', userSelect: 'none' }}>{FULL_MONTHS[currentMonth]} {currentYear} — spending overview</span>
                                <button onClick={goToNextMonth} disabled={isCurrentMonth} style={{ display: 'flex', alignItems: 'center', padding: '2px', background: 'none', border: 'none', cursor: isCurrentMonth ? 'default' : 'pointer', color: isCurrentMonth ? 'var(--border-subtle)' : 'var(--text-muted)', borderRadius: '4px' }} aria-label="Next month">
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
                                    <button key={p} type="button" onClick={() => setPeriod(p)}
                                        style={{ padding: '6px 14px', borderRadius: '999px', border: `1px solid ${period === p ? 'var(--accent)' : 'var(--border-subtle)'}`, background: period === p ? 'var(--accent)' : 'var(--bg-surface-1)', color: period === p ? 'white' : 'var(--text-muted)', fontSize: '13px', fontWeight: period === p ? 600 : 400, cursor: 'pointer', fontFamily: 'var(--font-body)', transition: 'all var(--transition-fast)', textTransform: 'capitalize' }}>
                                        {p}
                                    </button>
                                ))}
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                {[
                                    { label: 'Total Spent', value: fmt(summary?.total_expenses ?? 0), sub: FULL_MONTHS[currentMonth], color: 'var(--color-exp)' },
                                    { label: 'Daily Average', value: fmt(dailyAvg), sub: 'this month', color: 'var(--color-warn)' },
                                    { label: 'vs Last Month', value: vsLastMonth !== null ? `${vsLastMonth > 0 ? '+' : ''}${vsLastMonth}%` : '—', sub: 'expenses', color: vsLastMonth !== null && vsLastMonth > 0 ? 'var(--color-exp)' : 'var(--color-inc)' },
                                    { label: 'Savings Rate', value: `${savingsRate}%`, sub: 'of income saved', color: 'var(--accent)' },
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

                        {/* Weekly Spending Pattern */}
                        <div style={sectionCard}>
                            <SectionHead title="Weekly Spending Pattern" />
                            {dataLoading ? <SkeletonCard height={150} /> : (
                                <ResponsiveContainer width="100%" height={160}>
                                    <BarChart data={weeklyData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                                        <CartesianGrid horizontal vertical={false} stroke={cc.border} strokeWidth={1} />
                                        <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: cc.faint, fontSize: 11, fontFamily: 'DM Mono, monospace' }} />
                                        <YAxis hide />
                                        <Tooltip content={<ChartTooltip />} />
                                        <Bar dataKey="amount" name="Spent" radius={[4, 4, 0, 0]}>
                                            {weeklyData.map((entry, idx) => (
                                                <Cell key={idx} fill={entry.amount === maxWeeklyAmt && entry.amount > 0 ? cc.exp : cc.tint} />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            )}
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
                                    {dataLoading ? <div style={{ height: 100, background: 'var(--bg-surface-2)', borderRadius: 8 }} /> : <SpendingHeatmap transactions={allTransactions} />}
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
                                    onClick={async () => { setRegretLoading(true); try { const res = await aiAPI.regretPatterns(); setRegretData(res.data); } catch { } finally { setRegretLoading(false); } }}
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

            </div>
        </AppLayout>
    );
}
