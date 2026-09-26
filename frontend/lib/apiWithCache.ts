import { transactionsAPI, analyticsAPI, budgetsAPI, goalsAPI } from '@/lib/api';
import {
    cacheTransactions, getCachedTransactions,
    cacheAnalytics, getCachedAnalytics,
    cacheBudgets, getCachedBudgets,
    cacheGoals, getCachedGoals,
    type WithId,
} from './offlineCache';

// Reuse the exact param shapes the underlying API methods accept, rather than
// re-declaring (and risking drift from) them here.
type GetTransactionsParams = Parameters<typeof transactionsAPI.getAll>[0];
type GetSummaryParams = Parameters<typeof analyticsAPI.summary>[0];

export const apiWithCache = {
    // T is caller-supplied: this layer just fetches, caches, and falls back --
    // it never inspects the shape of what it's caching.
    async getTransactions<T extends WithId = WithId>(params?: GetTransactionsParams): Promise<T[]> {
        try {
            const res = await transactionsAPI.getAll(params);
            const txs: T[] = res.data?.transactions ?? [];
            cacheTransactions(txs).catch(() => {});
            return txs;
        } catch {
            return getCachedTransactions<T>();
        }
    },

    async getDashboardSummary<T = unknown>(params?: GetSummaryParams): Promise<T | null> {
        const key = `summary:${JSON.stringify(params ?? {})}`;
        try {
            const res = await analyticsAPI.summary(params);
            cacheAnalytics<T>(key, res.data, 3_600_000).catch(() => {});
            return res.data;
        } catch {
            return getCachedAnalytics<T>(key);
        }
    },

    async getBudgets<T extends WithId = WithId>(): Promise<T[]> {
        try {
            const res = await budgetsAPI.getAll();
            const budgets: T[] = res.data?.budgets ?? [];
            cacheBudgets(budgets).catch(() => {});
            return budgets;
        } catch {
            return getCachedBudgets<T>();
        }
    },

    async getGoals<T extends WithId = WithId>(): Promise<T[]> {
        try {
            const res = await goalsAPI.getAll();
            const goals: T[] = res.data?.goals ?? [];
            cacheGoals(goals).catch(() => {});
            return goals;
        } catch {
            return getCachedGoals<T>();
        }
    },
};
