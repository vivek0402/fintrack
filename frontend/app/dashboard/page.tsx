'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { analyticsAPI, transactionsAPI, recurringAPI, budgetsAPI, aiAPI } from '@/lib/api';
import { getCurrentMonthYear } from '@/lib/utils';
import { AppLayout } from '@/components/layout/AppLayout';
import { Skeleton, SkeletonTitle, SkeletonCard, SkeletonCircle, SkeletonText } from '@/components/ui/Skeleton';
import { useIsMobile } from '@/hooks/useWindowSize';
import { StatsCards } from '@/components/dashboard/StatsCards';
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

    // ── HERO CARD (wide 3-column) ──
    const HeroCard = () => (
        <div style={{
            background: 'linear-gradient(135deg,#0a0f1e 0%,#0f1629 50%,#0a1225 100%)',
            borderRadius: 16,
            border: '1px solid rgba(255,255,255,0.06)',
            padding: '22px 24px',
            display: isMobile ? 'flex' : 'grid',
            flexDirection: isMobile ? 'column' : undefined,
            gridTemplateColumns: isMobile ? undefined : '1fr 1px 1.6fr 1px 1fr',
            alignItems: isMobile ? undefined : 'stretch',
            gap: isMobile ? '20px' : undefined,
            position: 'relative',
            overflow: 'hidden',
        }}>
            {/* Radial glow decoration */}
            <div style={{ position: 'absolute', top: -60, right: -60, width: 200, height: 200, background: 'radial-gradient(circle,rgba(59,130,246,0.08),transparent 70%)', borderRadius: '50%', pointerEvents: 'none' }} />

            {/* LEFT — This Month */}
            <div style={{ position: 'relative', zIndex: 1 }}>
                <p style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#4a5568', fontWeight: 600, margin: '0 0 10px 0' }}>This Month</p>
                <p style={{ fontFamily: 'Sora, sans-serif', fontSize: '34px', fontWeight: 800, color: '#f0f4ff', letterSpacing: '-0.03em', margin: '0 0 10px 0', lineHeight: 1 }}>
                    {dataLoading ? '—' : fmt(summary?.balance ?? 0)}
                </p>
                {!dataLoading && summary && (
                    <span style={{
                        display: 'inline-flex', alignItems: 'center',
                        fontSize: '12px', fontWeight: 600,
                        color: summary.balance >= 0 ? '#10b981' : '#f43f5e',
                        background: summary.balance >= 0 ? 'rgba(16,185,129,0.12)' : 'rgba(244,63,94,0.12)',
                        borderRadius: '20px', padding: '3px 10px',
                    }}>
                        {summary.balance >= 0 ? '+' : ''}{fmt(summary.balance)} this month
                    </span>
                )}
                <p style={{ fontSize: '11px', color: '#4a5568', margin: '10px 0 0 0' }}>
                    {dataLoading || !summary ? '—' : `${fmt(summary.total_income)} in · ${fmt(summary.total_expenses)} out`}
                </p>
            </div>

            {/* DIVIDER 1 */}
            {!isMobile && <div style={{ background: 'rgba(255,255,255,0.07)', width: 1, margin: '0 20px', alignSelf: 'stretch' }} />}
            {isMobile && <div style={{ height: 1, background: 'rgba(255,255,255,0.07)' }} />}

            {/* MIDDLE — Sparkline + Top Spending */}
            <div style={{ position: 'relative', zIndex: 1 }}>
                <p style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#4a5568', fontWeight: 600, margin: '0 0 10px 0' }}>6-Month Trend</p>

                {/* Sparkline bars */}
                {sparklineData.length > 0 ? (
                    <div>
                        <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 44, overflow: 'hidden', width: '100%' }}>
                            {sparklineData.flatMap((d, i) => [
                                <div key={`i-${i}`} style={{ width: 'calc((100% - 60px) / 12)', height: `${Math.max(4, Math.round((d.income / sparkMax) * 44))}px`, background: 'linear-gradient(180deg,#10b981,rgba(16,185,129,0.3))', borderRadius: '2px 2px 0 0', flexShrink: 0 }} />,
                                <div key={`e-${i}`} style={{ width: 'calc((100% - 60px) / 12)', height: `${Math.max(4, Math.round((d.expenses / sparkMax) * 44))}px`, background: 'linear-gradient(180deg,#f43f5e,rgba(244,63,94,0.3))', borderRadius: '2px 2px 0 0', flexShrink: 0 }} />,
                                i < sparklineData.length - 1 ? <div key={`s-${i}`} style={{ width: 4, flexShrink: 0 }} /> : null,
                            ])}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                            {sparklineData.map((d, i) => (
                                <span key={i} style={{ fontSize: 9, color: '#4a5568' }}>{MONTH_SHORT[d.month]}</span>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div style={{ height: '54px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <p style={{ fontSize: '11px', color: '#4a5568', margin: 0 }}>No trend data yet</p>
                    </div>
                )}

                {/* Top Spending */}
                {topCategory ? (
                    <div style={{ marginTop: '12px' }}>
                        <p style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#4a5568', fontWeight: 600, margin: '0 0 8px 0' }}>Top Spending</p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: topCategory.color || '#f43f5e', flexShrink: 0 }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <p style={{ fontSize: '12px', color: '#c8d4f0', fontWeight: 500, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{topCategory.name}</p>
                                <p style={{ fontSize: '10px', color: '#8892aa', margin: '1px 0 0 0' }}>{topCategoryPct}% of expenses</p>
                            </div>
                            <p style={{ fontSize: '12px', color: '#f43f5e', fontWeight: 600, margin: 0, flexShrink: 0 }}>
                                {'₹' + Math.round(topCategoryAmt).toLocaleString('en-IN')}
                            </p>
                        </div>
                        <div style={{ height: '4px', background: 'rgba(255,255,255,0.08)', borderRadius: '2px', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${Math.min(topCategoryPct, 100)}%`, background: 'linear-gradient(90deg,#f43f5e,#f97316)', borderRadius: '2px' }} />
                        </div>
                    </div>
                ) : (
                    <div style={{ marginTop: '12px' }}>
                        <p style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#4a5568', fontWeight: 600, margin: '0 0 6px 0' }}>Top Spending</p>
                        <div style={{ fontSize: 12, color: '#4a5568' }}>No spending data yet</div>
                    </div>
                )}
            </div>

            {/* DIVIDER 2 */}
            {!isMobile && <div style={{ background: 'rgba(255,255,255,0.07)', width: 1, margin: '0 20px', alignSelf: 'stretch' }} />}
            {isMobile && <div style={{ height: 1, background: 'rgba(255,255,255,0.07)' }} />}

            {/* RIGHT — AI Insight */}
            <div style={{ position: 'relative', zIndex: 1 }}>
                <p style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#4a5568', fontWeight: 600, margin: '0 0 10px 0' }}>✦ AI Insight</p>
                <p style={{ fontSize: '13px', color: '#c8d4f0', lineHeight: 1.55, margin: '0 0 12px 0' }}>
                    {aiReport
                        ? aiReport.slice(0, 120) + (aiReport.length > 120 ? '…' : '')
                        : 'Tap generate to get your monthly AI summary.'}
                </p>
                <button
                    onClick={handleGenerateReport}
                    disabled={aiReportLoading}
                    style={{ width: '100%', padding: '7px 14px', background: 'linear-gradient(135deg,#1d4ed8,#3b82f6)', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: aiReportLoading ? 'wait' : 'pointer', fontFamily: 'DM Sans, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', opacity: aiReportLoading ? 0.7 : 1 }}
                >
                    {aiReportLoading
                        ? <><span style={{ width: '11px', height: '11px', border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />Generating…</>
                        : aiReport ? 'Regenerate Report' : 'Generate Report'}
                </button>
            </div>
        </div>
    );

    return (
        <AppLayout>
            {/* Salary Banner */}
            {salaryData && !salaryBannerDismissed && salaryData.plan && (
                <div style={{ background: 'linear-gradient(135deg, rgba(16,185,129,0.08), rgba(59,130,246,0.06))', border: '1px solid rgba(16,185,129,0.25)', borderRadius: '16px', padding: '16px 20px', marginBottom: '16px', position: 'relative' }}>
                    <button onClick={dismissSalaryBanner} style={{ position: 'absolute', top: '12px', right: '12px', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1rem', lineHeight: 1 }}>✕</button>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                        <span style={{ fontSize: '1.1rem' }}>💰</span>
                        <span style={{ fontFamily: 'Sora, sans-serif', fontSize: '0.9rem', fontWeight: 600, color: 'var(--accent-green)' }}>Salary Detected — AI Allocation Plan</span>
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

            {/* Page header */}
            <div style={{ marginBottom: '16px' }}>
                <h1 style={{ fontFamily: 'Sora, sans-serif', fontSize: '1.4rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Dashboard</h1>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', margin: '4px 0 0 0' }}>{MONTH_NAMES[month]} {year} — Overview</p>
            </div>

            {/* ── DESKTOP BENTO GRID ── */}
            {!isMobile ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {/* Row 1 — Stat tiles */}
                    {dataLoading ? (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
                            {[1, 2, 3, 4].map(i => <div key={i} style={{ background: 'var(--bg-card)', border: '0.5px solid var(--bg-border)', borderRadius: '14px', height: '90px' }} />)}
                        </div>
                    ) : summary && (
                        <StatsCards totalIncome={summary.total_income} totalExpenses={summary.total_expenses} balance={summary.balance} savingsRate={summary.savings_rate} currency={user.currency} month={month} year={year} />
                    )}

                    {/* Row 2 — Hero card */}
                    <HeroCard />

                    {/* Row 3 — Budget tile */}
                    <div style={{ background: 'var(--bg-card)', border: '0.5px solid var(--bg-border)', borderRadius: '12px', padding: '20px', overflow: 'hidden' }}>
                        <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '0 0 14px 0', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Budgets</p>
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
                            {[1, 2, 3, 4].map(i => <div key={i} style={{ background: 'var(--bg-card)', border: '0.5px solid var(--bg-border)', borderRadius: '14px', height: '80px' }} />)}
                        </div>
                    ) : summary && (
                        <StatsCards totalIncome={summary.total_income} totalExpenses={summary.total_expenses} balance={summary.balance} savingsRate={summary.savings_rate} currency={user.currency} month={month} year={year} />
                    )}

                    {/* Hero */}
                    <HeroCard />


                    {/* Budgets */}
                    <div style={{ background: 'var(--bg-card)', border: '0.5px solid var(--bg-border)', borderRadius: '12px', padding: '20px', overflow: 'hidden' }}>
                        <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: '0 0 14px 0', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Budgets</p>
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

            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </AppLayout>
    );
}
