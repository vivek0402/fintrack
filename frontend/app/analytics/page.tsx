'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useAuthStore } from '@/store/authStore';
import { analyticsAPI, transactionsAPI, aiAPI, accountsAPI } from '@/lib/api';
import { AppLayout } from '@/components/layout/AppLayout';
import { Skeleton, SkeletonTitle, SkeletonCard, SkeletonText } from '@/components/ui/Skeleton';
import { useIsMobile } from '@/hooks/useWindowSize';
import { Button } from '@/components/ui/Button';
import { TrendingUp, TrendingDown, Award, Calendar, Download, Sparkles, RefreshCw, Wallet } from 'lucide-react';
import { formatCurrency, exportToCSV } from '@/lib/utils';
import PageHelp from '@/components/ui/PageHelp';
import { PageShell } from '@/components/layout/PageShell';

const MONTH_NAMES = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const FULL_MONTHS = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function AnalyticsPage() {
    const router = useRouter();
    const { user, isLoading, loadFromStorage } = useAuthStore();
    const isMobile = useIsMobile();
    const currentMonth = new Date().getMonth() + 1;
    const currentYear = new Date().getFullYear();

    const [allTransactions, setAllTransactions] = useState<any[]>([]);
    const [summary, setSummary] = useState<any>(null);
    const [trends, setTrends] = useState<any[]>([]);
    const [categories, setCategories] = useState<any[]>([]);
    const [yearlyData, setYearlyData] = useState<any>(null);
    const [paymentMethods, setPaymentMethods] = useState<any[]>([]);
    const [paymentTotal, setPaymentTotal] = useState(0);
    const [regretData, setRegretData] = useState<any>(null);
    const [regretLoading, setRegretLoading] = useState(false);
    const [accounts, setAccounts] = useState<any[]>([]);
    const [accountsLoading, setAccountsLoading] = useState(true);
    const [allocationPlan, setAllocationPlan] = useState<any>(null);
    const [allocationLoading, setAllocationLoading] = useState(false);
    const [allocationError, setAllocationError] = useState('');
    const [planGenerated, setPlanGenerated] = useState(false);

    useEffect(() => { loadFromStorage(); }, []);
    useEffect(() => { if (!isLoading && !user) router.push('/login'); }, [user, isLoading]);

    useEffect(() => {
        if (!user) return;
        const fetchData = async () => {
            try {
                const [summaryRes, trendsRes, allTxRes, yearlyRes, pmRes] = await Promise.all([
                    analyticsAPI.summary({ month: currentMonth, year: currentYear }),
                    analyticsAPI.trends(),
                    transactionsAPI.getAll(),
                    analyticsAPI.yearly(currentYear),
                    analyticsAPI.paymentMethods({ month: currentMonth, year: currentYear }),
                ]);
                setSummary(summaryRes.data.summary);
                setCategories(summaryRes.data.category_breakdown);
                setTrends(trendsRes.data.trends);
                setAllTransactions(allTxRes.data.transactions);
                setYearlyData(yearlyRes.data);
                setPaymentMethods(pmRes.data.breakdown || []);
                setPaymentTotal(pmRes.data.total || 0);
            } catch (err) { console.error(err); }
        };
        fetchData();
        accountsAPI.getAll()
            .then((res: any) => setAccounts(res.data.accounts || []))
            .catch(() => setAccounts([]))
            .finally(() => setAccountsLoading(false));
    }, [user]);

    const barData = (() => {
        const map: Record<string, any> = {};
        trends.forEach(row => {
            const key = `${row.year}-${row.month}`;
            if (!map[key]) map[key] = { month: MONTH_NAMES[row.month], income: 0, expenses: 0 };
            if (row.type === 'income') map[key].income = parseFloat(row.total);
            else map[key].expenses = parseFloat(row.total);
        });
        return Object.values(map);
    })();

    const totalExpenses = categories.reduce((s, c) => s + parseFloat(c.total), 0);
    const monthlyExpenses = barData.map(d => d.expenses).filter(v => v > 0);
    const avgMonthlyExpense = monthlyExpenses.length ? monthlyExpenses.reduce((a, b) => a + b, 0) / monthlyExpenses.length : 0;
    const bestMonth = barData.reduce((best, curr) => (curr.income - curr.expenses) > ((best?.income || 0) - (best?.expenses || 0)) ? curr : best, barData[0]);

    const CustomTooltip = ({ active, payload, label }: any) => {
        if (!active || !payload?.length) return null;
        return (
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--bg-border)', borderRadius: '12px', padding: '12px 16px', fontSize: '0.8rem' }}>
                <p style={{ color: 'var(--text-secondary)', margin: '0 0 8px 0', fontWeight: 600 }}>{label}</p>
                {payload.map((p: any) => <p key={p.name} style={{ color: p.fill, margin: '4px 0' }}>{p.name}: ₹{p.value?.toLocaleString('en-IN')}</p>)}
            </div>
        );
    };

    // Year over year helpers
    const getTotal = (year: number, type: string) => {
        if (!yearlyData) return 0;
        const row = yearlyData.totals.find((t: any) => parseInt(t.year) === year && t.type === type);
        return row ? parseFloat(row.total) : 0;
    };
    const pctChange = (curr: number, last: number) => last === 0 ? null : ((curr - last) / last * 100).toFixed(1);

    if (isLoading || !user) return (
        <AppLayout>
            <div style={{ marginBottom: '24px' }}>
                <SkeletonTitle />
                <Skeleton width="40%" height={14} borderRadius={4} style={{ marginTop: '8px' }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                {[1,2,3].map(i => <Skeleton key={i} height={72} borderRadius={12} />)}
            </div>
            <SkeletonCard height={240} style={{ marginBottom: '16px' }} />
            <div style={{ background: 'var(--surface-1)', border: '1px solid var(--bg-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-6)' }}>
                <Skeleton width="40%" height={16} borderRadius={4} style={{ marginBottom: '16px' }} />
                {[1,2,3,4,5,6].map(i => (
                    <div key={i} style={{ marginBottom: '14px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                            <Skeleton width="35%" height={14} borderRadius={4} />
                            <Skeleton width={60} height={14} borderRadius={4} />
                        </div>
                        <Skeleton width="100%" height={6} borderRadius={4} />
                    </div>
                ))}
            </div>
        </AppLayout>
    );

    const totalBalance = accounts.reduce((s: number, a: any) => s + parseFloat(a.current_balance ?? a.starting_balance ?? 0), 0);

    const hexToRgba = (hex: string, alpha: number) => {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r},${g},${b},${alpha})`;
    };

    const handleGeneratePlan = async (force?: boolean) => {
        setAllocationLoading(true);
        setAllocationError('');
        try {
            const res = await aiAPI.salaryAllocation(force);
            setAllocationPlan(res.data);
            setPlanGenerated(true);
        } catch (err: any) {
            setAllocationError(err?.response?.status === 429
                ? 'AI is taking a short break due to high usage. Please try again in a few minutes.'
                : 'Failed to generate plan. Please try again.');
        } finally {
            setAllocationLoading(false);
        }
    };

    return (
        <AppLayout>
            <div style={{ animation: 'fadeUp 200ms ease forwards' }}>
            <PageShell
                title="Analytics"
                subtitle="Deep insights into your spending"
                headerRight={
                    <>
                        <Button variant="secondary" size="md" onClick={() => void exportToCSV(allTransactions, 'fintrack-all.csv')}><Download size={16} />Export All</Button>
                        <PageHelp title="Analytics" sections={[
                            { icon: '🥧', heading: 'What is this page?', body: 'A detailed breakdown of where your money went. Switch between chart views to see spending by category.' },
                            { icon: '📉', heading: 'Category Breakdown', body: 'Each category shows a progress bar and percentage of total spending. The longest bar is your biggest expense area.' },
                            { icon: '🏦', heading: 'Bank Accounts', body: 'Track your account balances here. Add accounts with starting balances to get an accurate net worth picture.' },
                            { icon: '💼', heading: 'Salary Allocation', body: "Tap 'Generate Plan' to get an AI-recommended 50/30/20 budget split based on your actual income and spending history." },
                        ]} />
                    </>
                }
            >

            {/* Bank Balances card */}
            {(accountsLoading || accounts.length > 0) && (
                <div style={{ background: 'var(--surface-1)', border: '1px solid var(--bg-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-6)', marginBottom: 'var(--space-6)' }}>
                    {/* Header */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '12px', flexDirection: isMobile ? 'column' : 'row' }}>
                        <div>
                            <p style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>Bank Balances</p>
                            <p style={{ margin: '2px 0 0', fontSize: '13px', color: 'var(--text-muted)' }}>Live balances across all your accounts</p>
                        </div>
                        {!accountsLoading && (
                            <div style={{ textAlign: isMobile ? 'left' : 'right' }}>
                                <p style={{ margin: '0 0 2px', fontSize: '11px', color: 'var(--text-muted)' }}>Total Balance</p>
                                <p style={{ margin: 0, fontSize: '22px', fontWeight: 700, color: totalBalance >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                                    ₹{Math.round(totalBalance).toLocaleString('en-IN')}
                                </p>
                            </div>
                        )}
                    </div>

                    {/* Tiles row */}
                    <div style={{ display: 'flex', gap: '12px', overflowX: 'auto', paddingBottom: '4px', scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>
                        {accountsLoading
                            ? [1, 2, 3].map(i => (
                                <div key={i} style={{ minWidth: '170px', height: '140px', backgroundColor: 'var(--bg-hover)', borderRadius: '12px', flex: '0 0 auto', animation: 'pulse 1.5s ease-in-out infinite', opacity: 0.5 }} />
                            ))
                            : accounts.map((account: any) => {
                                const bal = Number(account.current_balance);
                                const net = bal - Number(account.starting_balance);
                                return (
                                    <div key={account.id} style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--bg-border)', borderLeft: `3px solid ${account.color || '#3b82f6'}`, borderRadius: '12px', padding: '14px 16px', minWidth: '170px', flex: '0 0 auto' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span style={{ fontSize: '16px' }}>{account.icon || '🏦'}</span>
                                            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{account.name}</span>
                                            {account.is_default && (
                                                <span style={{ fontSize: '10px', color: 'var(--accent-blue)', backgroundColor: 'rgba(59,130,246,0.1)', borderRadius: '4px', padding: '1px 6px', marginLeft: 'auto', flexShrink: 0 }}>default</span>
                                            )}
                                        </div>
                                        <p style={{ margin: '10px 0 0', fontSize: '20px', fontWeight: 700, color: bal >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>₹{Math.round(bal).toLocaleString('en-IN')}</p>
                                        <p style={{ margin: '2px 0 0', fontSize: '11px', color: 'var(--text-muted)' }}>Started ₹{Math.round(Number(account.starting_balance)).toLocaleString('en-IN')}</p>
                                        <p style={{ margin: '4px 0 0', fontSize: '12px', color: net >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>{net >= 0 ? '▲ +' : '▼ '}₹{Math.abs(Math.round(net)).toLocaleString('en-IN')} net</p>
                                        <div style={{ height: '1px', backgroundColor: 'var(--bg-border)', margin: '10px 0' }} />
                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <div>
                                                <p style={{ margin: 0, fontSize: '12px', fontWeight: 600, color: 'var(--accent-green)' }}>₹{Math.round(Number(account.total_income)).toLocaleString('en-IN')}</p>
                                                <p style={{ margin: 0, fontSize: '10px', color: 'var(--text-muted)' }}>in</p>
                                            </div>
                                            <div style={{ textAlign: 'right' }}>
                                                <p style={{ margin: 0, fontSize: '12px', fontWeight: 600, color: 'var(--accent-red)' }}>₹{Math.round(Number(account.total_expenses)).toLocaleString('en-IN')}</p>
                                                <p style={{ margin: 0, fontSize: '10px', color: 'var(--text-muted)' }}>out</p>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        }
                    </div>

                    {/* Footer link */}
                    {!accountsLoading && (
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
                            <span onClick={() => router.push('/profile')} style={{ fontSize: '12px', color: 'var(--accent-blue)', cursor: 'pointer' }}>Manage accounts →</span>
                        </div>
                    )}
                </div>
            )}

            {/* Salary Allocation Plan */}
            <div style={{ background: 'var(--surface-1)', border: '1px solid var(--bg-border)', borderRadius: 'var(--radius-lg)', marginBottom: 'var(--space-6)', overflow: 'hidden' }}>
                {/* Prompt screen */}
                {!planGenerated && !allocationLoading && (
                    <div style={{ padding: '32px 24px', textAlign: 'center' }}>
                        <Wallet size={48} color="var(--accent-blue)" style={{ margin: '0 auto' }} />
                        <p style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', margin: '12px 0 0' }}>Salary Allocation Plan</p>
                        <p style={{ fontSize: '14px', color: 'var(--text-secondary)', maxWidth: '480px', margin: '8px auto 20px', lineHeight: 1.6 }}>
                            Get a personalised AI plan that splits your salary using the 50/30/20 rule, your financial goals, and Indian spending context — compared against what you actually spent last month.
                        </p>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '24px' }}>
                            {['50/30/20 Rule', 'Goal-Based', 'Indian Context'].map(pill => (
                                <span key={pill} style={{ backgroundColor: 'var(--bg-hover)', border: '1px solid var(--bg-border)', borderRadius: '20px', padding: '4px 12px', fontSize: '12px', color: 'var(--text-secondary)' }}>{pill}</span>
                            ))}
                        </div>
                        {allocationError && (
                            <p style={{ color: 'var(--accent-red)', fontSize: '13px', marginBottom: '12px' }}>{allocationError}</p>
                        )}
                        <Button onClick={() => handleGeneratePlan()} variant="primary" size="md">
                            <Sparkles size={16} />Generate My Plan
                        </Button>
                    </div>
                )}

                {/* Loading state */}
                {allocationLoading && (
                    <div style={{ padding: '48px 24px', textAlign: 'center' }}>
                        <div style={{ width: '32px', height: '32px', borderRadius: '50%', border: '3px solid var(--bg-border)', borderTop: '3px solid var(--accent-blue)', animation: 'spin 0.8s linear infinite', margin: '0 auto' }} />
                        <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginTop: '16px' }}>Analysing your spending patterns...</p>
                    </div>
                )}

                {/* Plan display */}
                {planGenerated && allocationPlan && !allocationLoading && (
                    <div style={{ padding: '24px' }}>
                        {/* Plan header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
                            <div>
                                <p style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>Salary Allocation Plan</p>
                                <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-secondary)', maxWidth: '500px' }}>{allocationPlan.summary}</p>
                                {allocationPlan.from_cache && (
                                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
                                        Cached result · Updates every 6 hours
                                        <span onClick={() => handleGeneratePlan(true)} style={{ color: 'var(--accent-blue)', cursor: 'pointer', marginLeft: '4px' }}>
                                            Refresh now
                                        </span>
                                    </span>
                                )}
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <p style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: 'var(--accent-green)' }}>₹{Math.round(allocationPlan.salary).toLocaleString('en-IN')}</p>
                                <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-muted)' }}>monthly salary</p>
                                <Button onClick={() => handleGeneratePlan(true)} variant="secondary" size="sm" style={{ marginTop: '8px', marginLeft: 'auto' }}>
                                    <RefreshCw size={12} />Regenerate
                                </Button>
                            </div>
                        </div>

                        {/* Month comparison banner */}
                        {allocationPlan.month_comparison && (
                            <div style={{ backgroundColor: 'var(--bg-hover)', borderRadius: '10px', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
                                <span style={{ fontSize: '13px', color: allocationPlan.month_comparison.trend === 'improving' ? 'var(--accent-green)' : allocationPlan.month_comparison.trend === 'worsening' ? 'var(--accent-red)' : 'var(--text-muted)' }}>
                                    {allocationPlan.month_comparison.trend === 'improving' ? '▲ Spending improved vs last month' : allocationPlan.month_comparison.trend === 'worsening' ? '▼ Spending increased vs last month' : '→ Spending stable vs last month'}
                                </span>
                                <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                                    Biggest change: {allocationPlan.month_comparison.biggest_change_category} {allocationPlan.month_comparison.biggest_change_amount >= 0 ? '+' : ''}₹{Math.abs(Math.round(allocationPlan.month_comparison.biggest_change_amount)).toLocaleString('en-IN')}
                                </span>
                            </div>
                        )}

                        {/* Bucket cards grid */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px', marginBottom: '20px' }}>
                            {allocationPlan.allocation?.map((bucket: any) => (
                                <div key={bucket.bucket} style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--bg-border)', borderLeft: `4px solid ${bucket.color}`, borderRadius: '12px', padding: '18px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                        <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>{bucket.bucket}</span>
                                        <span style={{ backgroundColor: hexToRgba(bucket.color, 0.12), color: bucket.color, borderRadius: '20px', padding: '2px 10px', fontSize: '12px', fontWeight: 600 }}>{bucket.percentage}%</span>
                                    </div>
                                    <p style={{ margin: 0, fontSize: '22px', fontWeight: 700, color: bucket.color }}>₹{Math.round(bucket.amount).toLocaleString('en-IN')}</p>
                                    <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--text-muted)' }}>{bucket.description}</p>
                                    <div style={{ height: '4px', borderRadius: '2px', backgroundColor: 'var(--bg-hover)', margin: '12px 0' }}>
                                        <div style={{ height: '100%', width: `${bucket.percentage}%`, backgroundColor: bucket.color, borderRadius: '2px' }} />
                                    </div>
                                    <div>
                                        {bucket.categories?.map((cat: any, ci: number) => (
                                            <div key={cat.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: ci < bucket.categories.length - 1 ? '1px solid var(--bg-border)' : 'none' }}>
                                                <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{cat.name}</span>
                                                <div style={{ textAlign: 'right' }}>
                                                    <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                                        {cat.recommended_amount > cat.last_month_actual ? <span style={{ color: 'var(--accent-green)', fontSize: '10px' }}>▲ </span> : cat.recommended_amount < cat.last_month_actual ? <span style={{ color: 'var(--accent-red)', fontSize: '10px' }}>▼ </span> : null}
                                                        ₹{Math.round(cat.recommended_amount).toLocaleString('en-IN')}
                                                    </p>
                                                    <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-muted)' }}>actual: ₹{Math.round(cat.last_month_actual).toLocaleString('en-IN')}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Insights */}
                        {allocationPlan.insights?.length > 0 && (
                            <div>
                                <p style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>Insights</p>
                                {allocationPlan.insights.map((insight: string, i: number) => (
                                    <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '10px 14px', backgroundColor: 'var(--bg-hover)', borderRadius: '10px', marginBottom: '8px' }}>
                                        <div style={{ width: '20px', height: '20px', borderRadius: '50%', backgroundColor: 'rgba(59,130,246,0.15)', color: 'var(--accent-blue)', fontSize: '11px', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i + 1}</div>
                                        <span style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{insight}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Key Metrics */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '16px', marginBottom: '24px' }}>
                {[
                    { label: 'This Month Income', value: formatCurrency(summary?.total_income || 0, user.currency), icon: TrendingUp, color: 'var(--accent-green)', bg: 'var(--accent-green-bg)', border: 'var(--accent-green-border)' },
                    { label: 'This Month Expenses', value: formatCurrency(summary?.total_expenses || 0, user.currency), icon: TrendingDown, color: 'var(--accent-red)', bg: 'var(--accent-red-bg)', border: 'var(--accent-red-border)' },
                    { label: 'Avg Monthly Expense', value: formatCurrency(avgMonthlyExpense, user.currency), icon: Calendar, color: 'var(--accent-yellow)', bg: 'var(--accent-yellow-bg)', border: 'var(--accent-yellow-border)' },
                    { label: 'Best Savings Month', value: bestMonth?.month || '—', icon: Award, color: 'var(--accent-blue)', bg: 'var(--accent-blue-bg)', border: 'var(--accent-blue-border)' },
                ].map(card => {
                    const Icon = card.icon;
                    return (
                        <div key={card.label} style={{ background: 'var(--surface-1)', border: '1px solid var(--bg-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-6)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                                <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 500 }}>{card.label}</span>
                                <div style={{ width: '32px', height: '32px', background: card.bg, border: `1px solid ${card.border}`, borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <Icon size={15} color={card.color} />
                                </div>
                            </div>
                            <p style={{ fontFamily: "'DM Mono', monospace", fontSize: '1.3rem', fontWeight: 700, color: card.color, margin: 0 }}>{card.value}</p>
                        </div>
                    );
                })}
            </div>

            {/* Bar Chart */}
            <div style={{ background: 'var(--surface-1)', border: '1px solid var(--bg-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-6)', marginBottom: 'var(--space-4)' }}>
                <h3 style={{ fontFamily: "'Cabinet Grotesk', 'Sora', sans-serif", fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 20px 0' }}>Monthly Income vs Expenses</h3>
                {barData.length === 0 ? (
                    <div style={{ height: '240px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>No data yet</div>
                ) : (
                    <ResponsiveContainer width="100%" height={280}>
                        <BarChart data={barData} barGap={4}>
                            <XAxis dataKey="month" tick={{ fill: 'var(--text-secondary)', fontSize: 12, fontFamily: "'DM Mono', monospace" }} axisLine={{ stroke: 'var(--bg-border)' }} tickLine={false} />
                            <Tooltip content={<CustomTooltip />} />
                            <Bar dataKey="income" name="Income" fill="var(--accent-green)" radius={[4, 4, 0, 0]} isAnimationActive={true} animationDuration={800} />
                            <Bar dataKey="expenses" name="Expenses" fill="var(--accent-red)" radius={[4, 4, 0, 0]} isAnimationActive={true} animationDuration={800} />
                        </BarChart>
                    </ResponsiveContainer>
                )}
            </div>

            {/* Category Breakdown */}
            <div style={{ marginBottom: '16px' }}>
                <div style={{ background: 'var(--surface-1)', border: '1px solid var(--bg-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-6)' }}>
                    <h3 style={{ fontFamily: "'Cabinet Grotesk', 'Sora', sans-serif", fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 16px 0' }}>Category Breakdown — {FULL_MONTHS[currentMonth]}</h3>
                    {categories.length === 0 ? (
                        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>No expense data this month</div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {categories.map(cat => {
                                const pct = totalExpenses > 0 ? (parseFloat(cat.total) / totalExpenses) * 100 : 0;
                                return (
                                    <div key={cat.name}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: cat.color }} />
                                                <span style={{ fontSize: '0.875rem', color: 'var(--text-primary)', fontWeight: 500 }}>{cat.name}</span>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{pct.toFixed(1)}%</span>
                                                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.875rem', fontWeight: 600, color: 'var(--accent-red)', minWidth: '80px', textAlign: 'right' }}>{formatCurrency(parseFloat(cat.total), user.currency)}</span>
                                            </div>
                                        </div>
                                        <div style={{ height: '6px', background: 'var(--accent-blue-bg)', borderRadius: '3px', overflow: 'hidden' }}>
                                            <div style={{ height: '100%', width: `${pct}%`, background: 'var(--accent-blue)', borderRadius: '3px', transition: 'width 0.5s ease' }} />
                                        </div>
                                    </div>
                                );
                            })}
                            <div style={{ borderTop: '1px solid var(--bg-border)', paddingTop: '12px', display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>Total</span>
                                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.875rem', fontWeight: 700, color: 'var(--accent-red)' }}>{formatCurrency(totalExpenses, user.currency)}</span>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Payment Methods */}
            {paymentMethods.length > 0 && (
                <div style={{ background: 'var(--surface-1)', border: '1px solid var(--bg-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-6)', marginBottom: 'var(--space-4)' }}>
                    <h3 style={{ fontFamily: "'Cabinet Grotesk', 'Sora', sans-serif", fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 16px 0' }}>Payment Methods — {FULL_MONTHS[currentMonth]}</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {paymentMethods.map(pm => {
                            const METHOD_COLORS: Record<string, string> = {
                                'UPI': 'var(--accent-green)',
                                'Credit Card': 'var(--accent-red)',
                                'Debit Card': 'var(--accent-blue)',
                                'Net Banking': 'var(--accent-purple)',
                                'Wallet': 'var(--accent-yellow)',
                                'Cash': 'var(--text-muted)',
                            };
                            const color = METHOD_COLORS[pm.method] || 'var(--text-muted)';
                            return (
                                <div key={pm.method}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: color }} />
                                            <span style={{ fontSize: '0.875rem', color: 'var(--text-primary)', fontWeight: 500 }}>{pm.method}</span>
                                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{pm.count} txn{pm.count !== 1 ? 's' : ''}</span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{pm.percent}%</span>
                                            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.875rem', fontWeight: 600, color: 'var(--accent-red)', minWidth: '80px', textAlign: 'right' }}>₹{Math.round(pm.total).toLocaleString('en-IN')}</span>
                                        </div>
                                    </div>
                                    <div style={{ height: '6px', background: 'var(--bg-border)', borderRadius: '3px', overflow: 'hidden' }}>
                                        <div style={{ height: '100%', width: `${pm.percent}%`, background: color, borderRadius: '3px', transition: 'width 0.5s ease' }} />
                                    </div>
                                </div>
                            );
                        })}
                        <div style={{ borderTop: '1px solid var(--bg-border)', paddingTop: '12px', display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>Total</span>
                            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: '0.875rem', fontWeight: 700, color: 'var(--accent-red)' }}>₹{Math.round(paymentTotal).toLocaleString('en-IN')}</span>
                        </div>
                    </div>
                </div>
            )}

            {/* Year over Year */}
            {yearlyData && (
                <div style={{ background: 'var(--surface-1)', border: '1px solid var(--bg-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-6)' }}>
                    <h3 style={{ fontFamily: "'Cabinet Grotesk', 'Sora', sans-serif", fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 16px 0' }}>
                        Year-over-Year — {yearlyData.years.current} vs {yearlyData.years.last}
                    </h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                        {[
                            { label: `${yearlyData.years.current} Income`, curr: getTotal(yearlyData.years.current, 'income'), last: getTotal(yearlyData.years.last, 'income'), color: 'var(--accent-green)' },
                            { label: `${yearlyData.years.current} Expenses`, curr: getTotal(yearlyData.years.current, 'expense'), last: getTotal(yearlyData.years.last, 'expense'), color: 'var(--accent-red)' },
                            { label: `${yearlyData.years.current} Savings`, curr: getTotal(yearlyData.years.current, 'income') - getTotal(yearlyData.years.current, 'expense'), last: getTotal(yearlyData.years.last, 'income') - getTotal(yearlyData.years.last, 'expense'), color: 'var(--accent-blue)' },
                        ].map(card => {
                            const change = pctChange(card.curr, card.last);
                            const isUp = change !== null && parseFloat(change) >= 0;
                            return (
                                <div key={card.label} style={{ background: 'var(--bg-card)', border: '1px solid var(--bg-border)', borderRadius: '12px', padding: '16px' }}>
                                    <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', margin: '0 0 6px 0' }}>{card.label}</p>
                                    <p style={{ fontFamily: "'DM Mono', monospace", fontSize: '1.1rem', fontWeight: 700, color: card.color, margin: '0 0 8px 0' }}>{formatCurrency(card.curr, user.currency)}</p>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{yearlyData.years.last}: {formatCurrency(card.last, user.currency)}</span>
                                        {change && <span style={{ fontSize: '0.72rem', color: isUp ? 'var(--accent-green)' : 'var(--accent-red)', background: isUp ? 'var(--accent-green-bg)' : 'var(--accent-red-bg)', padding: '2px 6px', borderRadius: '4px' }}>{isUp ? '↑' : '↓'}{Math.abs(parseFloat(change))}%</span>}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Regret Score Section */}
            <div style={{ background: 'var(--surface-1)', border: '1px solid var(--bg-border)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-6)', marginTop: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
                    <div>
                        <h3 style={{ fontFamily: "'Cabinet Grotesk', 'Sora', sans-serif", fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px 0' }}>🤦 Regret Score</h3>
                        <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: 0 }}>Mark transactions as regretted using the 🤦 button in your transaction list</p>
                    </div>
                    <button
                        onClick={async () => {
                            setRegretLoading(true);
                            try { const res = await aiAPI.regretPatterns(); setRegretData(res.data); }
                            catch { /* silent */ }
                            finally { setRegretLoading(false); }
                        }}
                        disabled={regretLoading}
                        style={{ padding: '8px 16px', background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.2)', borderRadius: '10px', color: '#f43f5e', fontSize: '0.8rem', fontWeight: 600, cursor: regretLoading ? 'wait' : 'pointer', opacity: regretLoading ? 0.7 : 1, fontFamily: 'DM Sans, sans-serif' }}
                    >
                        {regretLoading ? 'Analysing…' : regretData ? 'Refresh Analysis' : 'Analyse Regrets'}
                    </button>
                </div>

                {regretData && (
                    <>
                        {regretData.count === 0 ? (
                            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', textAlign: 'center', padding: '24px 0' }}>No regretted transactions yet. Mark transactions with 🤦 to track patterns.</p>
                        ) : (
                            <>
                                <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
                                    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--bg-border)', borderRadius: '12px', padding: '12px 16px' }}>
                                        <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', margin: '0 0 4px 0' }}>Regretted</p>
                                        <p style={{ fontFamily: "'DM Mono', monospace", fontSize: '1.1rem', fontWeight: 700, color: 'var(--accent-red)', margin: 0 }}>{regretData.count} transactions</p>
                                    </div>
                                    {regretData.total > 0 && (
                                        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--bg-border)', borderRadius: '12px', padding: '12px 16px' }}>
                                            <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', margin: '0 0 4px 0' }}>Total Regret Value</p>
                                            <p style={{ fontFamily: "'DM Mono', monospace", fontSize: '1.1rem', fontWeight: 700, color: 'var(--accent-red)', margin: 0 }}>₹{regretData.total?.toLocaleString('en-IN')}</p>
                                        </div>
                                    )}
                                </div>
                                {regretData.insight && (
                                    <div style={{ padding: '12px 16px', background: 'rgba(244,63,94,0.06)', border: '1px solid rgba(244,63,94,0.15)', borderRadius: '12px', marginBottom: '14px', fontSize: '0.84rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                                        {regretData.insight}
                                    </div>
                                )}
                                {regretData.patterns && regretData.patterns.length > 0 && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        {regretData.patterns.map((p: any, i: number) => (
                                            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '12px 16px', background: 'var(--bg-card)', border: '1px solid var(--bg-border)', borderRadius: '10px' }}>
                                                <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>⚠️</span>
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px', flexWrap: 'wrap' }}>
                                                        <span style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-primary)' }}>{p.pattern}</span>
                                                        <span style={{ fontSize: '0.7rem', color: 'var(--accent-red)', background: 'rgba(244,63,94,0.08)', padding: '1px 7px', borderRadius: '6px' }}>{p.count}× · ₹{p.total_amount?.toLocaleString('en-IN')}</span>
                                                    </div>
                                                    <p style={{ fontSize: '0.78rem', color: 'var(--accent-green)', margin: 0 }}>💡 {p.tip}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </>
                        )}
                    </>
                )}

                {!regretData && !regretLoading && (
                    <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', textAlign: 'center', padding: '16px 0' }}>Click "Analyse Regrets" to see AI patterns in your regretted purchases.</p>
                )}
            </div>

            </PageShell>
            </div>
        </AppLayout>
    );
}