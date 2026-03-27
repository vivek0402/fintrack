'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useAuthStore } from '@/store/authStore';
import { analyticsAPI, transactionsAPI, aiAPI, accountsAPI } from '@/lib/api';
import { AppLayout } from '@/components/layout/AppLayout';
import { Skeleton, SkeletonTitle, SkeletonCard, SkeletonText } from '@/components/ui/Skeleton';
import { useIsMobile } from '@/hooks/useWindowSize';
import { Button } from '@/components/ui/Button';
import { TrendingUp, TrendingDown, Award, Calendar, Download } from 'lucide-react';
import { formatCurrency, exportToCSV } from '@/lib/utils';

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
    const [regretData, setRegretData] = useState<any>(null);
    const [regretLoading, setRegretLoading] = useState(false);
    const [accounts, setAccounts] = useState<any[]>([]);

    useEffect(() => { loadFromStorage(); }, []);
    useEffect(() => { if (!isLoading && !user) router.push('/login'); }, [user, isLoading]);

    useEffect(() => {
        if (!user) return;
        const fetchData = async () => {
            try {
                const [summaryRes, trendsRes, allTxRes, yearlyRes] = await Promise.all([
                    analyticsAPI.summary({ month: currentMonth, year: currentYear }),
                    analyticsAPI.trends(),
                    transactionsAPI.getAll(),
                    analyticsAPI.yearly(currentYear),
                ]);
                setSummary(summaryRes.data.summary);
                setCategories(summaryRes.data.category_breakdown);
                setTrends(trendsRes.data.trends);
                setAllTransactions(allTxRes.data.transactions);
                setYearlyData(yearlyRes.data);
            } catch (err) { console.error(err); }
        };
        fetchData();
        accountsAPI.getAll()
            .then((res: any) => setAccounts(res.data.accounts || []))
            .catch(() => setAccounts([]));
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
            <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--bg-border)', borderRadius: '16px', padding: '24px' }}>
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

    return (
        <AppLayout>
            {/* Account Balances summary card */}
            {accounts.length > 0 && (
                <div style={{
                    backgroundColor: 'var(--bg-card)',
                    border: '1px solid var(--bg-border)',
                    borderRadius: '16px',
                    padding: '20px 24px',
                    marginBottom: '24px',
                }}>
                    {/* Header */}
                    <div style={{
                        display: 'flex',
                        alignItems: isMobile ? 'flex-start' : 'center',
                        justifyContent: 'space-between',
                        flexDirection: isMobile ? 'column' : 'row',
                        gap: isMobile ? '8px' : '0',
                        marginBottom: '16px',
                    }}>
                        <div>
                            <p style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>Account Balances</p>
                            <p style={{ margin: '2px 0 0', fontSize: '13px', color: 'var(--text-muted)' }}>Live balances across all your accounts</p>
                        </div>
                        <div style={{ textAlign: isMobile ? 'left' : 'right' }}>
                            <p style={{ margin: 0, fontSize: '22px', fontWeight: 700, color: totalBalance >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                                ₹{Math.round(totalBalance).toLocaleString('en-IN')}
                            </p>
                            <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-muted)' }}>total balance</p>
                        </div>
                    </div>

                    {/* Account tiles */}
                    <div style={{
                        display: 'flex',
                        gap: '12px',
                        overflowX: 'auto',
                        paddingBottom: '4px',
                        scrollbarWidth: 'none',
                        WebkitOverflowScrolling: 'touch',
                    } as React.CSSProperties}>
                        {accounts.map((account: any) => {
                            const bal = parseFloat(account.current_balance ?? account.starting_balance ?? 0);
                            const net = bal - parseFloat(account.starting_balance ?? 0);
                            return (
                                <div key={account.id} style={{
                                    backgroundColor: 'var(--bg-primary)',
                                    border: '1px solid var(--bg-border)',
                                    borderLeft: `3px solid ${account.color || '#3b82f6'}`,
                                    borderRadius: '12px',
                                    padding: '14px 16px',
                                    minWidth: '160px',
                                    flex: '0 0 auto',
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                        <span style={{ fontSize: '16px' }}>{account.icon || '🏦'}</span>
                                        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{account.name}</span>
                                        {account.is_default && (
                                            <span style={{ fontSize: '10px', color: 'var(--accent-blue)', backgroundColor: 'rgba(59,130,246,0.1)', borderRadius: '4px', padding: '1px 6px' }}>
                                                default
                                            </span>
                                        )}
                                    </div>
                                    <p style={{ margin: '8px 0 2px', fontSize: '18px', fontWeight: 700, color: bal >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                                        ₹{Math.round(bal).toLocaleString('en-IN')}
                                    </p>
                                    <p style={{ margin: 0, fontSize: '12px', color: net >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                                        {net >= 0 ? '▲ +' : '▼ '}₹{Math.abs(Math.round(net)).toLocaleString('en-IN')}
                                    </p>
                                    <div style={{ display: 'flex', gap: '12px', marginTop: '10px', borderTop: '1px solid var(--bg-border)', paddingTop: '8px' }}>
                                        <div>
                                            <p style={{ margin: 0, fontSize: '12px', fontWeight: 600, color: 'var(--accent-green)' }}>₹{Math.round(account.total_income || 0).toLocaleString('en-IN')}</p>
                                            <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-muted)' }}>in</p>
                                        </div>
                                        <div>
                                            <p style={{ margin: 0, fontSize: '12px', fontWeight: 600, color: 'var(--accent-red)' }}>₹{Math.round(account.total_expenses || 0).toLocaleString('en-IN')}</p>
                                            <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-muted)' }}>out</p>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Manage link */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
                        <span
                            onClick={() => router.push('/profile')}
                            style={{ fontSize: '12px', color: 'var(--accent-blue)', cursor: 'pointer' }}
                        >
                            Manage accounts →
                        </span>
                    </div>
                </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                    <h1 style={{ fontFamily: 'Sora, sans-serif', fontSize: '1.4rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Analytics</h1>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', margin: '4px 0 0 0' }}>Deep insights into your spending</p>
                </div>
                {!isMobile && <Button variant="secondary" size="md" onClick={() => exportToCSV(allTransactions, 'fintrack-all.csv')}><Download size={16} />Export All</Button>}
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
                        <div key={card.label} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--bg-border)', borderRadius: '16px', padding: '20px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                                <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 500 }}>{card.label}</span>
                                <div style={{ width: '32px', height: '32px', background: card.bg, border: `1px solid ${card.border}`, borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <Icon size={15} color={card.color} />
                                </div>
                            </div>
                            <p style={{ fontFamily: 'Sora, sans-serif', fontSize: '1.3rem', fontWeight: 600, color: card.color, margin: 0 }}>{card.value}</p>
                        </div>
                    );
                })}
            </div>

            {/* Bar Chart */}
            <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--bg-border)', borderRadius: '16px', padding: '24px', marginBottom: '16px' }}>
                <h3 style={{ fontFamily: 'Sora, sans-serif', fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 20px 0' }}>Monthly Income vs Expenses</h3>
                {barData.length === 0 ? (
                    <div style={{ height: '240px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>No data yet</div>
                ) : (
                    <ResponsiveContainer width="100%" height={260}>
                        <BarChart data={barData} barGap={4}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--bg-border)" vertical={false} />
                            <XAxis dataKey="month" tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`} />
                            <Tooltip content={<CustomTooltip />} />
                            <Legend wrapperStyle={{ fontSize: '0.8rem', paddingTop: '16px' }} />
                            <Bar dataKey="income" name="Income" fill="#10b981" radius={[4, 4, 0, 0]} isAnimationActive={true} animationDuration={800} />
                            <Bar dataKey="expenses" name="Expenses" fill="#f43f5e" radius={[4, 4, 0, 0]} isAnimationActive={true} animationDuration={800} />
                        </BarChart>
                    </ResponsiveContainer>
                )}
            </div>

            {/* Category Breakdown */}
            <div style={{ marginBottom: '16px' }}>
                <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--bg-border)', borderRadius: '16px', padding: '24px' }}>
                    <h3 style={{ fontFamily: 'Sora, sans-serif', fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 16px 0' }}>Category Breakdown — {FULL_MONTHS[currentMonth]}</h3>
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
                                                <span style={{ fontFamily: 'Sora, sans-serif', fontSize: '0.875rem', fontWeight: 600, color: 'var(--accent-red)', minWidth: '80px', textAlign: 'right' }}>{formatCurrency(parseFloat(cat.total), user.currency)}</span>
                                            </div>
                                        </div>
                                        <div style={{ height: '4px', background: 'var(--bg-border)', borderRadius: '2px', overflow: 'hidden' }}>
                                            <div style={{ height: '100%', width: `${pct}%`, background: cat.color, borderRadius: '2px', transition: 'width 0.5s ease' }} />
                                        </div>
                                    </div>
                                );
                            })}
                            <div style={{ borderTop: '1px solid var(--bg-border)', paddingTop: '12px', display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>Total</span>
                                <span style={{ fontFamily: 'Sora, sans-serif', fontSize: '0.875rem', fontWeight: 700, color: 'var(--accent-red)' }}>{formatCurrency(totalExpenses, user.currency)}</span>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Year over Year */}
            {yearlyData && (
                <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--bg-border)', borderRadius: '16px', padding: '24px' }}>
                    <h3 style={{ fontFamily: 'Sora, sans-serif', fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 16px 0' }}>
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
                                    <p style={{ fontFamily: 'Sora, sans-serif', fontSize: '1.1rem', fontWeight: 700, color: card.color, margin: '0 0 8px 0' }}>{formatCurrency(card.curr, user.currency)}</p>
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
            <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--bg-border)', borderRadius: '16px', padding: '24px', marginTop: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
                    <div>
                        <h3 style={{ fontFamily: 'Sora, sans-serif', fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px 0' }}>🤦 Regret Score</h3>
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
                                        <p style={{ fontFamily: 'Sora, sans-serif', fontSize: '1.1rem', fontWeight: 700, color: '#f43f5e', margin: 0 }}>{regretData.count} transactions</p>
                                    </div>
                                    {regretData.total > 0 && (
                                        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--bg-border)', borderRadius: '12px', padding: '12px 16px' }}>
                                            <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', margin: '0 0 4px 0' }}>Total Regret Value</p>
                                            <p style={{ fontFamily: 'Sora, sans-serif', fontSize: '1.1rem', fontWeight: 700, color: '#f43f5e', margin: 0 }}>₹{regretData.total?.toLocaleString('en-IN')}</p>
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
                                                        <span style={{ fontSize: '0.7rem', color: '#f43f5e', background: 'rgba(244,63,94,0.08)', padding: '1px 7px', borderRadius: '6px' }}>{p.count}× · ₹{p.total_amount?.toLocaleString('en-IN')}</span>
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

            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </AppLayout>
    );
}