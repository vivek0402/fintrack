import { transactionsAPI, analyticsAPI, budgetsAPI, goalsAPI } from '@/lib/api';
import {
    cacheTransactions, getCachedTransactions,
    cacheAnalytics, getCachedAnalytics,
    cacheBudgets, getCachedBudgets,
    cacheGoals, getCachedGoals,
} from './offlineCache';

export const apiWithCache = {
    async getTransactions(params?: any): Promise<any[]> {
        try {
            const res = await transactionsAPI.getAll(params);
            const txs: any[] = res.data?.transactions ?? [];
            cacheTransactions(txs).catch(() => {});
            return txs;
        } catch {
            return getCachedTransactions();
        }
    },

    async getDashboardSummary(params?: any): Promise<any | null> {
        const key = `summary:${JSON.stringify(params ?? {})}`;
        try {
            const res = await analyticsAPI.summary(params);
            cacheAnalytics(key, res.data, 3_600_000).catch(() => {});
            return res.data;
        } catch {
            return getCachedAnalytics(key);
        }
    },

    async getBudgets(): Promise<any[]> {
        try {
            const res = await budgetsAPI.getAll();
            const budgets: any[] = res.data?.budgets ?? [];
            cacheBudgets(budgets).catch(() => {});
            return budgets;
        } catch {
            return getCachedBudgets();
        }
    },

    async getGoals(): Promise<any[]> {
        try {
            const res = await goalsAPI.getAll();
            const goals: any[] = res.data?.goals ?? [];
            cacheGoals(goals).catch(() => {});
            return goals;
        } catch {
            return getCachedGoals();
        }
    },
};
