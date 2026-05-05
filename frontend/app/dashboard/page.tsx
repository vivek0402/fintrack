'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { analyticsAPI, transactionsAPI, recurringAPI, budgetsAPI, aiAPI } from '@/lib/api';
import { getCurrentMonthYear } from '@/lib/utils';
import { useCountUp } from '@/hooks/useCountUp';
import { FadeIn } from '@/components/ui/FadeIn';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageShell } from '@/components/layout/PageShell';
import { Skeleton, SkeletonTitle, SkeletonCard, SkeletonCircle, SkeletonText } from '@/components/ui/Skeleton';
import { useIsMobile } from '@/hooks/useWindowSize';
import { StatsCards } from '@/components/dashboard/StatsCards';
import PageHelp from '@/components/ui/PageHelp';
import { Button } from '@/components/ui/Button';
import { RecentTransactions } from '@/components/dashboard/RecentTransactions';
import { BudgetAlerts } from '@/components/dashboard/BudgetAlerts';
import { SpendingForecast } from '@/components/dashboard/SpendingForecast';

const MONTH_NAMES = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTH_SHORT = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmt = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');

export default function DashboardPage() {
    const router = useRouter();
    const { user, isLoading, loadFromStorage } = useAuthStore();
    const { month, year } = getCurrentMonthYear();
    const isMobile = useIsMobile();

    const [summary, setSummary] = useState<any>(null);
    const [trends, setTrends] = useState<any[]>([]);
    const [categories, setCategories] = useState<any[]>([]);
    const [transactions, setTransactions] = useState<any[]>([]);
    const [budgets, setBudgets] = useState<any[]>([]);
    const [forecast, setForecast] = useState<any>(null);
    const [dataLoading, setDataLoading] = useState(true);

    const [salaryData, setSalaryData] = useState<any>(null);
    const [salaryBannerDismissed, setSalaryBannerDismissed] = useState(false);

    const [aiReport, setAiReport] = useState('');
    const [aiReportLoading, setAiReportLoading] = useState(false);

    // Animated hero numbers — count up from 0 when data finishes loading
    const heroIncome   = useCountUp(summary?.total_income   ?? 0, 1000, !dataLoading);
    const heroExpenses = useCountUp(summary?.total_expenses ?? 0, 1000, !dataLoading);
    const heroNet      = useCountUp((summary?.total_income ?? 0) - (summary?.total_expenses ?? 0), 1000, !dataLoading);
    const fmtHero = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');

    useEffect(() => { loadFromStorage(); }, []);
    useEffect(() => { if (!isLoading && !user) router.push('/login'); }, [user, isLoading]);

    useEffect(() => {
        const key = `salary-banner-dismissed-${month}-${year}`;
        setSalaryBannerDismissed(localStorage.getItem(key) === 'true');
    }, [month, year]);

    useEffect(() => {
        if (!user) return;
        const fetchData = async () => {
            setDataLoading(true);
            try {
                await recurringAPI.process();
                const [summaryRes, trendsRes, txRes, budgetsRes, forecastRes] = await Promise.all([
                    analyticsAPI.summary({ month, year }),
                    analyticsAPI.trends(),
                    transactionsAPI.getAll({ month, year }),
                    budgetsAPI.getAll({ month, year }),
                    analyticsAPI.forecast({ month, year }),
                ]);
                setSummary(summaryRes.data.summary);
                setCategories(summaryRes.data.category_breakdown);
                setTrends(trendsRes.data.trends);
                setTransactions(txRes.data.transactions);
                setBudgets(budgetsRes.data.budgets);
                setForecast(forecastRes.data.forecast);
            } catch (err) { console.error(err); }
            finally { setDataLoading(false); }
        };
        fetchData();

        aiAPI.salaryIntelligence().then(res => {
            if (res.data.detected) setSalaryData(res.data);
        }).catch(() => { });
    }, [user]);

    const handleGenerateReport = async () => {
        setAiReportLoading(true);
        try {
            const res = await aiAPI.report();
            setAiReport(res.data.report);
        } catch {
            setAiReport('Unable to generate report right now. Please try again.');
        } finally {
            setAiReportLoading(false);
        }
    };


    const hour = new Date().getHours();
    const greeting = `Good ${hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'}, ${user?.full_name?.split(' ')[0] ?? 'there'} 👋`;

    // Build sparkline data (last 6 months) from raw trends
    const sparklineData = (() => {
        const map: Record<string, { month: number; year: number; income: number; expenses: number }> = {};
        trends.forEach(row => {
            const key = `${row.year}-${String(row.month).padStart(2, '0')}`;
            if (!map[key]) map[key] = { month: row.month, year: row.year, income: 0, expenses: 0 };
            if (row.type === 'income') map[key].income = parseFloat(row.total);
            if (row.type === 'expense') map[key].expenses = parseFloat(row.total);
        });
        return Object.values(map)
            .sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month)
            .slice(-6);
    })();
    const sparkMax = Math.max(...sparklineData.flatMap(d => [d.income, d.expenses]), 1);

    const sortedCategories = categories && categories.length > 0
        ? [...categories].sort((a, b) => parseFloat(b.total ?? b.value ?? 0) - parseFloat(a.total ?? a.value ?? 0))
        : [];
    const topCategory = sortedCategories.length > 0 ? sortedCategories[0] : null;
    const totalCatExpenses = categories?.reduce((sum, c) => sum + parseFloat(c.total ?? c.value ?? 0), 0) ?? 0;
    const topCategoryAmt = topCategory ? parseFloat(topCategory.total ?? topCategory.value ?? 0) : 0;
    const topCategoryPct = topCategory && totalCatExpenses > 0 ? Math.round((topCategoryAmt / totalCatExpenses) * 100) : 0;

    if (isLoading || !user) return (
        <AppLayout>
            <div style={{ marginBottom: '24px' }}>
                <SkeletonTitle />
                <Skeleton width="40%" height={14} borderRadius={4} style={{ marginTop: '8px' }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '12px' }}>
                {[1, 2, 3, 4].map(i => <SkeletonCard key={i} height={90} />)}
            </div>
            <SkeletonCard height={110} style={{ marginBottom: '12px' }} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '16px', marginBottom: '16px' }}>
                <SkeletonCard height={200} />
                <SkeletonCard height={200} />
            </div>
            <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--bg-border)', borderRadius: '16px', padding: '20px' }}>
                <Skeleton width="30%" height={16} borderRadius={4} style={{ marginBottom: '16px' }} />
                {[1, 2, 3, 4, 5].map(i => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', paddingTop: '12px', paddingBottom: '12px', borderBottom: i < 5 ? '1px solid var(--bg-border)' : 'none' }}>
                        <SkeletonCircle size={40} />
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <SkeletonText />
                            <Skeleton width="50%" height={12} borderRadius={4} />
                        </div>
                        <Skeleton width={72} height={16} borderRadius={4} />
                    </div>
                ))}
            </div>
        </AppLayout>
    );

    const dismissSalaryBanner = () => {
        const key = `salary-banner-dismissed-${month}-${year}`;
        localStorage.setItem(key, 'true');
        setSalaryBannerDismissed(true);
    };

    // ── HERO CARD ──
    const HeroCard = () => isMobile ? (
        /* ── MOBILE HERO CARD ── */
        <div style={{ background: 'linear-gradient(135deg, var(--bg-secondary), var(--bg-primary))', borderRadius: 'var(--radius-xl)', border: '1px solid var(--bg-border)', padding: 'var(--space-6)', position: 'relative', overflow: 'hidden', marginBottom: 12 }}>

            {/* Ambient glows */}
            <div style={{ position: 'absolute', bottom: -40, left: -20, width: 180, height: 180, background: 'radial-gradient(circle,rgba(16,185,129,0.10),transparent 70%)', borderRadius: '50%', pointerEvents: 'none' }} />
            <div style={{ position: 'absolute', bottom: -40, right: -20, width: 180, height: 180, background: 'radial-gradient(circle,rgba(244,63,94,0.08),transparent 70%)', borderRadius: '50%', pointerEvents: 'none' }} />
            <div style={{ position: 'absolute', top: -30, right: -30, width: 140, height: 140, background: 'radial-gradient(circle,rgba(59,130,246,0.07),transparent 70%)', borderRadius: '50%', pointerEvents: 'none' }} />

            {/* ── SECTION 1: Net Worth + mini income/expense stats ── */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative', zIndex: 1 }}>
                <div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Net Balance</div>
                    <div style={{ fontSize: 38, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.03em', lineHeight: 1, fontFamily: "'DM Mono', monospace" }}>
                        {fmtHero(heroNet)}
                    </div>
                    <div style={{ marginTop: 8, display: 'inline-block', padding: '4px 12px', borderRadius: 20, background: 'rgba(16,185,129,0.12)', color: 'var(--accent-green)', fontSize: 12, fontWeight: 600 }}>
                        {'+' + fmtHero(heroNet) + ' this month'}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                        {new Date().toLocaleString('default', { month: 'long' })} {new Date().getFullYear()}
                    </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-end' }}>
                    <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>Income</div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent-green)', fontFamily: "'DM Mono', monospace" }}>{fmtHero(heroIncome)}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>Expenses</div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent-red)', fontFamily: "'DM Mono', monospace" }}>{fmtHero(heroExpenses)}</div>
                    </div>
                </div>
            </div>

            {/* ── SECTION 2: Neon line chart ── */}
            {(() => {
                const raw = (sparklineData || []).slice(-6);
                const padded: { income: number, expenses: number, month?: number }[] = Array(6).fill(null).map((_, i) => raw[i - (6 - raw.length)] || { income: 0, expenses: 0 });

                const CHART_W = 400, CHART_H = 100;
                const PAD_LEFT = 40, PAD_RIGHT = 10, PAD_TOP = 10, PAD_BOTTOM = 24;
                const plotW = CHART_W - PAD_LEFT - PAD_RIGHT;
                const plotH = CHART_H - PAD_TOP - PAD_BOTTOM;

                const maxVal = Math.max(...padded.flatMap(m => [m.income || 0, m.expenses || 0]), 1);
                const xPos = (i: number) => PAD_LEFT + (i / (padded.length - 1)) * plotW;
                const yPos = (v: number) => PAD_TOP + (1 - Math.min(v / maxVal, 1)) * plotH;

                const incPts: [number, number][] = padded.map((m, i) => [xPos(i), yPos(m.income || 0)]);
                const expPts: [number, number][] = padded.map((m, i) => [xPos(i), yPos(m.expenses || 0)]);

                const smoothPath = (pts: [number, number][]) => {
                    if (pts.length < 2) return '';
                    let d = `M${pts[0][0]},${pts[0][1]}`;
                    for (let i = 0; i < pts.length - 1; i++) {
                        const cpx = pts[i][0] + (pts[i + 1][0] - pts[i][0]) * 0.5;
                        d += ` C${cpx},${pts[i][1]} ${cpx},${pts[i + 1][1]} ${pts[i + 1][0]},${pts[i + 1][1]}`;
                    }
                    return d;
                };

                const incPath = smoothPath(incPts);
                const expPath = smoothPath(expPts);

                const yLabels = [maxVal, maxVal * 0.5, 0].map(v => ({
                    value: '₹' + (v >= 1000 ? Math.round(v / 1000) + 'k' : Math.round(v)),
                    y: yPos(v),
                }));

                const monthLabels = padded.map((m, i) => {
                    if (m.month) return new Date(0, m.month - 1).toLocaleString('default', { month: 'short' });
                    const d = new Date(); d.setMonth(d.getMonth() - (5 - i));
                    return d.toLocaleString('default', { month: 'short' });
                });

                return (
                    <div style={{ position: 'relative', zIndex: 1, marginTop: 16 }}>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>6-month trend</div>
                        <div>
                            <svg
                                width="100%"
                                viewBox={`0 0 ${CHART_W} ${CHART_H}`}
                                preserveAspectRatio="xMidYMid meet"
                                style={{ display: 'block', overflow: 'visible' }}
                            >
                                <defs>
                                    <filter id="mgneon2" x="-50%" y="-100%" width="200%" height="300%">
                                        <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="blur" />
                                        <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                                    </filter>
                                    <filter id="mrneon2" x="-50%" y="-100%" width="200%" height="300%">
                                        <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="blur" />
                                        <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                                    </filter>
                                    <linearGradient id="mgfill2" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#10b981" stopOpacity="0.14" />
                                        <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
                                    </linearGradient>
                                    <linearGradient id="mrfill2" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.10" />
                                        <stop offset="100%" stopColor="#f43f5e" stopOpacity="0" />
                                    </linearGradient>
                                </defs>

                                {yLabels.map((lbl, i) => (
                                    <text key={i} x={PAD_LEFT - 6} y={lbl.y + 4}
                                        textAnchor="end" fontSize="9" fill="#4a5568"
                                        fontFamily="DM Sans, sans-serif">{lbl.value}</text>
                                ))}
                                {yLabels.map((lbl, i) => (
                                    <line key={i} x1={PAD_LEFT} y1={lbl.y} x2={CHART_W - PAD_RIGHT} y2={lbl.y}
                                        stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
                                ))}
                                {incPts.map(([x], i) => (
                                    <line key={i} x1={x} y1={PAD_TOP} x2={x} y2={PAD_TOP + plotH}
                                        stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
                                ))}

                                <path d={incPath + ` L${incPts[incPts.length - 1][0]},${PAD_TOP + plotH} L${PAD_LEFT},${PAD_TOP + plotH} Z`} fill="url(#mgfill2)" />
                                <path d={expPath + ` L${expPts[expPts.length - 1][0]},${PAD_TOP + plotH} L${PAD_LEFT},${PAD_TOP + plotH} Z`} fill="url(#mrfill2)" />

                                <path d={incPath} fill="none" stroke="#10b981" strokeWidth="5" strokeOpacity="0.13" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                                <path d={expPath} fill="none" stroke="#f43f5e" strokeWidth="5" strokeOpacity="0.10" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                                <path d={incPath} fill="none" stroke="#10b981" strokeWidth="1.5" strokeLinecap="round" filter="url(#mgneon2)" vectorEffect="non-scaling-stroke" />
                                <path d={expPath} fill="none" stroke="#f43f5e" strokeWidth="1.5" strokeLinecap="round" filter="url(#mrneon2)" vectorEffect="non-scaling-stroke" />

                                {incPts.slice(0, -1).map(([x, y], i) => (
                                    <circle key={i} cx={x} cy={y} r="2.5" fill="#0d1628" stroke="#10b981" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
                                ))}
                                {expPts.slice(0, -1).map(([x, y], i) => (
                                    <circle key={i} cx={x} cy={y} r="2.5" fill="#0d1628" stroke="#f43f5e" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
                                ))}
                                <circle cx={incPts[incPts.length - 1][0]} cy={incPts[incPts.length - 1][1]} r="4.5" fill="#10b981" filter="url(#mgneon2)" />
                                <circle cx={expPts[expPts.length - 1][0]} cy={expPts[expPts.length - 1][1]} r="4.5" fill="#f43f5e" filter="url(#mrneon2)" />

                                {monthLabels.map((m, i) => (
                                    <text key={i} x={xPos(i)} y={CHART_H - 4}
                                        textAnchor="middle" fontSize="9"
                                        fill={i === monthLabels.length - 1 ? '#f0f4ff' : '#4a5568'}
                                        fontWeight={i === monthLabels.length - 1 ? '600' : '400'}
                                        fontFamily="DM Sans, sans-serif">{m}</text>
                                ))}
                            </svg>
                            <div style={{ display: 'flex', gap: 16, marginTop: 6 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <div style={{ width: 20, height: 2, background: '#10b981', borderRadius: 1, boxShadow: '0 0 4px #10b981' }} />
                                    <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Income</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <div style={{ width: 20, height: 2, background: '#f43f5e', borderRadius: 1, boxShadow: '0 0 4px #f43f5e' }} />
                                    <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Expenses</span>
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* divider */}
            <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '16px 0' }} />

            {/* ── SECTION 3: Top Spending ── */}
            {(() => {
                const sorted = [...(categories || [])].sort((a, b) => parseFloat(b.total ?? b.value ?? 0) - parseFloat(a.total ?? a.value ?? 0));
                const top = sorted[0];
                if (!top) return null;
                const totalExp = (categories || []).reduce((s: number, c: any) => s + parseFloat(c.total ?? c.value ?? 0), 0);
                const topAmt = parseFloat(top.total ?? top.value ?? 0);
                const pct = totalExp > 0 ? Math.round((topAmt / totalExp) * 100) : 0;
                return (
                    <div style={{ position: 'relative', zIndex: 1 }}>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Top spending</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ width: 32, height: 32, borderRadius: 10, background: 'rgba(244,63,94,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <div style={{ width: 10, height: 10, borderRadius: '50%', background: top.color || '#f43f5e', boxShadow: `0 0 8px ${top.color || '#f43f5e'}` }} />
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                                    <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{top.name}</span>
                                    <span style={{ fontSize: 13, color: 'var(--accent-red)', fontWeight: 700, flexShrink: 0, marginLeft: 8 }}>{'₹' + Math.round(topAmt).toLocaleString('en-IN')}</span>
                                </div>
                                <div style={{ height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
                                    <div style={{ height: '100%', width: pct + '%', maxWidth: '100%', background: 'linear-gradient(90deg,#f43f5e,#f97316)', borderRadius: 2 }} />
                                </div>
                                <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 3 }}>{pct}% of total expenses</div>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* divider */}
            <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '16px 0' }} />

            {/* ── SECTION 4: AI Insight ── */}
            <div style={{ position: 'relative', zIndex: 1 }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ color: '#a78bfa', fontSize: 13 }}>✦</span>
                    <span>AI insight</span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.6, marginBottom: 12, padding: '10px 12px', background: 'rgba(167,139,250,0.06)', borderRadius: 10, borderLeft: '2px solid rgba(167,139,250,0.3)' }}>
                    {aiReport || 'Tap generate to get your monthly AI summary.'}
                </div>
                <Button onClick={handleGenerateReport} variant="primary" size="sm" style={{ width: '100%' }}>Generate Report</Button>
            </div>

        </div>
    ) : (
        /* ── DESKTOP HERO CARD (3-column) ── */
        <div style={{
            background: 'linear-gradient(135deg, var(--bg-secondary), var(--bg-primary))',
            borderRadius: 'var(--radius-xl)',
            border: '1px solid var(--bg-border)',
            padding: 'var(--space-6)',
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'stretch',
            gap: 0,
            position: 'relative',
            overflow: 'hidden',
            marginBottom: 'var(--space-3)',
        }}>

            {/* Decorative glow */}
            <div style={{ position: 'absolute', top: -60, right: -60, width: 200, height: 200, background: 'radial-gradient(circle,rgba(59,130,246,0.07),transparent 70%)', borderRadius: '50%', pointerEvents: 'none' }} />

            {/* ── LEFT: This Month ── */}
            <div style={{ width: 200, flexShrink: 0, paddingRight: 24 }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>This month</div>
                <div style={{ fontSize: 34, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.03em', lineHeight: 1, fontFamily: "'DM Mono', monospace" }}>
                    {fmtHero(heroNet)}
                </div>
                <div style={{ marginTop: 8, display: 'inline-block', padding: '3px 10px', borderRadius: 20, background: 'rgba(16,185,129,0.12)', color: 'var(--accent-green)', fontSize: 12, fontWeight: 600 }}>
                    +{fmtHero(heroNet)} this month
                </div>
                <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-muted)', fontFamily: "'DM Mono', monospace" }}>
                    {fmtHero(heroIncome)} in · {fmtHero(heroExpenses)} out
                </div>
            </div>

            {/* Divider */}
            <div style={{ width: 1, background: 'rgba(255,255,255,0.07)', flexShrink: 0, alignSelf: 'stretch' }} />

            {/* ── MIDDLE: Trend + Top Spending ── */}
            <div style={{ flex: 1, paddingLeft: 24, paddingRight: 24, minWidth: 0, overflow: 'hidden' }}>

                {/* Sparkline label */}
                <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>6-month trend</div>

                {/* Neon line chart */}
                {(() => {
                    const raw = (sparklineData || []).slice(-6);
                    const padded: { income: number, expenses: number, month?: number }[] = Array(6).fill(null).map((_, i) => raw[i - (6 - raw.length)] || { income: 0, expenses: 0 });

                    const CHART_W = 600, CHART_H = 100;
                    const PAD_LEFT = 40, PAD_RIGHT = 10, PAD_TOP = 10, PAD_BOTTOM = 24;
                    const plotW = CHART_W - PAD_LEFT - PAD_RIGHT;
                    const plotH = CHART_H - PAD_TOP - PAD_BOTTOM;

                    const maxVal = Math.max(...padded.flatMap(m => [m.income || 0, m.expenses || 0]), 1);
                    const xPos = (i: number) => PAD_LEFT + (i / (padded.length - 1)) * plotW;
                    const yPos = (v: number) => PAD_TOP + (1 - Math.min(v / maxVal, 1)) * plotH;

                    const incPts: [number, number][] = padded.map((m, i) => [xPos(i), yPos(m.income || 0)]);
                    const expPts: [number, number][] = padded.map((m, i) => [xPos(i), yPos(m.expenses || 0)]);

                    const smoothPath = (pts: [number, number][]) => {
                        if (pts.length < 2) return '';
                        let d = `M${pts[0][0]},${pts[0][1]}`;
                        for (let i = 0; i < pts.length - 1; i++) {
                            const cpx = pts[i][0] + (pts[i + 1][0] - pts[i][0]) * 0.5;
                            d += ` C${cpx},${pts[i][1]} ${cpx},${pts[i + 1][1]} ${pts[i + 1][0]},${pts[i + 1][1]}`;
                        }
                        return d;
                    };

                    const incPath = smoothPath(incPts);
                    const expPath = smoothPath(expPts);

                    const yLabels = [maxVal, maxVal * 0.5, 0].map(v => ({
                        value: '₹' + (v >= 1000 ? Math.round(v / 1000) + 'k' : Math.round(v)),
                        y: yPos(v),
                    }));

                    const monthLabels = padded.map((m, i) => {
                        if (m.month) return new Date(0, m.month - 1).toLocaleString('default', { month: 'short' });
                        const d = new Date(); d.setMonth(d.getMonth() - (5 - i));
                        return d.toLocaleString('default', { month: 'short' });
                    });

                    return (
                        <div>
                            <svg
                                width="100%"
                                viewBox={`0 0 ${CHART_W} ${CHART_H}`}
                                preserveAspectRatio="xMidYMid meet"
                                style={{ display: 'block', overflow: 'visible' }}
                            >
                                <defs>
                                    <filter id="dgneon2" x="-50%" y="-100%" width="200%" height="300%">
                                        <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="blur" />
                                        <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                                    </filter>
                                    <filter id="drneon2" x="-50%" y="-100%" width="200%" height="300%">
                                        <feGaussianBlur in="SourceGraphic" stdDeviation="2.5" result="blur" />
                                        <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                                    </filter>
                                    <linearGradient id="dgfill2" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#10b981" stopOpacity="0.14" />
                                        <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
                                    </linearGradient>
                                    <linearGradient id="drfill2" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.10" />
                                        <stop offset="100%" stopColor="#f43f5e" stopOpacity="0" />
                                    </linearGradient>
                                </defs>

                                {yLabels.map((lbl, i) => (
                                    <text key={i} x={PAD_LEFT - 6} y={lbl.y + 4}
                                        textAnchor="end" fontSize="9" fill="#4a5568"
                                        fontFamily="DM Sans, sans-serif">{lbl.value}</text>
                                ))}
                                {yLabels.map((lbl, i) => (
                                    <line key={i} x1={PAD_LEFT} y1={lbl.y} x2={CHART_W - PAD_RIGHT} y2={lbl.y}
                                        stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
                                ))}
                                {incPts.map(([x], i) => (
                                    <line key={i} x1={x} y1={PAD_TOP} x2={x} y2={PAD_TOP + plotH}
                                        stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
                                ))}

                                <path d={incPath + ` L${incPts[incPts.length - 1][0]},${PAD_TOP + plotH} L${PAD_LEFT},${PAD_TOP + plotH} Z`} fill="url(#dgfill2)" />
                                <path d={expPath + ` L${expPts[expPts.length - 1][0]},${PAD_TOP + plotH} L${PAD_LEFT},${PAD_TOP + plotH} Z`} fill="url(#drfill2)" />

                                <path d={incPath} fill="none" stroke="#10b981" strokeWidth="5" strokeOpacity="0.13" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                                <path d={expPath} fill="none" stroke="#f43f5e" strokeWidth="5" strokeOpacity="0.10" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                                <path d={incPath} fill="none" stroke="#10b981" strokeWidth="1.5" strokeLinecap="round" filter="url(#dgneon2)" vectorEffect="non-scaling-stroke" />
                                <path d={expPath} fill="none" stroke="#f43f5e" strokeWidth="1.5" strokeLinecap="round" filter="url(#drneon2)" vectorEffect="non-scaling-stroke" />

                                {incPts.slice(0, -1).map(([x, y], i) => (
                                    <circle key={i} cx={x} cy={y} r="2.5" fill="#0d1628" stroke="#10b981" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
                                ))}
                                {expPts.slice(0, -1).map(([x, y], i) => (
                                    <circle key={i} cx={x} cy={y} r="2.5" fill="#0d1628" stroke="#f43f5e" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
                                ))}
                                <circle cx={incPts[incPts.length - 1][0]} cy={incPts[incPts.length - 1][1]} r="4.5" fill="#10b981" filter="url(#dgneon2)" />
                                <circle cx={expPts[expPts.length - 1][0]} cy={expPts[expPts.length - 1][1]} r="4.5" fill="#f43f5e" filter="url(#drneon2)" />

                                {monthLabels.map((m, i) => (
                                    <text key={i} x={xPos(i)} y={CHART_H - 4}
                                        textAnchor="middle" fontSize="9"
                                        fill={i === monthLabels.length - 1 ? '#f0f4ff' : '#4a5568'}
                                        fontWeight={i === monthLabels.length - 1 ? '600' : '400'}
                                        fontFamily="DM Sans, sans-serif">{m}</text>
                                ))}
                            </svg>
                            <div style={{ display: 'flex', gap: 16, marginTop: 6 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <div style={{ width: 20, height: 2, background: '#10b981', borderRadius: 1, boxShadow: '0 0 4px #10b981' }} />
                                    <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Income</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <div style={{ width: 20, height: 2, background: '#f43f5e', borderRadius: 1, boxShadow: '0 0 4px #f43f5e' }} />
                                    <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Expenses</span>
                                </div>
                            </div>
                        </div>
                    );
                })()}

                {/* Top Spending */}
                <div style={{ marginTop: 14 }}>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Top spending</div>
                    {(() => {
                        const sorted = [...(categories || [])].sort((a, b) => parseFloat(b.total ?? b.value ?? 0) - parseFloat(a.total ?? a.value ?? 0));
                        const top = sorted[0];
                        if (!top) return <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>No spending data yet</div>;
                        const totalExp = (categories || []).reduce((s: number, c: any) => s + parseFloat(c.total ?? c.value ?? 0), 0);
                        const amt = parseFloat(top.total ?? top.value ?? 0);
                        const pct = totalExp > 0 ? Math.round((amt / totalExp) * 100) : 0;
                        return (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
                                <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: top.color || '#f43f5e', flexShrink: 0 }} />
                                        <span style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{top.name}</span>
                                        <span style={{ fontSize: 10, color: 'var(--text-secondary)', flexShrink: 0 }}>{pct}% of expenses</span>
                                    </div>
                                    <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                                        <div style={{ height: '100%', width: pct + '%', maxWidth: '100%', background: 'linear-gradient(90deg,#f43f5e,#f97316)', borderRadius: 2 }} />
                                    </div>
                                </div>
                                <div style={{ fontSize: 12, color: 'var(--accent-red)', fontWeight: 600, flexShrink: 0 }}>
                                    {'₹' + Math.round(amt).toLocaleString('en-IN')}
                                </div>
                            </div>
                        );
                    })()}
                </div>
            </div>

            {/* Divider */}
            <div style={{ width: 1, background: 'rgba(255,255,255,0.07)', flexShrink: 0, alignSelf: 'stretch' }} />

            {/* ── RIGHT: AI Insight ── */}
            <div style={{ width: 260, flexShrink: 0, paddingLeft: 24 }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>✦</span><span>AI insight</span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.55, marginBottom: 12 }}>
                    {aiReport || 'Tap generate to get your monthly AI summary.'}
                </div>
                <Button onClick={handleGenerateReport} variant="primary" size="sm">Generate Report</Button>
            </div>

        </div>
    );

    return (

        <AppLayout>
            <div style={{ animation: 'fadeUp 200ms ease forwards' }}>

            {/* Salary Banner */}
            {salaryData && !salaryBannerDismissed && salaryData.plan && (
                <div style={{ background: 'linear-gradient(135deg, rgba(16,185,129,0.08), rgba(59,130,246,0.06))', border: '1px solid rgba(16,185,129,0.25)', borderRadius: '16px', padding: '16px 20px', marginBottom: '16px', position: 'relative' }}>
                    <button onClick={dismissSalaryBanner} style={{ position: 'absolute', top: '12px', right: '12px', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1rem', lineHeight: 1 }}>✕</button>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                        <span style={{ fontSize: '1.1rem' }}>💰</span>
                        <span style={{ fontFamily: "'Cabinet Grotesk', 'Sora', sans-serif", fontSize: '0.9rem', fontWeight: 600, color: 'var(--accent-green)' }}>Salary Detected — AI Allocation Plan</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginLeft: '4px' }}>{salaryData.description} · ₹{salaryData.salary?.toLocaleString('en-IN')}</span>
                    </div>
                    {salaryData.insight && <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '0 0 12px 0', lineHeight: 1.5 }}>{salaryData.insight}</p>}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '8px' }}>
                        {Object.entries(salaryData.plan).map(([key, val]: [string, any]) => (
                            <div key={key} style={{ background: 'var(--bg-card)', border: '1px solid var(--bg-border)', borderRadius: '10px', padding: '10px 12px' }}>
                                <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)', margin: '0 0 3px 0', textTransform: 'capitalize' }}>{key}</p>
                                <p style={{ fontFamily: 'Sora, sans-serif', fontSize: '0.9rem', fontWeight: 700, color: 'var(--accent-green)', margin: 0 }}>₹{val.amount?.toLocaleString('en-IN')}</p>
                                <p style={{ fontSize: '0.62rem', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>{val.percentage}%</p>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <PageShell
                title={greeting}
                subtitle={`${MONTH_NAMES[month]} ${year} — Overview`}
                headerRight={<PageHelp title="Dashboard" sections={[
                    { icon: '📊', heading: 'What is this page?', body: 'Your financial command centre. See your income, expenses, net balance, and savings rate for the current month at a glance.' },
                    { icon: '💡', heading: 'Stat Cards', body: "The 4 coloured cards show this month's totals. The savings rate pill turns green when you save more than 20% of your income." },
                    { icon: '📈', heading: '6-Month Trend Chart', body: 'The neon line chart shows your income vs expenses trend over the last 6 months. Green = income, red = expenses.' },
                    { icon: '🏆', heading: 'Top Spending', body: "Shows which category you've spent the most in this month. Tap 'See all' to go to Analytics for a full breakdown." },
                    { icon: '🤖', heading: 'AI Insight', body: "Tap 'Generate Insight' to get a personalised AI comment about your spending patterns this month." },
                ]} />}
            >

            {/* ── DESKTOP BENTO GRID ── */}
            {!isMobile ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {/* Row 1 — Stat tiles */}
                    {dataLoading ? (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
                            {[1, 2, 3, 4].map(i => <div key={i} style={{ background: 'var(--surface-1)', border: '1px solid var(--bg-border)', borderRadius: 'var(--radius-lg)', height: '90px' }} />)}
                        </div>
                    ) : summary && (
                        <FadeIn><StatsCards totalIncome={summary.total_income} totalExpenses={summary.total_expenses} balance={summary.balance} savingsRate={summary.savings_rate} currency={user.currency} month={month} year={year} /></FadeIn>
                    )}

                    {/* Row 2 — Hero card */}
                    <HeroCard />

                    {/* Row 3 — Budget tile */}
                    <div style={{ background: 'var(--surface-1)', border: '1px solid var(--bg-border)', borderRadius: 'var(--radius-md)', padding: 'var(--space-6)', overflow: 'hidden' }}>
                        <p style={{ fontFamily: "'Cabinet Grotesk', 'Sora', sans-serif", fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 var(--space-4) 0' }}>Budgets</p>
                        {budgets.length > 0
                            ? <BudgetAlerts budgets={budgets} currency={user.currency} />
                            : <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: 0 }}>All budgets on track ✅</p>
                        }
                    </div>

                    {/* Row 5 — Recent + Forecast */}
                    <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr', gap: '12px' }}>
                        <RecentTransactions transactions={transactions} currency={user.currency} />
                        <SpendingForecast forecast={forecast} currency={user.currency} />
                    </div>
                </div>
            ) : (
                /* ── MOBILE STACK ── */
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {/* Stats 2x2 */}
                    {dataLoading ? (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                            {[1, 2, 3, 4].map(i => <div key={i} style={{ background: 'var(--surface-1)', border: '1px solid var(--bg-border)', borderRadius: 'var(--radius-lg)', height: '80px' }} />)}
                        </div>
                    ) : summary && (
                        <FadeIn><StatsCards totalIncome={summary.total_income} totalExpenses={summary.total_expenses} balance={summary.balance} savingsRate={summary.savings_rate} currency={user.currency} month={month} year={year} /></FadeIn>
                    )}

                    {/* Hero */}
                    <HeroCard />


                    {/* Budgets */}
                    <div style={{ background: 'var(--surface-1)', border: '1px solid var(--bg-border)', borderRadius: 'var(--radius-md)', padding: 'var(--space-6)', overflow: 'hidden' }}>
                        <p style={{ fontFamily: "'Cabinet Grotesk', 'Sora', sans-serif", fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 var(--space-4) 0' }}>Budgets</p>
                        {budgets.length > 0
                            ? <BudgetAlerts budgets={budgets} currency={user.currency} />
                            : <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: 0 }}>All budgets on track ✅</p>
                        }
                    </div>

                    {/* Recent Transactions */}
                    <RecentTransactions transactions={transactions} currency={user.currency} />

                    {/* Forecast */}
                    <SpendingForecast forecast={forecast} currency={user.currency} />
                </div>
            )}

            </PageShell>
            </div>
        </AppLayout>
    );
}
