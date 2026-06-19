'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { TrendingUp, TrendingDown, Wallet, Award, Sparkles, RefreshCw, PiggyBank, AlertTriangle, X, Lightbulb, ChevronLeft, ChevronRight, ChevronDown, CalendarClock, Flame, Sun, CloudSun, Cloud, CloudRain, CloudLightning, CloudFog } from 'lucide-react';
import Link from 'next/link';
import { useAuthStore } from '@/store/authStore';
import { analyticsAPI, transactionsAPI, recurringAPI, budgetsAPI, aiAPI, goalsAPI, accountsAPI, investmentAPI, debtAPI, loanAPI, opportunityAPI, briefingAPI } from '@/lib/api';
import { getCurrentMonthYear } from '@/lib/utils';
import { useCountUp } from '@/hooks/useCountUp';
import { useIsMobile } from '@/hooks/useWindowSize';
import { useThemeStore } from '@/store/themeStore';
import { AppLayout } from '@/components/layout/AppLayout';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Button } from '@/components/ui/Button';
import { Skeleton, SkeletonCard } from '@/components/ui/Skeleton';
import { HealthScoreWidget } from '@/components/dashboard/HealthScoreWidget';
import { NetWorthWidget } from '@/components/dashboard/NetWorthWidget';
import { WealthVelocityWidget } from '@/components/dashboard/WealthVelocityWidget';
import { AssetAllocationWidget } from '@/components/dashboard/AssetAllocationWidget';
import { CreditUtilizationWidget } from '@/components/dashboard/CreditUtilizationWidget';
import { DtiWidget } from '@/components/dashboard/DtiWidget';
import { CoachAlerts } from '@/components/coach/CoachAlerts';
import { RegretCheckSheet } from '@/components/dashboard/RegretCheckSheet';

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

// ── 6-month Bezier curve sparkline ───────────────────────────────────────────
function BezierSparkline({ data, incColor, expColor }: {
    data: { month: string; income: number; expenses: number }[];
    incColor: string; expColor: string;
}) {
    const [tipIdx, setTipIdx] = useState<number | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    if (!data.length) return (
        <div style={{ height: 72, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>No data yet</p>
        </div>
    );

    const W = 600, H = 56, PAD = 2;
    const n = data.length;
    const maxVal = Math.max(...data.flatMap(d => [d.income, d.expenses]), 1);

    const toPoints = (key: 'income' | 'expenses') =>
        data.map((d, i) => ({
            x: PAD + (n === 1 ? (W - PAD * 2) / 2 : (i / (n - 1)) * (W - PAD * 2)),
            y: H - PAD - (d[key] / maxVal) * (H - PAD * 2),
        }));

    const linePath = (pts: { x: number; y: number }[]) => {
        if (pts.length < 2) return `M ${pts[0].x} ${pts[0].y}`;
        let d = `M ${pts[0].x} ${pts[0].y}`;
        for (let i = 1; i < pts.length; i++) {
            const p = pts[i - 1], c = pts[i];
            const cp1x = p.x + (c.x - p.x) / 3;
            const cp2x = c.x - (c.x - p.x) / 3;
            d += ` C ${cp1x} ${p.y}, ${cp2x} ${c.y}, ${c.x} ${c.y}`;
        }
        return d;
    };

    const areaPath = (pts: { x: number; y: number }[]) =>
        `${linePath(pts)} L ${pts[pts.length - 1].x} ${H} L ${pts[0].x} ${H} Z`;

    const incPts = toPoints('income');
    const expPts = toPoints('expenses');

    const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const pct = (e.clientX - rect.left) / rect.width;
        const idx = n === 1 ? 0 : Math.round(pct * (n - 1));
        setTipIdx(Math.max(0, Math.min(n - 1, idx)));
    };

    const tipXPct = tipIdx !== null ? (n === 1 ? 50 : (tipIdx / (n - 1)) * 100) : 0;
    const tipXInViewBox = PAD + (tipIdx !== null ? (n === 1 ? (W - PAD * 2) / 2 : (tipIdx / (n - 1)) * (W - PAD * 2)) : 0);

    return (
        <div ref={containerRef} style={{ position: 'relative' }}
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setTipIdx(null)}>
            <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{ display: 'block', overflow: 'visible' }}>
                <defs>
                    <linearGradient id="dashIncGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={incColor} stopOpacity={0.3} />
                        <stop offset="100%" stopColor={incColor} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="dashExpGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={expColor} stopOpacity={0.25} />
                        <stop offset="100%" stopColor={expColor} stopOpacity={0} />
                    </linearGradient>
                </defs>
                <path d={areaPath(incPts)} fill="url(#dashIncGrad)" />
                <path d={areaPath(expPts)} fill="url(#dashExpGrad)" />
                <path d={linePath(incPts)} fill="none" stroke={incColor} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
                <path d={linePath(expPts)} fill="none" stroke={expColor} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
                {tipIdx !== null && (
                    <line x1={tipXInViewBox} y1={0} x2={tipXInViewBox} y2={H}
                        stroke="rgba(255,255,255,0.12)" strokeWidth={1} />
                )}
            </svg>
            {/* Hover tooltip */}
            {tipIdx !== null && (
                <div style={{
                    position: 'absolute',
                    top: '-4px',
                    left: `${tipXPct}%`,
                    transform: tipXPct > 75 ? 'translateX(-100%)' : tipXPct < 10 ? 'translateX(0)' : 'translateX(-50%)',
                    background: 'var(--bg-surface-2)',
                    border: '1px solid var(--border-visible)',
                    borderRadius: 'var(--radius-md)',
                    padding: '6px 10px',
                    pointerEvents: 'none',
                    zIndex: 10,
                    whiteSpace: 'nowrap',
                }}>
                    <p style={{ fontFamily: 'var(--font-body)', fontSize: '10px', color: 'var(--text-muted)', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{data[tipIdx].month}</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: incColor, fontVariantNumeric: 'tabular-nums' }}>↑ {fmt(data[tipIdx].income)}</span>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: expColor, fontVariantNumeric: 'tabular-nums' }}>↓ {fmt(data[tipIdx].expenses)}</span>
                    </div>
                </div>
            )}
            {/* Month labels aligned to data points */}
            <div style={{ position: 'relative', height: '16px', marginTop: '4px' }}>
                {data.map((d, i) => {
                    const xPct = n === 1 ? 50 : (i / (n - 1)) * 100;
                    return (
                        <span key={i} style={{
                            position: 'absolute',
                            left: `${xPct}%`,
                            transform: 'translateX(-50%)',
                            fontSize: '10px',
                            color: 'var(--text-muted)',
                            fontFamily: 'var(--font-body)',
                            whiteSpace: 'nowrap',
                        }}>{d.month}</span>
                    );
                })}
            </div>
            <div style={{ display: 'flex', gap: '14px', marginTop: '6px' }}>
                {[{ label: 'Income', color: incColor }, { label: 'Expenses', color: expColor }].map(l => (
                    <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <div style={{ width: 16, height: 2, background: l.color, borderRadius: 1 }} />
                        <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>{l.label}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
    const router = useRouter();
    const { user, isLoading, loadFromStorage } = useAuthStore();
    const { theme, palette } = useThemeStore();
    const isMobile = useIsMobile();

    const _now = new Date();
    const _nowMonth = _now.getMonth() + 1;
    const _nowYear  = _now.getFullYear();
    const [selMonth, setSelMonth] = useState(_nowMonth);
    const [selYear,  setSelYear]  = useState(_nowYear);
    const month = selMonth;
    const year  = selYear;
    const isCurrentMonth = month === _nowMonth && year === _nowYear;

    const goToPrevMonth = () => {
        if (month === 1) { setSelMonth(12); setSelYear(y => y - 1); }
        else setSelMonth(m => m - 1);
    };
    const goToNextMonth = () => {
        if (isCurrentMonth) return;
        if (month === 12) { setSelMonth(1); setSelYear(y => y + 1); }
        else setSelMonth(m => m + 1);
    };

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
    const [coachEnabled, setCoachEnabled] = useState(true);
    const [accounts, setAccounts]       = useState<any[]>([]);
    const [investments, setInvestments] = useState<any[]>([]);
    const [investmentRatio, setInvestmentRatio] = useState<any>(null);
    const [creditUtilization, setCreditUtilization] = useState<any>(null);
    const [dti, setDti] = useState<any>(null);
    const [activeLoanCount, setActiveLoanCount] = useState(0);
    const [utilAlertDismissed, setUtilAlertDismissed] = useState(false);
    const [dtiAlertDismissed, setDtiAlertDismissed] = useState(false);
    const [opportunities, setOpportunities] = useState<any[]>([]);
    const [dismissingIds, setDismissingIds] = useState<Set<string>>(new Set());
    const [briefing, setBriefing] = useState<any>(null);
    const [briefingExpanded, setBriefingExpanded] = useState(false);
    const [healthDetailsOpen, setHealthDetailsOpen] = useState(false);
    const [opportunitiesOpen, setOpportunitiesOpen] = useState(false);

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

    // Row-2 tile computed values
    const today       = new Date();
    const daysInMonth = new Date(year, month, 0).getDate();
    const daysElapsed = isCurrentMonth ? Math.max(today.getDate(), 1) : daysInMonth;
    const daysLeft    = isCurrentMonth ? daysInMonth - today.getDate() : 0;
    const runway      = (summary?.total_income ?? 0) - (summary?.total_expenses ?? 0);
    const dailyBurn   = (summary?.total_expenses ?? 0) / daysElapsed;

    // ── Financial Weather — one-glance mood derived from existing signals ──
    const financialWeather = useMemo(() => {
        const income = summary?.total_income ?? 0;
        const hasActivity = transactions.length > 0;
        const alertFlag = (creditUtilization?.aggregate?.overall_utilization_pct ?? 0) > 50 || (dti?.dti_ratio ?? 0) > 35;
        const idealDailyBurn = income > 0 ? income / daysInMonth : 0;
        const burnPace = idealDailyBurn > 0 ? dailyBurn / idealDailyBurn : (dailyBurn > 0 ? 2 : 0);
        const bigDeficit = netBalance < 0 && income > 0 && Math.abs(netBalance) > income * 0.2;

        if (!hasActivity) {
            return { label: 'Calm Waters', sub: 'Nothing recorded yet', color: 'var(--text-muted)', Icon: CloudFog };
        }
        if (alertFlag || bigDeficit) {
            return { label: 'Stormy', sub: 'Spending is outpacing income', color: 'var(--color-exp)', Icon: CloudLightning };
        }
        if (netBalance < 0) {
            return { label: 'Tight Squeeze', sub: 'Spent more than you earned', color: 'var(--color-warn)', Icon: CloudRain };
        }
        if (savingsPct >= 25 && burnPace <= 1) {
            return { label: 'Thriving', sub: `${savingsPct}% saved this month`, color: 'var(--color-inc)', Icon: Sun };
        }
        if (savingsPct >= 10) {
            return { label: 'Cruising', sub: `${savingsPct}% saved, steady pace`, color: 'var(--color-inc)', Icon: CloudSun };
        }
        return { label: 'Watch Your Pace', sub: 'Spending is creeping up', color: 'var(--color-warn)', Icon: Cloud };
    }, [summary, transactions, creditUtilization, dti, daysInMonth, dailyBurn, netBalance, savingsPct]);

    useEffect(() => { loadFromStorage(); }, []);
    useEffect(() => { if (!isLoading && !user) router.push('/login'); }, [user, isLoading]);
    useEffect(() => {
        setSalaryDismissed(localStorage.getItem(`salary-banner-dismissed-${month}-${year}`) === 'true');
        const val = localStorage.getItem('fintrack-coach-enabled');
        setCoachEnabled(val === null ? true : val === 'true');
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
        accountsAPI.getAll().then(res => setAccounts(res.data.accounts ?? res.data ?? [])).catch(() => {});
        investmentAPI.getAll().then(res => setInvestments(res.data.investments ?? [])).catch(() => {});
        analyticsAPI.getInvestmentRatio().then(res => setInvestmentRatio(res.data)).catch(() => {});
        analyticsAPI.getWealthVelocity().catch(() => {});
        analyticsAPI.getAssetAllocation().catch(() => {});
        debtAPI.getCreditUtilization().then(res => setCreditUtilization(res.data)).catch(() => {});
        debtAPI.getDti().then(res => setDti(res.data)).catch(() => {});
        loanAPI.getAll(true).then(res => setActiveLoanCount((res.data.loans || []).length)).catch(() => {});
        aiAPI.salaryIntelligence().then(res => { if (res.data?.detected) setSalaryData(res.data); }).catch(() => {});
        opportunityAPI.detect().then(res => setOpportunities(res.data?.opportunities ?? [])).catch(() => {});
        briefingAPI.getLatest().then(res => setBriefing(res.data)).catch(() => setBriefing(null));
    }, [user, month, year]);

    // Fingerprint-based AI regeneration — only for current month (API has no month param)
    useEffect(() => {
        if (!user || !summary || !isCurrentMonth) {
            if (!isCurrentMonth) { setAiInsight(''); setAiLoading(false); }
            return;
        }
        const fingerprint = `${summary.total_income}-${summary.total_expenses}-${month}-${year}`;
        const AI_KEY = `ai-report-v2-${user.id}-${month}-${year}`;
        const AI_FP_KEY  = `ai-fp-v2-${user.id}-${month}-${year}`;
        try {
            const cached    = localStorage.getItem(AI_KEY);
            const storedFP  = localStorage.getItem(AI_FP_KEY);
            if (cached && storedFP === fingerprint) {
                setAiInsight(JSON.parse(cached).report ?? '');
                setAiLoading(false);
                return;
            }
        } catch { /* stale */ }
        setAiLoading(true);
        aiAPI.report()
            .then(res => {
                const report = res.data?.report ?? '';
                setAiInsight(report);
                if (report) {
                    try { localStorage.setItem(AI_KEY,    JSON.stringify({ report })); } catch {}
                    try { localStorage.setItem(AI_FP_KEY, fingerprint);                } catch {}
                }
            })
            .catch(() => setAiInsight('Unable to generate right now — try again shortly.'))
            .finally(() => setAiLoading(false));
    }, [summary, month, year, user]);

    // Current week's Monday (matches backend mondayOf())
    const currentWeekOf = useMemo(() => {
        const d = new Date();
        const day = d.getDay();
        const diff = day === 0 ? -6 : 1 - day;
        d.setDate(d.getDate() + diff);
        return d.toISOString().split('T')[0];
    }, []);

    const showBriefing = briefing && (briefing.week_of || '').split('T')[0] === currentWeekOf;

    const handleDismissOpportunity = async (id: string) => {
        setDismissingIds(prev => new Set(prev).add(id));
        try { await opportunityAPI.dismiss(id); } catch {}
        setTimeout(() => setOpportunities(prev => prev.filter((o: any) => o.id !== id)), 250);
    };

    const handleActOnOpportunity = async (opp: any) => {
        try { await opportunityAPI.markActedOn(opp.id); } catch {}
        if (opp.action_route) router.push(opp.action_route);
    };

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

    // Top categories by spend (for the categories column)
    const topCategories = useMemo(() => {
        return [...budgets]
            .filter((b: any) => parseFloat(b.spent) > 0)
            .sort((a: any, b: any) => parseFloat(b.spent) - parseFloat(a.spent))
            .slice(0, 5);
    }, [budgets]);

    // Over-budget count
    const overBudget = budgets.filter((b: any) => parseFloat(b.spent) > parseFloat(b.amount)).length;

    // Guilt-free budget computation
    const guiltFreeData = useMemo(() => {
        if (!isCurrentMonth || !summary || parseFloat(summary.total_income) <= 0) return null;
        const income = parseFloat(summary.total_income);
        const totalBudgeted = budgets.reduce((s: number, b: any) => s + parseFloat(b.amount), 0);
        if (totalBudgeted === 0) return null;
        const goalMonthly = goals.filter((g: any) => g.target_date && !g.is_completed).reduce((s: number, g: any) => {
            const remaining = parseFloat(g.target_amount) - parseFloat(g.current_amount);
            if (remaining <= 0) return s;
            const months = Math.max(1, Math.ceil((new Date(g.target_date).getTime() - Date.now()) / (30.44 * 24 * 3600 * 1000)));
            return s + remaining / months;
        }, 0);
        const pool = Math.max(0, income - totalBudgeted - Math.round(goalMonthly));
        const budgetedSpent = budgets.reduce((s: number, b: any) => s + parseFloat(b.spent), 0);
        const unbudgetedSpent = Math.max(0, (parseFloat(summary.total_expenses) || 0) - budgetedSpent);
        const remaining = Math.max(0, pool - unbudgetedSpent);
        const usedPct = pool > 0 ? Math.min(100, (unbudgetedSpent / pool) * 100) : 0;
        return { income, totalBudgeted, goalMonthly: Math.round(goalMonthly), pool, unbudgetedSpent, remaining, usedPct };
    }, [summary, budgets, goals, isCurrentMonth]);

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

    // ── Net Balance hero (rendered above tiles on mobile, below on desktop) ──
    const netBalanceHero = (
        <div style={{ background: 'var(--bg-surface-1)', border: '1.5px solid var(--accent-border)', borderRadius: 'var(--radius-xl)', padding: isMobile ? '24px 20px' : '32px 36px' }}>
            <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 8px', fontFamily: 'var(--font-body)' }}>
                Net balance · {MONTH_NAMES[month]}
            </p>
            {dataLoading ? (
                <Skeleton width="320px" height={56} borderRadius={6} style={{ marginBottom: '12px' }} />
            ) : (
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: isMobile ? '28px' : '38px', fontWeight: 800, color: heroNet >= 0 ? 'var(--text-primary)' : 'var(--color-exp)', margin: '0 0 12px', letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', lineHeight: 1, animation: 'numberReveal 400ms cubic-bezier(0.22,1,0.36,1) both' }}>
                    {heroNet >= 0 ? '' : '−'}{fmt(Math.abs(heroNet))}
                </p>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '20px' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 10px', borderRadius: '20px', background: heroNet >= 0 ? 'color-mix(in srgb, var(--color-inc) 12%, transparent)' : 'color-mix(in srgb, var(--color-exp) 12%, transparent)' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', fontWeight: 600, color: heroNet >= 0 ? 'var(--color-inc)' : 'var(--color-exp)', fontVariantNumeric: 'tabular-nums' }}>
                        {heroNet >= 0 ? '+' : ''}{fmt(heroNet)} this month
                    </span>
                </div>
                <p style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-muted)', margin: 0, fontVariantNumeric: 'tabular-nums' }}>
                    {fmt(heroIncome)} in · {fmt(heroExpenses)} out
                </p>
            </div>

            {/* ── AI INSIGHT — above chart ── */}
            {!aiLoading && aiInsight && (
                <div style={{ borderTop: '1px solid color-mix(in srgb, var(--accent-border) 50%, transparent)', paddingTop: '16px', marginBottom: '16px', display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                    <Sparkles size={14} color="var(--accent)" style={{ flexShrink: 0, marginTop: '2px' }} />
                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0, fontFamily: 'var(--font-body)', flex: 1 }}>
                        {aiInsight}
                    </p>
                    <button type="button" title="Refresh AI insight"
                        onClick={async () => {
                            setAiReportLoading(true);
                            try {
                                const AI_KEY   = `ai-report-v2-${user?.id}-${month}-${year}`;
                                const AI_FP_KEY = `ai-fp-v2-${user?.id}-${month}-${year}`;
                                try { localStorage.removeItem(AI_KEY); localStorage.removeItem(AI_FP_KEY); } catch {}
                                const res = await aiAPI.report();
                                const report = res.data?.report ?? '';
                                setAiInsight(report);
                                if (report && summary) {
                                    const fp = `${summary.total_income}-${summary.total_expenses}-${month}-${year}`;
                                    try { localStorage.setItem(AI_KEY, JSON.stringify({ report })); localStorage.setItem(AI_FP_KEY, fp); } catch {}
                                }
                            } catch { setAiInsight('Unable to generate right now — try again shortly.'); }
                            finally { setAiReportLoading(false); }
                        }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '2px', display: 'flex', flexShrink: 0, opacity: aiReportLoading ? 0.5 : 1 }}>
                        <RefreshCw size={13} style={{ animation: aiReportLoading ? 'spin 0.7s linear infinite' : 'none' }} />
                    </button>
                </div>
            )}
            {(aiLoading || aiReportLoading) && !aiInsight && (
                <div style={{ borderTop: '1px solid color-mix(in srgb, var(--accent-border) 50%, transparent)', paddingTop: '16px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Sparkles size={14} color="var(--accent)" style={{ flexShrink: 0 }} />
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>Generating your monthly AI summary…</span>
                </div>
            )}

            {/* 6-month trend */}
            <p style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 8px', fontFamily: 'var(--font-body)' }}>
                6-month trend
            </p>
            {dataLoading ? (
                <Skeleton width="100%" height={50} borderRadius={6} />
            ) : (
                <BezierSparkline data={sparklineData} incColor={incColor} expColor={expColor} />
            )}
        </div>
    );

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <AppLayout>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', paddingBottom: '24px', animation: 'fadeUp 200ms ease forwards' }}>

                {/* ── PAGE HEADER (no card) ── */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <div>
                        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: isMobile ? '20px' : '24px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>
                            {greeting} 👋
                        </h1>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                            <button onClick={goToPrevMonth} style={{ display: 'flex', alignItems: 'center', padding: '2px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', borderRadius: '4px' }} aria-label="Previous month">
                                <ChevronLeft size={14} />
                            </button>
                            <span style={{ fontSize: '13px', color: 'var(--text-muted)', fontFamily: 'var(--font-body)', userSelect: 'none' }}>
                                {MONTH_NAMES[month]} {year} — Overview
                            </span>
                            <button onClick={goToNextMonth} disabled={isCurrentMonth} style={{ display: 'flex', alignItems: 'center', padding: '2px', background: 'none', border: 'none', cursor: isCurrentMonth ? 'default' : 'pointer', color: isCurrentMonth ? 'var(--border-subtle)' : 'var(--text-muted)', borderRadius: '4px' }} aria-label="Next month">
                                <ChevronRight size={14} />
                            </button>
                        </div>
                    </div>
                </div>

                {/* ── COACH ALERTS ── */}
                {coachEnabled && (
                    <CoachAlerts
                        summary={summary}
                        budgets={budgets}
                        goals={goals}
                        loading={dataLoading}
                    />
                )}

                {/* ── WEEKLY REGRET CHECK (portal, shows once/week) ── */}
                <RegretCheckSheet />

                {isMobile && netBalanceHero}

                {/* ── STAT TILES — 4×2 grid (desktop) / 2×3 (mobile) ── */}
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: '12px' }}>
                    {(() => {
                        // Row 1
                        const investColor = !investmentRatio
                            ? 'var(--text-muted)'
                            : investmentRatio.ratio_pct >= 20 ? 'var(--color-inc)' : investmentRatio.ratio_pct >= 10 ? 'var(--color-warn)' : 'var(--color-exp)';

                        const runwayColor  = runway >= 0 ? 'var(--color-inc)' : 'var(--color-exp)';
                        const burnColor    = dailyBurn === 0 ? 'var(--text-muted)' : dailyBurn > (summary?.total_income ?? 0) / daysInMonth ? 'var(--color-exp)' : 'var(--color-warn)';

                        const tiles = [
                            // ── Row 1 ──
                            { label: 'Total Income',   value: fmt(heroIncome),   sub: MONTH_NAMES[month],          color: 'var(--color-inc)', Icon: TrendingUp   },
                            { label: 'Total Expenses', value: fmt(heroExpenses), sub: MONTH_NAMES[month],          color: 'var(--color-exp)', Icon: TrendingDown },
                            { label: 'Net Balance',    value: fmt(Math.abs(heroNet)), sub: netBalance < 0 ? 'Deficit' : 'All time', color: 'var(--accent)', Icon: Wallet },
                            { label: 'Savings Rate',   value: `${savingsPct}%`, sub: savingsBadge.label,           color: savingsBadge.color, Icon: Award        },
                            // ── Row 2 ──
                            {
                                label: 'Investing This Month',
                                value: !investmentRatio ? 'N/A' : investmentRatio.income_this_month === 0 ? 'N/A' : `${Math.round(investmentRatio.ratio_pct)}%`,
                                sub: investmentRatio ? `${fmt(investmentRatio.invested_this_month)} of ${fmt(investmentRatio.income_this_month)} income` : 'No investment data',
                                color: investColor, Icon: PiggyBank,
                            },
                            {
                                label: 'Days Remaining',
                                value: dataLoading ? '—' : `${daysLeft}d left`,
                                sub: runway === 0 ? `${fmt(0)} runway` : `${fmt(Math.abs(runway))} ${runway >= 0 ? 'remaining' : 'deficit'}`,
                                color: runwayColor, Icon: CalendarClock,
                            },
                            {
                                label: 'Daily Burn',
                                value: dataLoading ? '—' : dailyBurn === 0 ? fmt(0) : fmt(dailyBurn),
                                sub: 'per day so far',
                                color: burnColor, Icon: Flame,
                            },
                            {
                                label: 'Financial Weather',
                                value: dataLoading ? '—' : financialWeather.label,
                                sub: financialWeather.sub,
                                color: financialWeather.color, Icon: financialWeather.Icon,
                            },
                        ];

                        const visibleTiles = isMobile
                            ? tiles.filter(t => t.label !== 'Net Balance' && t.label !== 'Investing This Month')
                            : tiles;

                        return visibleTiles.map(tile => (
                            <div key={tile.label} style={{
                                background: `color-mix(in srgb, ${tile.color} 10%, var(--bg-surface-1))`,
                                border: `1px solid color-mix(in srgb, ${tile.color} 22%, transparent)`,
                                borderRadius: 'var(--radius-lg)', padding: '16px 18px', position: 'relative', overflow: 'hidden',
                            }}>
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
                                <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)', lineHeight: 1.4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tile.sub}</p>
                            </div>
                        ));
                    })()}
                </div>

                {/* ── GUILT-FREE BUDGET CARD ── */}
                {!dataLoading && guiltFreeData && (
                    <div style={{ background: guiltFreeData.remaining > 0 ? 'color-mix(in srgb, var(--color-inc) 8%, var(--bg-surface-1))' : 'color-mix(in srgb, var(--color-warn) 8%, var(--bg-surface-1))', border: `1px solid ${guiltFreeData.remaining > 0 ? 'color-mix(in srgb, var(--color-inc) 22%, transparent)' : 'color-mix(in srgb, var(--color-warn) 22%, transparent)'}`, borderRadius: 'var(--radius-lg)', padding: '16px 20px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                            <div>
                                <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 4px', fontFamily: 'var(--font-body)' }}>
                                    Guilt-free budget
                                </p>
                                <p style={{ fontFamily: 'var(--font-mono)', fontSize: '22px', fontWeight: 800, color: guiltFreeData.remaining > 0 ? 'var(--color-inc)' : 'var(--color-warn)', margin: 0, fontVariantNumeric: 'tabular-nums', animation: 'numberReveal 400ms cubic-bezier(0.22,1,0.36,1) both' }}>
                                    {fmt(guiltFreeData.remaining)}
                                </p>
                            </div>
                            <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '0 0 2px', fontFamily: 'var(--font-body)' }}>pool</p>
                                <p style={{ fontFamily: 'var(--font-mono)', fontSize: '15px', fontWeight: 700, color: 'var(--text-secondary)', margin: 0, fontVariantNumeric: 'tabular-nums' }}>{fmt(guiltFreeData.pool)}</p>
                            </div>
                        </div>
                        {/* Progress bar */}
                        <div style={{ height: 6, background: 'var(--bg-surface-2)', borderRadius: 99, overflow: 'hidden', marginBottom: '8px' }}>
                            <div style={{ height: '100%', width: `${guiltFreeData.usedPct}%`, background: guiltFreeData.usedPct > 80 ? 'var(--color-warn)' : 'var(--color-inc)', borderRadius: 99, transition: 'width 0.6s ease' }} />
                        </div>
                        <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)', lineHeight: 1.5 }}>
                            {fmt(guiltFreeData.income)} income − {fmt(guiltFreeData.totalBudgeted)} budgets{guiltFreeData.goalMonthly > 0 ? ` − ${fmt(guiltFreeData.goalMonthly)} goals` : ''} = {fmt(guiltFreeData.pool)} pool
                            {guiltFreeData.unbudgetedSpent > 0 && ` · ${fmt(guiltFreeData.unbudgetedSpent)} spent outside budgets`}
                        </p>
                    </div>
                )}

                {!isMobile && netBalanceHero}

                {/* ── WEEKLY BRIEFING WIDGET ── */}
                {showBriefing && (
                    <div style={{ background: 'var(--bg-surface-1)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: '18px 20px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                            <div>
                                <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 2px' }}>Your Weekly Brief</h2>
                                <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)' }}>
                                    Week of {new Date((briefing.week_of || '').split('T')[0] + 'T00:00:00').toLocaleDateString('en-IN', { month: 'long', day: 'numeric' })}
                                </p>
                            </div>
                            <Sparkles size={16} color="var(--accent)" />
                        </div>

                        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6, margin: '0 0 14px', fontFamily: 'var(--font-body)' }}>
                            {(() => {
                                const narrative: string = briefing.narrative || '';
                                if (briefingExpanded) return narrative;
                                const sentences = narrative.match(/[^.!?]+[.!?]+/g) || [narrative];
                                const truncated = sentences.slice(0, 2).join(' ').trim();
                                return sentences.length > 2 ? `${truncated}...` : truncated;
                            })()}
                        </p>

                        {Array.isArray(briefing.points) && briefing.points.length > 0 && (
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '14px' }}>
                                {briefing.points.map((pt: any) => (
                                    <div key={pt.key} style={{ padding: '6px 12px', borderRadius: '20px', background: 'var(--bg-surface-2)', border: '1px solid var(--border-subtle)' }}>
                                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>{pt.label}: </span>
                                        <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{pt.value}</span>
                                    </div>
                                ))}
                            </div>
                        )}

                        {briefing.action_of_the_week && (
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 14px', borderRadius: 'var(--radius-lg)', background: 'color-mix(in srgb, var(--color-warn) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--color-warn) 22%, transparent)', marginBottom: '10px' }}>
                                <Lightbulb size={16} color="var(--color-warn)" style={{ flexShrink: 0, marginTop: '1px' }} />
                                <p style={{ fontSize: '13px', color: 'var(--text-primary)', margin: 0, fontFamily: 'var(--font-body)' }}>
                                    <strong>This week:</strong> {briefing.action_of_the_week}
                                </p>
                            </div>
                        )}

                        <button type="button" onClick={() => setBriefingExpanded(v => !v)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', color: 'var(--accent)', fontWeight: 600, padding: 0, fontFamily: 'var(--font-body)' }}>
                            {briefingExpanded ? 'Show less' : 'View full brief'}
                        </button>
                    </div>
                )}

                {/* ── DEBT ALERTS ── */}
                {!utilAlertDismissed && creditUtilization && creditUtilization.aggregate.overall_utilization_pct > 50 && (
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 14px', borderRadius: 'var(--radius-lg)', background: 'color-mix(in srgb, var(--color-exp) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--color-exp) 22%, transparent)' }}>
                        <AlertTriangle size={16} color="var(--color-exp)" style={{ flexShrink: 0, marginTop: '1px' }} />
                        <div style={{ flex: 1 }}>
                            <p style={{ fontSize: '13px', color: 'var(--text-primary)', margin: '0 0 4px', fontFamily: 'var(--font-body)' }}>
                                Your credit utilization is above 50%. This may affect your credit score and loan eligibility.
                            </p>
                            <Link href="/net-worth" style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-exp)', textDecoration: 'none', fontFamily: 'var(--font-body)' }}>
                                Pay down credit →
                            </Link>
                        </div>
                        <button type="button" onClick={() => setUtilAlertDismissed(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '2px', display: 'flex' }}>
                            <X size={14} />
                        </button>
                    </div>
                )}
                {!dtiAlertDismissed && dti && dti.dti_ratio > 35 && (
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 14px', borderRadius: 'var(--radius-lg)', background: 'color-mix(in srgb, var(--color-warn) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--color-warn) 22%, transparent)' }}>
                        <AlertTriangle size={16} color="var(--color-warn)" style={{ flexShrink: 0, marginTop: '1px' }} />
                        <div style={{ flex: 1 }}>
                            <p style={{ fontSize: '13px', color: 'var(--text-primary)', margin: '0 0 4px', fontFamily: 'var(--font-body)' }}>
                                Your debt obligations are taking up over 35% of your income. Consider the payoff optimizer to accelerate debt freedom.
                            </p>
                            <Link href="/debt-intelligence" style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-warn)', textDecoration: 'none', fontFamily: 'var(--font-body)' }}>
                                View optimizer →
                            </Link>
                        </div>
                        <button type="button" onClick={() => setDtiAlertDismissed(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '2px', display: 'flex' }}>
                            <X size={14} />
                        </button>
                    </div>
                )}

                {/* ── FINANCIAL HEALTH DETAILS (collapsed by default) ── */}
                <div style={{ background: 'var(--bg-surface-1)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
                    <button
                        type="button"
                        onClick={() => setHealthDetailsOpen(v => !v)}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '14px 20px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                    >
                        <span style={{ fontFamily: 'var(--font-display)', fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>Financial Health Details</span>
                        <ChevronDown size={16} color="var(--text-muted)" style={{ transform: healthDetailsOpen ? 'rotate(180deg)' : 'none', transition: 'transform var(--transition-fast)' }} />
                    </button>
                    {healthDetailsOpen && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '0 20px 20px' }}>
                            {(accounts.length > 0 || investments.length > 0) && <NetWorthWidget />}
                            {investments.length > 0 && (
                                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)', gap: '16px' }}>
                                    <WealthVelocityWidget />
                                    <AssetAllocationWidget />
                                </div>
                            )}
                            {(activeLoanCount > 0 || (creditUtilization?.per_card?.length ?? 0) > 0) && (
                                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)', gap: '16px' }}>
                                    <CreditUtilizationWidget />
                                    <DtiWidget hasLoans={activeLoanCount > 0} hasCards={(creditUtilization?.per_card?.length ?? 0) > 0} />
                                </div>
                            )}
                            <HealthScoreWidget
                                summary={summary}
                                budgets={budgets}
                                goals={goals}
                                trends={trends}
                                loading={dataLoading}
                                investmentRatio={investmentRatio}
                                dti={dti}
                                creditUtilization={creditUtilization}
                            />
                        </div>
                    )}
                </div>

                {/* ── OPPORTUNITIES (collapsed by default) ── */}
                {opportunities.length > 0 && (
                    <div style={{ background: 'var(--bg-surface-1)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
                        <button
                            type="button"
                            onClick={() => setOpportunitiesOpen(v => !v)}
                            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '14px 20px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontFamily: 'var(--font-display)', fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>Opportunities</span>
                                <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--accent)', background: 'var(--accent-subtle)', padding: '1px 8px', borderRadius: '20px', fontFamily: 'var(--font-mono)' }}>
                                    {opportunities.length}
                                </span>
                            </div>
                            <ChevronDown size={16} color="var(--text-muted)" style={{ transform: opportunitiesOpen ? 'rotate(180deg)' : 'none', transition: 'transform var(--transition-fast)' }} />
                        </button>
                        {opportunitiesOpen && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '0 16px 16px' }}>
                                {opportunities.slice(0, 3).map((opp: any) => {
                                    const borderColor = opp.priority === 1 ? 'var(--color-exp)' : opp.priority === 2 ? 'var(--color-warn)' : 'var(--text-muted)';
                                    const isDismissing = dismissingIds.has(opp.id);
                                    return (
                                        <div key={opp.id} style={{
                                            background: 'var(--bg-surface-2)', border: '1px solid var(--border-subtle)', borderLeft: `3px solid ${borderColor}`,
                                            borderRadius: 'var(--radius-lg)', padding: '14px 16px',
                                            opacity: isDismissing ? 0 : 1, transform: isDismissing ? 'translateX(8px)' : 'none',
                                            transition: 'opacity 250ms ease, transform 250ms ease',
                                        }}>
                                            <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px', fontFamily: 'var(--font-body)' }}>
                                                {opp.title}
                                            </p>
                                            <p style={{
                                                fontSize: '12px', color: 'var(--text-muted)', margin: '0 0 10px', fontFamily: 'var(--font-body)',
                                                display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                                            }}>
                                                {opp.description}
                                            </p>
                                            {opp.amount_saved != null && (
                                                <div style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 10px', borderRadius: '20px', background: 'color-mix(in srgb, var(--color-inc) 10%, transparent)', marginBottom: '10px' }}>
                                                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', fontWeight: 600, color: 'var(--color-inc)' }}>
                                                        Save {fmt(parseFloat(opp.amount_saved))}/year
                                                    </span>
                                                </div>
                                            )}
                                            <div style={{ display: 'flex', gap: '8px', marginTop: opp.amount_saved != null ? 0 : '4px' }}>
                                                <Button size="sm" onClick={() => handleActOnOpportunity(opp)}>{opp.action_label}</Button>
                                                <Button size="sm" variant="ghost" onClick={() => handleDismissOpportunity(opp.id)}>Dismiss</Button>
                                            </div>
                                        </div>
                                    );
                                })}
                                {opportunities.length > 3 && (
                                    <Link href="/insights" style={{ fontSize: '12px', fontWeight: 600, color: 'var(--accent)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px', fontFamily: 'var(--font-body)', paddingTop: '4px' }}>
                                        See all <ChevronRight size={12} />
                                    </Link>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* ── 3-COLUMN: BUDGETS / CATEGORIES / RECENT TRANSACTIONS ── */}
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: '16px' }}>

                    {/* Budgets */}
                    <div style={{ background: 'var(--bg-surface-1)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: '18px 20px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: budgets.length > 0 ? '14px' : '0' }}>
                            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Budgets</h2>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                {overBudget > 0 && (
                                    <span style={{ fontSize: '11px', color: 'var(--color-exp)', background: 'color-mix(in srgb, var(--color-exp) 10%, transparent)', padding: '2px 8px', borderRadius: '20px', fontFamily: 'var(--font-body)' }}>
                                        {overBudget} over
                                    </span>
                                )}
                                <button type="button" onClick={() => router.push('/budgets')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', color: 'var(--accent)', fontWeight: 600, padding: 0, fontFamily: 'var(--font-body)' }}>
                                    See all →
                                </button>
                            </div>
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

                    {/* Categories (top spending breakdown) */}
                    <div style={{ background: 'var(--bg-surface-1)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: '18px 20px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: topCategories.length > 0 ? '14px' : '0' }}>
                            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Top Categories</h2>
                            <button type="button" onClick={() => router.push('/analytics')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', color: 'var(--accent)', fontWeight: 600, padding: 0, fontFamily: 'var(--font-body)' }}>
                                See all →
                            </button>
                        </div>
                        {dataLoading ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {[1,2,3].map(i => <div key={i}><Skeleton width="60%" height={12} borderRadius={4} style={{ marginBottom: '6px' }} /><Skeleton width="100%" height={5} borderRadius={999} /></div>)}
                            </div>
                        ) : topCategories.length === 0 ? (
                            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0, fontFamily: 'var(--font-body)' }}>No spending data yet</p>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {topCategories.map((b: any) => {
                                    const pct = parseFloat(b.amount) > 0 ? Math.round((parseFloat(b.spent) / parseFloat(b.amount)) * 100) : 0;
                                    return (
                                        <div key={b.id ?? b.category_id}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '5px' }}>
                                                <div style={{ width: 7, height: 7, borderRadius: '50%', background: b.category_color || expColor, flexShrink: 0 }} />
                                                <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-primary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'var(--font-body)' }}>{b.name ?? b.category_name}</span>
                                                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{fmt(parseFloat(b.spent))}</span>
                                            </div>
                                            <ProgressBar pct={pct} height={4} color={b.category_color || expColor} />
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Recent Transactions */}
                    <div style={{ background: 'var(--bg-surface-1)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 20px', paddingBottom: transactions.length === 0 && !dataLoading ? '18px' : '14px' }}>
                            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Recent Transactions</h2>
                            <button type="button" onClick={() => router.push('/transactions')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', color: 'var(--accent)', fontWeight: 600, padding: 0, fontFamily: 'var(--font-body)' }}>
                                View all →
                            </button>
                        </div>
                        {dataLoading ? (
                            [1,2,3,4,5].map(i => (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 20px', borderTop: '1px solid var(--border-subtle)' }}>
                                    <Skeleton width={32} height={32} borderRadius={999} />
                                    <div style={{ flex: 1 }}>
                                        <Skeleton width="55%" height={12} borderRadius={4} style={{ marginBottom: '6px' }} />
                                        <Skeleton width="35%" height={10} borderRadius={4} />
                                    </div>
                                    <Skeleton width={60} height={14} borderRadius={4} />
                                </div>
                            ))
                        ) : transactions.length === 0 ? (
                            <p style={{ fontSize: '13px', color: 'var(--text-muted)', padding: '0 20px 18px', textAlign: 'center', margin: 0, fontFamily: 'var(--font-body)' }}>
                                No transactions yet — add your first one!
                            </p>
                        ) : (
                            transactions.slice(0, 5).map((tx: any) => {
                                const amount   = parseFloat(String(tx.amount));
                                const isIncome = tx.type === 'income';
                                return (
                                    <div key={tx.id} onClick={() => router.push('/transactions')}
                                        style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 20px', borderTop: '1px solid var(--border-subtle)', cursor: 'pointer', transition: 'background var(--transition-fast)' }}
                                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-surface-3)'; }}
                                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
                                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--bg-surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '15px' }}>
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
                        {transactions.length > 0 && <div style={{ paddingBottom: '8px' }} />}
                    </div>
                </div>

            </div>
        </AppLayout>
    );
}
