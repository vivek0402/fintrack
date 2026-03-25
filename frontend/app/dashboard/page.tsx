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
import { TrendChart } from '@/components/dashboard/TrendChart';
import { CategoryChart } from '@/components/dashboard/CategoryChart';
import { RecentTransactions } from '@/components/dashboard/RecentTransactions';
import { BudgetAlerts } from '@/components/dashboard/BudgetAlerts';
import { SpendingForecast } from '@/components/dashboard/SpendingForecast';

const MONTH_NAMES = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

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

    // Salary intelligence state
    const [salaryData, setSalaryData] = useState<any>(null);
    const [salaryBannerDismissed, setSalaryBannerDismissed] = useState(false);

    // AI Insights state
    const [aiReport, setAiReport] = useState('');
    const [aiReportLoading, setAiReportLoading] = useState(false);

    // Afford check state
    const [affordQuery, setAffordQuery] = useState('');
    const [affordResult, setAffordResult] = useState<{ recommendation: string; sentiment: string } | null>(null);
    const [affordLoading, setAffordLoading] = useState(false);

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

        // Fetch salary intelligence silently
        aiAPI.salaryIntelligence().then(res => {
            if (res.data.detected) setSalaryData(res.data);
        }).catch(() => {});
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

    const handleAffordCheck = async () => {
        if (!affordQuery.trim()) return;
        setAffordLoading(true);
        setAffordResult(null);
        try {
            const res = await aiAPI.afford(affordQuery);
            setAffordResult(res.data);
        } catch {
            setAffordResult({ recommendation: 'Unable to analyse right now. Please try again.', sentiment: 'cautious' });
        } finally {
            setAffordLoading(false);
        }
    };

    const sentimentBorder = (s: string) => {
        if (s === 'positive') return 'var(--accent-green)';
        if (s === 'negative') return 'var(--accent-red)';
        return '#f59e0b';
    };
    const sentimentBg = (s: string) => {
        if (s === 'positive') return 'var(--accent-green-bg)';
        if (s === 'negative') return 'var(--accent-red-bg)';
        return 'rgba(245,158,11,0.08)';
    };

    if (isLoading || !user) return (
        <AppLayout>
            <div style={{ marginBottom: '24px' }}>
                <SkeletonTitle />
                <Skeleton width="40%" height={14} borderRadius={4} style={{ marginTop: '8px' }} />
            </div>
            <SkeletonCard height={160} style={{ marginBottom: '16px' }} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '16px', marginBottom: '16px' }}>
                {[1,2,3,4].map(i => <SkeletonCard key={i} height={80} />)}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '16px', marginBottom: '16px' }}>
                <SkeletonCard height={200} />
                <SkeletonCard height={200} />
            </div>
            <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--bg-border)', borderRadius: '16px', padding: '20px' }}>
                <Skeleton width="30%" height={16} borderRadius={4} style={{ marginBottom: '16px' }} />
                {[1,2,3,4,5].map(i => (
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

    return (
        <AppLayout>
            {/* Salary Intelligence Banner */}
            {salaryData && !salaryBannerDismissed && salaryData.plan && (
                <div style={{ background: 'linear-gradient(135deg, rgba(16,185,129,0.08), rgba(59,130,246,0.06))', border: '1px solid rgba(16,185,129,0.25)', borderRadius: '16px', padding: '16px 20px', marginBottom: '20px', position: 'relative' }}>
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

            <div style={{ marginBottom: '24px' }}>
                <h1 style={{ fontFamily: 'Sora, sans-serif', fontSize: '1.4rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Dashboard</h1>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', margin: '4px 0 0 0' }}>{MONTH_NAMES[month]} {year} — Overview</p>
            </div>

            <BudgetAlerts budgets={budgets} currency={user.currency} />
            <SpendingForecast forecast={forecast} currency={user.currency} />

            {dataLoading ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                    {[1, 2, 3, 4].map(i => <div key={i} style={{ height: '110px', background: 'var(--bg-secondary)', border: '1px solid var(--bg-border)', borderRadius: '16px' }} />)}
                </div>
            ) : summary && (
                <StatsCards
                    totalIncome={summary.total_income}
                    totalExpenses={summary.total_expenses}
                    balance={summary.balance}
                    savingsRate={summary.savings_rate}
                    currency={user.currency}
                />
            )}

            {/* AI Insights + Afford Check row */}
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                {/* AI Insights card */}
                <div className="fintrack-card" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--bg-border)', borderLeft: '3px solid var(--accent-blue)', borderRadius: '16px', padding: '20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                        <span style={{ fontSize: '1.1rem' }}>✨</span>
                        <span style={{ fontFamily: 'Sora, sans-serif', fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>AI Insights</span>
                    </div>
                    {aiReport ? (
                        <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', lineHeight: 1.6, margin: '0 0 12px 0' }}>{aiReport}</p>
                    ) : (
                        <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: '0 0 12px 0' }}>Get a plain-English summary of your spending this month.</p>
                    )}
                    <button
                        onClick={handleGenerateReport}
                        disabled={aiReportLoading}
                        style={{ padding: '8px 16px', background: 'var(--accent-blue-bg)', border: '1px solid var(--accent-blue-border, var(--bg-border))', borderRadius: '8px', color: 'var(--accent-blue)', fontSize: '0.78rem', fontWeight: 600, cursor: aiReportLoading ? 'wait' : 'pointer', fontFamily: 'DM Sans, sans-serif', display: 'flex', alignItems: 'center', gap: '6px', opacity: aiReportLoading ? 0.7 : 1 }}
                    >
                        {aiReportLoading ? (
                            <>
                                <span style={{ width: '12px', height: '12px', border: '2px solid var(--accent-blue)', borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />
                                Generating…
                            </>
                        ) : aiReport ? 'Regenerate' : 'Generate Report'}
                    </button>
                </div>

                {/* Can I afford this? */}
                <div className="fintrack-card" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--bg-border)', borderRadius: '16px', padding: '20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                        <span style={{ fontSize: '1.1rem' }}>🤔</span>
                        <span style={{ fontFamily: 'Sora, sans-serif', fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>Can I afford this?</span>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                        <input
                            type="text"
                            placeholder="e.g. iPhone 15 for ₹79,000"
                            value={affordQuery}
                            onChange={e => setAffordQuery(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleAffordCheck()}
                            style={{ flex: 1, padding: '8px 12px', background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--bg-border)', borderRadius: '8px', fontSize: '0.82rem', fontFamily: 'DM Sans, sans-serif', outline: 'none' }}
                        />
                        <button
                            onClick={handleAffordCheck}
                            disabled={affordLoading || !affordQuery.trim()}
                            style={{ padding: '8px 14px', background: 'var(--bg-card)', border: '1px solid var(--bg-border)', borderRadius: '8px', color: 'var(--text-secondary)', fontSize: '0.78rem', fontWeight: 600, cursor: affordLoading || !affordQuery.trim() ? 'not-allowed' : 'pointer', fontFamily: 'DM Sans, sans-serif', opacity: affordLoading || !affordQuery.trim() ? 0.6 : 1 }}
                        >
                            {affordLoading ? '…' : 'Ask AI'}
                        </button>
                    </div>
                    {affordResult && (
                        <div style={{ padding: '10px 14px', background: sentimentBg(affordResult.sentiment), border: `1px solid ${sentimentBorder(affordResult.sentiment)}`, borderRadius: '10px', fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                            {affordResult.recommendation}
                        </div>
                    )}
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 320px', gap: '16px', marginBottom: '16px' }}>
                <TrendChart trends={trends} />
                <CategoryChart data={categories} currency={user.currency} />
            </div>

            <RecentTransactions transactions={transactions} currency={user.currency} />

            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </AppLayout>
    );
}
