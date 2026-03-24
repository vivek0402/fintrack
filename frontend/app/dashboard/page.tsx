'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { analyticsAPI, transactionsAPI, recurringAPI, budgetsAPI } from '@/lib/api';
import { getCurrentMonthYear } from '@/lib/utils';
import { AppLayout } from '@/components/layout/AppLayout';
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

    useEffect(() => { loadFromStorage(); }, []);
    useEffect(() => { if (!isLoading && !user) router.push('/login'); }, [user, isLoading]);

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
    }, [user]);

    if (isLoading || !user) {
        return (
            <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ width: '24px', height: '24px', border: '2px solid #10b981', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
        );
    }

    return (
        <AppLayout>
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

            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 320px', gap: '16px', marginBottom: '16px' }}>
                <TrendChart trends={trends} />
                <CategoryChart data={categories} currency={user.currency} />
            </div>

            <RecentTransactions transactions={transactions} currency={user.currency} />

            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </AppLayout>
    );
}