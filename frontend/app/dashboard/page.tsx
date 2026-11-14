'use client';

import { useEffect, useState, useMemo, useRef, useCallback, type ReactNode, type RefObject } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { RefreshCw, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useDashboardData, useAccounts, useUserQuery } from '@/hooks/queries';
import { analyticsAPI, investmentAPI, debtAPI, loanAPI, opportunityAPI, briefingAPI, dailyBriefingAPI } from '@/lib/api';
import { fmt, getSmartIcon } from '@/lib/utils';
import { getCached, setCached } from '@/lib/apiCache';
import { CountUp } from '@/components/ui/CountUp';
import { useIsMobile } from '@/hooks/useWindowSize';
import { useThemeStore } from '@/store/themeStore';
import { toast } from '@/store/toastStore';
import { loadErrorMessage } from '@/lib/loadErrorMessage';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Card } from '@/components/ui/Card';
import { CardHeader, TextAction, Rows, NoticeRow, Stat, StatusDot, type Tone } from '@/components/ui/CardParts';
import { type, truncate } from '@/lib/typography';
import { Skeleton, SkeletonCard } from '@/components/ui/Skeleton';
import { PullToRefreshIndicator } from '@/components/ui/PullToRefreshIndicator';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { HealthScoreWidget } from '@/components/dashboard/HealthScoreWidget';
import { calculateHealthScore, monthlySeriesFromTrends } from '@/lib/healthScore';
import { DtiWidget } from '@/components/dashboard/DtiWidget';
import { useCoachAlerts } from '@/components/coach/CoachAlerts';
import { toAmount } from '@/types/finance';

// Lazy-loaded: each of these pulls in recharts, same pattern as
// app/analytics/page.tsx's dynamic imports -- keeps recharts out of the
// dashboard's initial bundle until these widgets actually render.
const vizSkeleton = (h: number) => {
    const VizSkeleton = () => <div style={{ height: h, background: 'var(--glass-fill-1)', borderRadius: 8 }} />;
    VizSkeleton.displayName = 'VizSkeleton';
    return VizSkeleton;
};
const NetWorthWidget = dynamic(() => import('@/components/dashboard/NetWorthWidget').then(m => m.NetWorthWidget), { ssr: false, loading: vizSkeleton(120) });
const WealthVelocityWidget = dynamic(() => import('@/components/dashboard/WealthVelocityWidget').then(m => m.WealthVelocityWidget), { ssr: false, loading: vizSkeleton(120) });
const AssetAllocationWidget = dynamic(() => import('@/components/dashboard/AssetAllocationWidget').then(m => m.AssetAllocationWidget), { ssr: false, loading: vizSkeleton(120) });
const CreditUtilizationWidget = dynamic(() => import('@/components/dashboard/CreditUtilizationWidget').then(m => m.CreditUtilizationWidget), { ssr: false, loading: vizSkeleton(120) });

// Shared empty list (stable identity for memo deps); never[] so each use
// takes the type of the data it stands in for.
const NO_ROWS: never[] = [];

const MONTH_NAMES = ['', 'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
const MONTH_SHORT = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

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
            <p style={{ ...type.meta, margin: 0 }}>No data yet</p>
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
                        stroke="var(--border-visible)" strokeWidth={1} />
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
                    <p style={{ ...type.micro, margin: '0 0 4px' }}>{data[tipIdx].month}</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <span style={{ ...type.numSmall, color: 'var(--color-inc-text)' }}>↑ {fmt(data[tipIdx].income)}</span>
                        <span style={{ ...type.numSmall, color: 'var(--color-exp-text)' }}>↓ {fmt(data[tipIdx].expenses)}</span>
                    </div>
                </div>
            )}
            {/* Month labels aligned to data points */}
            <div style={{ position: 'relative', height: '16px', marginTop: '4px' }}>
                {data.map((d, i) => {
                    const xPct = n === 1 ? 50 : (i / (n - 1)) * 100;
                    return (
                        <span key={i} style={{
                            ...type.micro,
                            position: 'absolute',
                            left: `${xPct}%`,
                            // End labels hug the chart's edges instead of overhanging the card.
                            transform: i === 0 && n > 1 ? 'none' : i === n - 1 && n > 1 ? 'translateX(-100%)' : 'translateX(-50%)',
                            whiteSpace: 'nowrap',
                        }}>{d.month}</span>
                    );
                })}
            </div>
            {/* No legend here: the in / out line beside the net figure carries it. */}
        </div>
    );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
    const router = useRouter();
    const { user, isLoading, loadFromStorage } = useAuthStore();
    const { theme } = useThemeStore();
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

    // Summary, trends, recent transactions, budgets and goals for the month,
    // from the shared query cache (persisted, so a cold app start shows the
    // last numbers while Render wakes up). Saving a transaction anywhere
    // refreshes this in the background; the skeleton shows only when there is
    // nothing cached for the month yet.
    const dashQuery = useDashboardData(month, year);
    const summary      = dashQuery.data?.summary ?? null;
    const trends       = dashQuery.data?.trends ?? NO_ROWS;
    const transactions = dashQuery.data?.transactions ?? NO_ROWS;
    const budgets      = dashQuery.data?.budgets ?? NO_ROWS;
    const goals        = dashQuery.data?.goals ?? NO_ROWS;
    const dataLoading  = dashQuery.isPending;
    // Bumped by mobile pull-to-refresh to re-run the opportunities/briefing
    // fetch effect below.
    const [refreshKey, setRefreshKey] = useState(0);

    // Accounts and the secondary widgets live in the shared query cache, not
    // their own localStorage TTL cache, so a transaction save (which marks
    // every query stale) refreshes balances and ratios too -- they used to
    // stay up to 15 minutes old. allSettled: one failing call blanks only
    // its own widget.
    const accountsQuery = useAccounts();
    const extrasQuery = useUserQuery('dashboard-extras', [], async () => {
        const [inv, ratio, util, dtiRes, loans] = await Promise.allSettled([
            investmentAPI.getAll(), analyticsAPI.getInvestmentRatio(), debtAPI.getCreditUtilization(),
            debtAPI.getDti(), loanAPI.getAll(true),
        ]);
        const ok = <T,>(r: PromiseSettledResult<{ data: T }>) => (r.status === 'fulfilled' ? r.value.data : null);
        return {
            investments:       (ok<any>(inv)?.investments ?? []) as any[],
            investmentRatio:   ok<any>(ratio),
            creditUtilization: ok<any>(util),
            dti:               ok<any>(dtiRes),
            activeLoanCount:   ((ok<any>(loans)?.loans ?? []) as any[]).length,
        };
    });
    const accounts          = accountsQuery.data ?? NO_ROWS;
    const investments       = extrasQuery.data?.investments ?? NO_ROWS;
    const investmentRatio   = extrasQuery.data?.investmentRatio ?? null;
    const creditUtilization = extrasQuery.data?.creditUtilization ?? null;
    const dti               = extrasQuery.data?.dti ?? null;
    const activeLoanCount   = extrasQuery.data?.activeLoanCount ?? 0;

    // Pull-to-refresh is the user explicitly asking for fresh data: refetch
    // everything on the page, resolving when the month bundle lands.
    const refetchDashboard = dashQuery.refetch;
    const refetchAccounts  = accountsQuery.refetch;
    const refetchExtras    = extrasQuery.refetch;
    useEffect(() => {
        if (dashQuery.isError && !dashQuery.data) toast.error(loadErrorMessage(dashQuery.error, 'Dashboard data'));
    }, [dashQuery.isError, dashQuery.data, dashQuery.error]);
    const handleDashboardRefresh = useCallback(() => {
        setRefreshKey(k => k + 1);
        refetchAccounts();
        refetchExtras();
        return refetchDashboard().then(() => {});
    }, [refetchDashboard, refetchAccounts, refetchExtras]);
    const { containerRef: pullToRefreshRef, pullDistance, refreshing: ptrRefreshing } = usePullToRefresh(handleDashboardRefresh, isMobile);
    const [dailyBrief, setDailyBrief]   = useState<any>(null);
    const [dailyBriefLoading, setDailyBriefLoading] = useState(true);
    // Distinct from "haven't loaded one yet" -- a failed fetch used to just
    // set dailyBrief to null, which is indistinguishable from "nothing to
    // show," so the whole card silently disappeared with no way to tell why.
    const [dailyBriefError, setDailyBriefError] = useState(false);
    const [dailyBriefRefreshing, setDailyBriefRefreshing] = useState(false);
    const [dailyBriefCooldown, setDailyBriefCooldown] = useState(0);
    const dailyBriefCooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const dailyBriefRefreshTimesRef = useRef<number[]>([]);
    const [coachEnabled, setCoachEnabled] = useState(true);
    const [utilAlertDismissed, setUtilAlertDismissed] = useState(false);
    const [dtiAlertDismissed, setDtiAlertDismissed] = useState(false);
    const [opportunities, setOpportunities] = useState<any[]>([]);
    const [dismissingIds, setDismissingIds] = useState<Set<string>>(new Set());
    const [briefing, setBriefing] = useState<any>(null);
    const [briefingExpanded, setBriefingExpanded] = useState(false);
    const [healthDetailsOpen, setHealthDetailsOpen] = useState(false);
    const [opportunitiesOpen, setOpportunitiesOpen] = useState(false);
    const [briefTab, setBriefTab] = useState<'today' | 'week'>('today');
    // Coach alerts render as rows in the Brief card (see briefCard below).
    const coach = useCoachAlerts({ summary, budgets, goals, loading: dataLoading }, coachEnabled);

    // Chart colours (read from CSS vars) -- initial/fallback values match
    // DESIGN.md's --color-inc/--color-exp dark-theme (default) tokens.
    const [incColor, setIncColor] = useState('#16a34a');
    const [expColor, setExpColor] = useState('#dc2626');

    useEffect(() => {
        const s = getComputedStyle(document.documentElement);
        setIncColor(s.getPropertyValue('--color-inc').trim() || '#16a34a');
        setExpColor(s.getPropertyValue('--color-exp').trim() || '#dc2626');
    }, [theme]);

    // Hero figures -- rendered through <CountUp>, which animates them without
    // re-rendering this page on every frame.
    const heroIncome   = Number(summary?.total_income   ?? 0);
    const heroExpenses = Number(summary?.total_expenses ?? 0);
    const heroNet      = heroIncome - heroExpenses;

    const hour     = new Date().getHours();
    const greeting = `Good ${hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'}, ${user?.full_name?.split(' ')[0] ?? 'there'}`;
    const savingsPct = summary && summary.total_income > 0
        ? Math.max(0, Math.round(((summary.total_income - summary.total_expenses) / summary.total_income) * 100))
        : 0;

    // Stat-strip computed values
    const today       = new Date();
    const daysInMonth = new Date(year, month, 0).getDate();
    const daysElapsed = isCurrentMonth ? Math.max(today.getDate(), 1) : daysInMonth;
    const daysLeft    = isCurrentMonth ? daysInMonth - today.getDate() : 0;
    const runway      = (summary?.total_income ?? 0) - (summary?.total_expenses ?? 0);
    const dailyBurn   = (summary?.total_expenses ?? 0) / daysElapsed;

    // ── Health Score teaser — same engine as the Insights → Health tab ──
    const healthScoreTeaser = useMemo(() => {
        const income   = Number(summary?.total_income   ?? 0);
        const expenses = Number(summary?.total_expenses ?? 0);
        const hasData = income > 0 || expenses > 0 || budgets.length > 0 || goals.length > 0 || trends.length > 0;
        if (!hasData) return null;

        return calculateHealthScore({
            income, expenses, budgets, goals,
            ...monthlySeriesFromTrends(trends),
            investedThisMonth: investmentRatio?.invested_this_month ?? 0,
            dtiRatio:          dti?.dti_ratio ?? 0,
            ccUtilizationPct:  creditUtilization?.aggregate?.overall_utilization_pct ?? 0,
        });
    }, [summary, budgets, goals, trends, investmentRatio, dti, creditUtilization]);

    function startDailyBriefCooldown(seconds = 60) {
        setDailyBriefCooldown(seconds);
        dailyBriefCooldownRef.current = setInterval(() => {
            setDailyBriefCooldown(prev => { if (prev <= 1) { clearInterval(dailyBriefCooldownRef.current!); return 0; } return prev - 1; });
        }, 1000);
    }
    useEffect(() => { return () => { if (dailyBriefCooldownRef.current) clearInterval(dailyBriefCooldownRef.current); }; }, []);

    useEffect(() => { loadFromStorage(); }, []);
    useEffect(() => { if (!isLoading && !user) router.push('/login'); }, [user, isLoading]);
    useEffect(() => {
        const val = localStorage.getItem('fintrack-coach-enabled');
        setCoachEnabled(val === null ? true : val === 'true');
    }, [month, year]);

    useEffect(() => {
        if (!user) return;
        // Opportunities is a single cheap SELECT (detection runs on a daily
        // cron), and the briefing has its own weekly-scoped freshness logic.
        opportunityAPI.getAll().then(res => setOpportunities(res.data?.opportunities ?? [])).catch(() => {});
        briefingAPI.getLatest().then(res => setBriefing(res.data)).catch(() => setBriefing(null));
    }, [user, month, year, refreshKey]);

    // Daily brief — only relevant for the current month/today. The backend only
    // regenerates it once per day (or via the 4x/day intraday cron), but without
    // a client-side cache this still fired a fresh request and showed a loading
    // skeleton on EVERY dashboard open, reading as "regenerating" even though
    // the content was unchanged. Short TTL since the intraday cron can refresh
    // it during the day; skipCache lets the retry button always hit the network.
    const DAILY_BRIEF_TTL = 15 * 60 * 1000;
    const fetchDailyBrief = (opts?: { skipCache?: boolean }) => {
        if (!opts?.skipCache && user) {
            const cached = getCached<any>(`daily-brief-cache-${user.id}`, DAILY_BRIEF_TTL);
            if (cached !== null) {
                setDailyBrief(cached);
                setDailyBriefError(false);
                setDailyBriefLoading(false);
                return;
            }
        }
        setDailyBriefLoading(true);
        setDailyBriefError(false);
        dailyBriefingAPI.getLatest()
            .then(res => {
                setDailyBrief(res.data);
                if (user) setCached(`daily-brief-cache-${user.id}`, res.data);
            })
            .catch(() => { setDailyBrief(null); setDailyBriefError(true); })
            .finally(() => setDailyBriefLoading(false));
    };

    useEffect(() => {
        if (!user || !isCurrentMonth) { setDailyBrief(null); setDailyBriefError(false); setDailyBriefLoading(false); return; }
        fetchDailyBrief();
    }, [user, isCurrentMonth]);

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
    const overBudget = budgets.filter(b => toAmount(b.spent) > toAmount(b.amount)).length;

    // Guilt-free budget computation
    const guiltFreeData = useMemo(() => {
        if (!isCurrentMonth || !summary || summary.total_income <= 0) return null;
        const income = summary.total_income;
        const totalBudgeted = budgets.reduce((s, b) => s + toAmount(b.amount), 0);
        if (totalBudgeted === 0) return null;
        // Set aside this month's share of each dated goal still short of its
        // target (a finished goal has nothing remaining, so it adds nothing).
        const goalMonthly = goals.reduce((s, g) => {
            if (!g.deadline) return s;
            const remaining = toAmount(g.target_amount) - toAmount(g.saved_amount);
            if (remaining <= 0) return s;
            const months = Math.max(1, Math.ceil((new Date(g.deadline).getTime() - Date.now()) / (30.44 * 24 * 3600 * 1000)));
            return s + remaining / months;
        }, 0);
        const pool = Math.max(0, income - totalBudgeted - Math.round(goalMonthly));
        const budgetedSpent = budgets.reduce((s, b) => s + toAmount(b.spent), 0);
        const unbudgetedSpent = Math.max(0, (summary.total_expenses || 0) - budgetedSpent);
        const remaining = Math.max(0, pool - unbudgetedSpent);
        const usedPct = pool > 0 ? Math.min(100, (unbudgetedSpent / pool) * 100) : 0;
        return { income, totalBudgeted, goalMonthly: Math.round(goalMonthly), pool, unbudgetedSpent, remaining, usedPct };
    }, [summary, budgets, goals, isCurrentMonth]);

    if (isLoading || !user) return (
        <>
            <SkeletonCard height={60} style={{ marginBottom: '24px' }} />
            <div className="dash-skeleton-tiles">
                {[1,2,3,4].map(i => <SkeletonCard key={i} height={100} />)}
            </div>
            <SkeletonCard height={220} style={{ marginBottom: '16px' }} />
            <SkeletonCard height={100} style={{ marginBottom: '16px' }} />
            <SkeletonCard height={260} />
        </>
    );

    // ── Brief card inputs ─────────────────────────────────────────────────────
    // One card carries what used to be five blocks: the daily brief, the weekly
    // brief (as a tab), coach alerts, the two debt banners and opportunities.
    const hasDaily  = isCurrentMonth && !!(dailyBriefLoading || dailyBrief || dailyBriefError);
    const hasWeekly = !!showBriefing;
    const activeBriefTab: 'today' | 'week' | null =
        hasDaily && (briefTab === 'today' || !hasWeekly) ? 'today' : hasWeekly ? 'week' : null;

    const utilPct  = creditUtilization?.aggregate?.overall_utilization_pct ?? 0;
    const showUtil = !utilAlertDismissed && utilPct > 50;
    const showDti  = !dtiAlertDismissed && !!dti && dti.dti_ratio > 35;
    const oppSavings = opportunities.reduce((s: number, o: any) => s + (o.amount_saved != null ? parseFloat(o.amount_saved) || 0 : 0), 0);

    const todayAction = activeBriefTab === 'today' ? dailyBrief?.action_of_the_day : null;
    const weekAction  = activeBriefTab === 'week' ? briefing?.action_of_the_week : null;
    const hasNotices  = !!todayAction || !!weekAction || coach.alerts.length > 0 || showUtil || showDti || opportunities.length > 0;

    const refreshDailyBrief = async () => {
        if (dailyBriefCooldown > 0) return;
        const now = Date.now();
        const recent = dailyBriefRefreshTimesRef.current.filter(t => now - t < 60000);
        if (recent.length >= 2) {
            startDailyBriefCooldown(Math.ceil((60000 - (now - recent[0])) / 1000));
            return;
        }
        setDailyBriefRefreshing(true);
        try {
            const res = await dailyBriefingAPI.generate();
            setDailyBrief(res.data);
            if (user) setCached(`daily-brief-cache-${user.id}`, res.data);
            recent.push(now);
            dailyBriefRefreshTimesRef.current = recent;
            if (recent.length >= 2) {
                startDailyBriefCooldown(Math.ceil((60000 - (now - recent[0])) / 1000));
            }
        } catch (err: any) {
            const wait = err.response?.data?.wait;
            if (wait) startDailyBriefCooldown(wait);
            toast.error(err.response?.data?.error || 'Unable to refresh right now.');
        } finally { setDailyBriefRefreshing(false); }
    };

    const dismissButton = (label: string, onClick: () => void) => (
        <button type="button" className="fin-icon-btn" aria-label={label} onClick={onClick}>
            <X size={14} />
        </button>
    );

    // "Label: value" pairs under a brief's narrative.
    const briefPoints = (points: any[]) => points.length > 0 && (
        <p style={{ ...type.meta, margin: '0 0 var(--space-4)', display: 'flex', flexWrap: 'wrap', gap: '4px var(--space-4)' }}>
            {points.map((pt: any) => (
                <span key={pt.key}>{pt.label}: <span style={{ ...type.numSmall, color: 'var(--text-primary)' }}>{pt.value}</span></span>
            ))}
        </p>
    );

    const briefBody = activeBriefTab === 'today' ? (
        dailyBriefLoading && !dailyBrief ? (
            <Skeleton width="100%" height={60} borderRadius={6} style={{ marginBottom: 'var(--space-4)' }} />
        ) : dailyBriefError && !dailyBrief ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap', marginBottom: hasNotices ? 'var(--space-4)' : 0 }}>
                <p style={{ ...type.body, margin: 0 }}>Couldn&apos;t load today&apos;s brief.</p>
                <TextAction onClick={() => fetchDailyBrief({ skipCache: true })}>Try again</TextAction>
            </div>
        ) : dailyBrief ? (
            <>
                <p style={{ ...type.body, margin: '0 0 var(--space-4)', maxWidth: '68ch' }}>{dailyBrief.narrative}</p>
                {/* Two of the brief's points are shown: today's budget status and the
                    merged bills/risk heads-up. The rest only feed the narrative. */}
                {Array.isArray(dailyBrief.points) && briefPoints(
                    ['today_status', 'heads_up'].map(key => dailyBrief.points.find((pt: any) => pt.key === key)).filter(Boolean),
                )}
            </>
        ) : null
    ) : activeBriefTab === 'week' ? (
        <>
            <p style={{ ...type.body, margin: '0 0 var(--space-2)', maxWidth: '68ch' }}>
                {(() => {
                    const narrative: string = briefing.narrative || '';
                    if (briefingExpanded) return narrative;
                    const sentences = narrative.match(/[^.!?]+[.!?]+/g) || [narrative];
                    const truncated = sentences.slice(0, 2).join(' ').trim();
                    return sentences.length > 2 ? `${truncated}...` : truncated;
                })()}
            </p>
            <div style={{ marginBottom: 'var(--space-2)' }}>
                <TextAction onClick={() => setBriefingExpanded(v => !v)}>{briefingExpanded ? 'Show less' : 'Read full brief'}</TextAction>
            </div>
            {Array.isArray(briefing.points) && briefPoints(briefing.points)}
        </>
    ) : null;

    const briefCard = (activeBriefTab || hasNotices) && (
        <Card className="dash-o3">
            <CardHeader
                title={activeBriefTab ? 'Brief' : 'Needs attention'}
                sub={activeBriefTab === 'today'
                    ? new Date().toLocaleDateString('en-IN', { weekday: 'long', month: 'long', day: 'numeric' })
                    : activeBriefTab === 'week'
                    ? `Week of ${new Date((briefing.week_of || '').split('T')[0] + 'T00:00:00').toLocaleDateString('en-IN', { month: 'long', day: 'numeric' })}`
                    : undefined}
                action={<>
                    {activeBriefTab === 'today' && (
                        <button type="button" className="fin-icon-btn"
                            title={dailyBriefCooldown > 0 ? `Wait ${dailyBriefCooldown}s to refresh again` : 'Refresh daily brief'}
                            aria-label={dailyBriefCooldown > 0 ? `Wait ${dailyBriefCooldown}s to refresh again` : 'Refresh daily brief'}
                            onClick={refreshDailyBrief}
                            disabled={dailyBriefRefreshing || dailyBriefCooldown > 0}>
                            <RefreshCw size={14} style={{ animation: dailyBriefRefreshing ? 'spin 0.7s linear infinite' : 'none' }} />
                        </button>
                    )}
                    {hasDaily && hasWeekly && (
                        <div role="tablist" aria-label="Brief period" style={{ display: 'inline-flex', gap: 2, padding: 2, borderRadius: 'var(--radius-md)', background: 'var(--glass-fill-1)' }}>
                            {(['today', 'week'] as const).map(k => {
                                const on = activeBriefTab === k;
                                return (
                                    <button key={k} type="button" role="tab" aria-selected={on} onClick={() => setBriefTab(k)}
                                        style={{ ...type.label, border: 'none', cursor: 'pointer', padding: '4px 10px', borderRadius: 'var(--radius-sm)', background: on ? 'var(--glass-fill-3)' : 'transparent', color: on ? 'var(--text-primary)' : 'var(--text-secondary)', transition: 'background var(--transition-fast), color var(--transition-fast)' }}>
                                        {k === 'today' ? 'Today' : 'This week'}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </>}
                flush={!briefBody && !hasNotices}
            />

            {briefBody}

            {hasNotices && (
                <Rows style={briefBody ? { borderTop: '1px solid var(--glass-border)', paddingTop: 'var(--space-3)' } : undefined}>
                    {todayAction && <NoticeRow tone="info" title={todayAction} sub="Suggested for today" />}
                    {weekAction && <NoticeRow tone="info" title={weekAction} sub="Suggested for this week" />}

                    {coach.alerts.map(a => (
                        <NoticeRow key={a.id} tone={a.severity === 'danger' ? 'bad' : a.severity === 'warning' ? 'caution' : 'info'} title={a.message} sub={a.sub}>
                            {dismissButton(`Dismiss: ${a.message}`, () => coach.dismiss(a.id))}
                        </NoticeRow>
                    ))}

                    {/* Tolerates an incomplete response (no aggregate): no notice, not a crashed dashboard. */}
                    {showUtil && (
                        <NoticeRow tone="bad" title={`Credit utilization is at ${Math.round(utilPct)}%`} sub="Above 50% can affect your credit score and loan eligibility">
                            <TextAction onClick={() => router.push('/net-worth')}>Pay down</TextAction>
                            {dismissButton('Dismiss credit utilization notice', () => setUtilAlertDismissed(true))}
                        </NoticeRow>
                    )}
                    {showDti && (
                        <NoticeRow tone="caution" title={`Debt payments take ${Math.round(dti.dti_ratio)}% of your income`} sub="The payoff optimizer can shorten this">
                            <TextAction onClick={() => router.push('/debt-intelligence')}>Open optimizer</TextAction>
                            {dismissButton('Dismiss debt-to-income notice', () => setDtiAlertDismissed(true))}
                        </NoticeRow>
                    )}

                    {opportunities.length > 0 && (
                        <NoticeRow
                            title={oppSavings > 0
                                ? `${opportunities.length} ${opportunities.length === 1 ? 'way' : 'ways'} to save ${fmt(oppSavings)} a year`
                                : `${opportunities.length} ${opportunities.length === 1 ? 'opportunity' : 'opportunities'} to review`}
                            sub="Found in your spending">
                            <TextAction onClick={() => setOpportunitiesOpen(v => !v)}>{opportunitiesOpen ? 'Hide' : 'Review'}</TextAction>
                        </NoticeRow>
                    )}
                    {opportunitiesOpen && opportunities.map((opp: any) => {
                        const isDismissing = dismissingIds.has(opp.id);
                        return (
                            <div key={opp.id} style={{ alignItems: 'flex-start', opacity: isDismissing ? 0 : 1, transition: 'opacity 250ms ease' }}>
                                <span style={{ paddingTop: 6, display: 'flex' }}>
                                    <StatusDot tone={opp.priority === 1 ? 'bad' : opp.priority === 2 ? 'caution' : 'neutral'} />
                                </span>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <p style={{ ...type.bodyStrong, margin: 0 }}>{opp.title}</p>
                                    <p style={{ ...type.meta, margin: '2px 0 0', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                        {opp.description}
                                    </p>
                                    {opp.amount_saved != null && (
                                        <p style={{ ...type.numSmall, margin: '4px 0 0', color: 'var(--color-inc-text)' }}>
                                            Save {fmt(parseFloat(opp.amount_saved))} a year
                                        </p>
                                    )}
                                    <div style={{ display: 'flex', gap: 'var(--space-4)', marginTop: 2 }}>
                                        <TextAction onClick={() => handleActOnOpportunity(opp)}>{opp.action_label}</TextAction>
                                        <TextAction quiet onClick={() => handleDismissOpportunity(opp.id)}>Dismiss</TextAction>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </Rows>
            )}
        </Card>
    );

    // ── Stat strip under the net figure ───────────────────────────────────────
    const dailyIncome = heroIncome > 0 ? heroIncome / daysInMonth : 0;
    const loadingValue = <Skeleton width="70%" height={22} borderRadius={4} />;
    const stats: { label: string; value: ReactNode; sub: string; tone?: Tone }[] = [
        {
            label: 'Savings rate',
            value: `${savingsPct}%`,
            sub: savingsPct >= 20 ? 'Good' : savingsPct >= 10 ? 'Fair' : 'Needs work',
            tone: savingsPct >= 20 ? 'good' : savingsPct >= 10 ? 'caution' : 'bad',
        },
        {
            label: 'Daily spend',
            value: fmt(dailyBurn),
            sub: dailyBurn === 0 ? 'No spending yet'
                : dailyIncome === 0 ? 'per day so far'
                : dailyBurn > dailyIncome ? `${fmt(dailyBurn - dailyIncome)} above daily income` : 'Below daily income',
            tone: dailyIncome > 0 && dailyBurn > dailyIncome ? 'caution' : 'neutral',
        },
        {
            label: 'Days left',
            value: `${daysLeft}`,
            sub: runway >= 0 ? `${fmt(runway)} left` : `${fmt(Math.abs(runway))} deficit`,
            tone: runway >= 0 ? 'neutral' : 'bad',
        },
        {
            label: 'Invested',
            value: !investmentRatio || investmentRatio.income_this_month === 0 ? '—' : `${Math.round(investmentRatio.ratio_pct)}%`,
            sub: investmentRatio ? `${fmt(investmentRatio.invested_this_month)} of income` : 'No investment data',
        },
    ];

    const hasCards = (creditUtilization?.per_card?.length ?? 0) > 0;

    // ── Render ────────────────────────────────────────────────────────────────
    return (
            <div ref={pullToRefreshRef as RefObject<HTMLDivElement>}>
            {isMobile && <PullToRefreshIndicator pullDistance={pullDistance} refreshing={ptrRefreshing} />}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', paddingBottom: 'var(--space-6)', animation: 'fadeUp 200ms ease forwards' }}>

                {/* ── PAGE HEADER (no card) ── */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)', marginBottom: 'var(--space-1)' }}>
                    <div style={{ minWidth: 0 }}>
                        <p style={{ ...type.meta, margin: 0 }}>{greeting}</p>
                        <h1 style={{ ...type.heading, margin: 0 }}>{MONTH_NAMES[month]} {year}</h1>
                    </div>
                    <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                        <button type="button" className="fin-icon-btn" onClick={goToPrevMonth} aria-label="Previous month">
                            <ChevronLeft size={16} />
                        </button>
                        <button type="button" className="fin-icon-btn" onClick={goToNextMonth} disabled={isCurrentMonth} aria-label="Next month">
                            <ChevronRight size={16} />
                        </button>
                    </div>
                </div>

                <div className="dash-grid">
                    <div className="dash-col">

                        {/* ── NET: the page's one display figure, the 6-month trend, four stats ── */}
                        <Card className="dash-o1">
                            <div className="dash-net">
                                <div>
                                    <p style={{ ...type.label, margin: 0 }}>{isCurrentMonth ? 'Net this month' : `Net in ${MONTH_NAMES[month]}`}</p>
                                    {dataLoading ? (
                                        <Skeleton width="220px" height={40} borderRadius={6} style={{ margin: '6px 0 10px' }} />
                                    ) : (
                                        <p className="type-display" style={{ ...type.display, margin: '6px 0 10px', color: heroNet >= 0 ? 'var(--text-primary)' : 'var(--color-exp-text)', animation: 'numberReveal 400ms cubic-bezier(0.22,1,0.36,1) both' }}>
                                            <CountUp value={heroNet} format={n => (n > 0 ? '+' : n < 0 ? '−' : '') + fmt(Math.abs(n))} />
                                        </p>
                                    )}
                                    {/* Doubles as the chart's legend. */}
                                    <p style={{ ...type.numSmall, margin: 0, display: 'flex', flexWrap: 'wrap', gap: '4px var(--space-4)' }}>
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                            <span aria-hidden="true" style={{ width: 8, height: 2, borderRadius: 1, background: 'var(--color-inc)' }} />
                                            <span><CountUp value={heroIncome} format={fmt} /> in</span>
                                        </span>
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                            <span aria-hidden="true" style={{ width: 8, height: 2, borderRadius: 1, background: 'var(--color-exp)' }} />
                                            <span><CountUp value={heroExpenses} format={fmt} /> out</span>
                                        </span>
                                    </p>
                                </div>
                                <div style={{ minWidth: 0 }}>
                                    {dataLoading
                                        ? <Skeleton width="100%" height={72} borderRadius={6} />
                                        : <BezierSparkline data={sparklineData} incColor={incColor} expColor={expColor} />}
                                </div>
                            </div>
                            <div className="dash-stats">
                                {stats.map(s => (
                                    <Stat key={s.label} className="dash-stat" label={s.label} value={dataLoading ? loadingValue : s.value} sub={s.sub} subTone={s.tone} />
                                ))}
                            </div>
                        </Card>

                        {briefCard}

                        {/* ── RECENT TRANSACTIONS ── */}
                        <Card className="dash-o5">
                            <CardHeader title="Recent transactions" action={<TextAction onClick={() => router.push('/transactions')}>View all</TextAction>} flush={!dataLoading && transactions.length === 0} />
                            {dataLoading ? (
                                <Rows>
                                    {[1, 2, 3, 4, 5].map(i => (
                                        <div key={i}>
                                            <Skeleton width={32} height={32} borderRadius={10} />
                                            <div style={{ flex: 1 }}>
                                                <Skeleton width="55%" height={12} borderRadius={4} style={{ marginBottom: '6px' }} />
                                                <Skeleton width="35%" height={10} borderRadius={4} />
                                            </div>
                                            <Skeleton width={60} height={14} borderRadius={4} />
                                        </div>
                                    ))}
                                </Rows>
                            ) : transactions.length === 0 ? (
                                <p style={{ ...type.body, margin: 'var(--space-2) 0 0' }}>No transactions yet. Tap + to add your first one.</p>
                            ) : (
                                <Rows>
                                    {transactions.slice(0, 5).map((tx: any) => {
                                        const amount   = parseFloat(String(tx.amount));
                                        const isIncome = tx.type === 'income';
                                        return (
                                            <div key={tx.id} className="fin-row-link pressable" role="button" tabIndex={0}
                                                onClick={() => router.push('/transactions')}
                                                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); router.push('/transactions'); } }}>
                                                <div aria-hidden="true" style={{ width: 32, height: 32, borderRadius: 'var(--radius-md)', background: 'var(--glass-fill-1)', display: 'grid', placeItems: 'center', flexShrink: 0, fontSize: 'var(--text-title)' }}>
                                                    {getSmartIcon(tx.description, tx.category_name, tx.category_icon)}
                                                </div>
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <p style={{ ...type.bodyStrong, ...truncate, margin: 0 }}>{tx.description}</p>
                                                    <p style={{ ...type.meta, ...truncate, margin: '2px 0 0' }}>
                                                        {tx.category_name || 'Uncategorized'} · {getDateLabel(tx.date)}
                                                    </p>
                                                </div>
                                                <span style={{ ...type.num, color: isIncome ? 'var(--color-inc-text)' : 'var(--text-primary)', flexShrink: 0 }}>
                                                    {isIncome ? '+' : '−'}{fmt(amount)}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </Rows>
                            )}
                        </Card>
                    </div>

                    <div className="dash-col">

                        {/* ── FREE TO SPEND (what is left after budgets and goal savings) ── */}
                        {!dataLoading && guiltFreeData && (
                            <Card className="dash-o2">
                                <p style={{ ...type.label, margin: 0 }}>Free to spend</p>
                                <p style={{ ...type.figure, margin: '4px 0 14px', color: guiltFreeData.remaining > 0 ? 'var(--text-primary)' : 'var(--color-warn-text)', animation: 'numberReveal 400ms cubic-bezier(0.22,1,0.36,1) both' }}>
                                    {fmt(guiltFreeData.remaining)}
                                </p>
                                <ProgressBar pct={guiltFreeData.usedPct} height={6} color={guiltFreeData.usedPct > 80 ? 'var(--color-warn)' : 'var(--color-inc)'} />
                                <p style={{ ...type.meta, margin: '10px 0 0' }}>
                                    {fmt(guiltFreeData.unbudgetedSpent)} of a {fmt(guiltFreeData.pool)} pool used.
                                    {' '}The pool is {fmt(guiltFreeData.income)} income minus {fmt(guiltFreeData.totalBudgeted)} in budgets{guiltFreeData.goalMonthly > 0 ? ` and ${fmt(guiltFreeData.goalMonthly)} for goals` : ''}.
                                </p>
                            </Card>
                        )}

                        {/* ── BUDGETS ── */}
                        <Card className="dash-o4">
                            <CardHeader title="Budgets"
                                sub={overBudget > 0 ? <span style={{ color: 'var(--color-exp-text)' }}>{overBudget} over limit</span> : undefined}
                                action={<TextAction onClick={() => router.push('/budgets')}>{!dataLoading && budgets.length === 0 ? 'Set budgets' : 'See all'}</TextAction>}
                                flush={!dataLoading && budgets.length === 0} />
                            {dataLoading ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                                    {[1, 2].map(i => <div key={i}><Skeleton width="50%" height={12} borderRadius={4} style={{ marginBottom: '6px' }} /><Skeleton width="100%" height={4} borderRadius={999} /></div>)}
                                </div>
                            ) : budgets.length === 0 ? (
                                <p style={{ ...type.body, margin: 'var(--space-2) 0 0' }}>No budgets for this month yet.</p>
                            ) : (
                                <Rows>
                                    {budgets.slice(0, 4).map((b: any) => {
                                        const spent = parseFloat(b.spent), limit = parseFloat(b.amount);
                                        const pct  = limit > 0 ? (spent / limit) * 100 : 0;
                                        const over = pct > 100;
                                        return (
                                            <div key={b.id ?? b.category_id} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 'var(--space-2)' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 'var(--space-3)' }}>
                                                    <span style={{ ...type.bodyStrong, ...truncate, minWidth: 0 }}>{b.name ?? b.category_name}</span>
                                                    <span style={{ ...type.numSmall, flexShrink: 0, color: over ? 'var(--color-exp-text)' : 'var(--text-secondary)' }}>
                                                        {over ? `${fmt(spent - limit)} over` : `${fmt(spent)} / ${fmt(limit)}`}
                                                    </span>
                                                </div>
                                                <ProgressBar pct={pct} height={4} color={pct >= 85 ? 'var(--color-warn)' : 'var(--text-secondary)'} />
                                            </div>
                                        );
                                    })}
                                </Rows>
                            )}
                        </Card>

                        {/* ── TOP CATEGORIES ── */}
                        <Card className="dash-o6">
                            <CardHeader title="Top categories" action={<TextAction onClick={() => router.push('/analytics')}>See all</TextAction>} flush={!dataLoading && topCategories.length === 0} />
                            {dataLoading ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                                    {[1, 2, 3].map(i => <Skeleton key={i} width="100%" height={14} borderRadius={4} />)}
                                </div>
                            ) : topCategories.length === 0 ? (
                                <p style={{ ...type.body, margin: 'var(--space-2) 0 0' }}>No spending recorded yet.</p>
                            ) : (
                                <Rows>
                                    {topCategories.map((b: any) => (
                                        <div key={b.id ?? b.category_id}>
                                            <span style={{ ...type.bodyStrong, ...truncate, flex: 1, minWidth: 0 }}>{b.name ?? b.category_name}</span>
                                            <span style={{ ...type.num, flexShrink: 0 }}>{fmt(parseFloat(b.spent))}</span>
                                        </div>
                                    ))}
                                </Rows>
                            )}
                        </Card>

                        {/* ── FINANCIAL HEALTH: score here, the detail widgets open below the grid ── */}
                        <Card className="dash-o7">
                            <CardHeader flush title="Financial health"
                                sub={healthScoreTeaser
                                    ? <>{healthScoreTeaser.label} · <span style={{ ...type.numSmall, color: 'var(--text-primary)' }}>{healthScoreTeaser.score} / 100</span></>
                                    : 'Add transactions to see your score'}
                                action={<TextAction onClick={() => setHealthDetailsOpen(v => !v)}>{healthDetailsOpen ? 'Hide details' : 'Details'}</TextAction>} />
                        </Card>
                    </div>
                </div>

                {/* ── FINANCIAL HEALTH DETAILS ── sibling cards under the grid, never cards inside a card ── */}
                {healthDetailsOpen && (
                    <div className="dash-detail">
                        {(accounts.length > 0 || investments.length > 0) && <div className="wide"><NetWorthWidget /></div>}
                        {investments.length > 0 && (
                            <>
                                <WealthVelocityWidget />
                                <AssetAllocationWidget />
                            </>
                        )}
                        {(activeLoanCount > 0 || hasCards) && (
                            <>
                                <CreditUtilizationWidget />
                                <DtiWidget hasLoans={activeLoanCount > 0} hasCards={hasCards} />
                            </>
                        )}
                        <div className="wide">
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
                    </div>
                )}

            </div>
            </div>
    );
}
