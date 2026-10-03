'use client';

import { useEffect } from 'react';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/authStore';
import {
    transactionsAPI, budgetsAPI, goalsAPI, accountsAPI, creditCardsAPI, analyticsAPI, recurringAPI,
} from '@/lib/api';
import { cacheTransactions, getCachedTransactions } from '@/lib/offlineCache';
import type { Transaction, Budget, Goal, BankAccount, CreditCard, MonthSummary, TrendRow } from '@/types/finance';

// Server data shared across pages through the TanStack Query cache. Every key
// starts with the resource name and then the user id, so invalidating a
// resource is `invalidateQueries({ queryKey: ['transactions'] })`, and one
// user's cached data can never answer another user's query.

export type TransactionParams = {
    month?: number; year?: number; credit_card_id?: number; from?: string; to?: string;
};

export const queryKeys = {
    transactions: (userId: string | undefined, params: TransactionParams) => ['transactions', userId, params] as const,
    dashboard: (userId: string | undefined, month: number, year: number) => ['dashboard', userId, month, year] as const,
    budgets: (userId: string | undefined, month: number, year: number) => ['budgets', userId, month, year] as const,
    goals: (userId: string | undefined) => ['goals', userId] as const,
    accounts: (userId: string | undefined) => ['accounts', userId] as const,
    creditCards: (userId: string | undefined) => ['creditCards', userId] as const,
    paymentMethodUsage: (userId: string | undefined) => ['paymentMethodUsage', userId] as const,
};

function useUserId(): string | undefined {
    const { user } = useAuthStore();
    return user?.id;
}

// ── Queries ──────────────────────────────────────────────────────────────────

/**
 * A per-user cached query for one page's data: key is
 * `[resource, userId, ...args]`. Shows the last data at once on revisit and
 * refreshes it in the background. `persist: false` keeps large or unbounded
 * results (a whole year of transactions) out of localStorage.
 */
export function useUserQuery<T>(
    resource: string,
    args: readonly unknown[],
    queryFn: () => Promise<T>,
    options: { enabled?: boolean; persist?: boolean } = {},
) {
    const userId = useUserId();
    return useQuery({
        queryKey: [resource, userId, ...args],
        enabled: !!userId && (options.enabled ?? true),
        meta: { persist: options.persist ?? true },
        queryFn,
    });
}

export function useTransactions(params: TransactionParams) {
    const userId = useUserId();
    // "All time" and custom ranges are unbounded -- keep them in memory only,
    // never in the localStorage-persisted cache.
    const bounded = !!params.month && !params.from && !params.to;
    return useQuery({
        queryKey: queryKeys.transactions(userId, params),
        enabled: !!userId,
        meta: { persist: bounded },
        queryFn: () => fetchTransactions(params),
    });
}

async function fetchTransactions(params: TransactionParams): Promise<Transaction[]> {
    try {
        const res = await transactionsAPI.getAll(params);
        const txs: Transaction[] = res.data?.transactions ?? [];
        cacheTransactions(txs).catch(() => {});
        return txs;
    } catch (err) {
        // Offline / backend down: fall back to the IndexedDB copy. With
        // nothing there either, surface the error so the page can tell
        // "failed to load" apart from "no transactions this month".
        const cached = await getCachedTransactions<Transaction>();
        if (cached.length > 0) return cached;
        throw err;
    }
}

export type DashboardData = {
    summary: MonthSummary; trends: TrendRow[]; transactions: Transaction[]; budgets: Budget[]; goals: Goal[];
};

export function useDashboardData(month: number, year: number, options: { enabled?: boolean } = {}) {
    const userId = useUserId();
    return useQuery({
        queryKey: queryKeys.dashboard(userId, month, year),
        enabled: !!userId && (options.enabled ?? true),
        queryFn: () => fetchDashboard(month, year),
    });
}

async function fetchDashboard(month: number, year: number): Promise<DashboardData> {
    recurringAPI.process().catch(() => {});
    const [summaryRes, trendsRes, txRes, budgetsRes, goalsRes] = await Promise.all([
        analyticsAPI.summary({ month, year }),
        analyticsAPI.trends(),
        transactionsAPI.getAll({ month, year }),
        budgetsAPI.getAll({ month, year }),
        goalsAPI.getAll(),
    ]);
    return {
        summary:      summaryRes.data.summary,
        trends:       trendsRes.data.trends ?? [],
        transactions: txRes.data.transactions ?? [],
        budgets:      budgetsRes.data.budgets ?? [],
        goals:        goalsRes.data.goals ?? [],
    };
}

/** The Analytics (Insights) overview tab's month bundle. */
export async function fetchAnalyticsOverview(month: number, year: number) {
    const [summaryRes, trendsRes, allTxRes, yearlyRes, pmRes] = await Promise.all([
        analyticsAPI.summary({ month, year }),
        analyticsAPI.trends(),
        transactionsAPI.getAll({ month, year }),
        analyticsAPI.yearly(year),
        analyticsAPI.paymentMethods({ month, year }),
    ]);
    return {
        summary:         summaryRes.data.summary as MonthSummary,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- category breakdown rows are untyped for now
        categories:      (summaryRes.data.category_breakdown ?? []) as any[],
        trends:          (trendsRes.data.trends ?? []) as TrendRow[],
        allTransactions: (allTxRes.data.transactions ?? []) as Transaction[],
        yearlyData:      yearlyRes.data,
        paymentMethods:  (pmRes.data.breakdown ?? []) as any[],
        paymentTotal:    (pmRes.data.total ?? 0) as number,
    };
}

// How long after sign-in / app start to wait before warming the other tabs,
// so it never competes with the page the user actually opened.
const PREFETCH_DELAY_MS = 1500;

/**
 * Warm the cache for the three main tabs (Home, Money, Insights) for the
 * current month, shortly after the app starts, so the first tap on each is
 * instant too. Skips anything already fresh in the cache.
 */
export function usePrefetchTabData() {
    const userId = useUserId();
    const qc = useQueryClient();
    useEffect(() => {
        if (!userId) return;
        const t = setTimeout(() => {
            const now = new Date();
            const month = now.getMonth() + 1;
            const year = now.getFullYear();
            qc.prefetchQuery({ queryKey: queryKeys.dashboard(userId, month, year), queryFn: () => fetchDashboard(month, year) });
            qc.prefetchQuery({
                queryKey: queryKeys.transactions(userId, { month, year }),
                queryFn: () => fetchTransactions({ month, year }),
                meta: { persist: true },
            });
            qc.prefetchQuery({ queryKey: ['analytics', userId, 'overview', month, year], queryFn: () => fetchAnalyticsOverview(month, year) });
        }, PREFETCH_DELAY_MS);
        return () => clearTimeout(t);
    }, [userId, qc]);
}

export function useBudgets(month: number, year: number, options: { enabled?: boolean } = {}) {
    const userId = useUserId();
    return useQuery({
        queryKey: queryKeys.budgets(userId, month, year),
        enabled: !!userId && (options.enabled ?? true),
        queryFn: async (): Promise<Budget[]> => (await budgetsAPI.getAll({ month, year })).data.budgets ?? [],
    });
}

export function useGoals(options: { enabled?: boolean } = {}) {
    const userId = useUserId();
    return useQuery({
        queryKey: queryKeys.goals(userId),
        enabled: !!userId && (options.enabled ?? true),
        queryFn: async (): Promise<Goal[]> => (await goalsAPI.getAll()).data.goals ?? [],
    });
}

export function useAccounts(options: { enabled?: boolean } = {}) {
    const userId = useUserId();
    return useQuery({
        queryKey: queryKeys.accounts(userId),
        enabled: !!userId && (options.enabled ?? true),
        queryFn: async (): Promise<BankAccount[]> => (await accountsAPI.getAll()).data.accounts ?? [],
    });
}

export function useCreditCards(options: { enabled?: boolean } = {}) {
    const userId = useUserId();
    return useQuery({
        queryKey: queryKeys.creditCards(userId),
        enabled: !!userId && (options.enabled ?? true),
        queryFn: async (): Promise<CreditCard[]> => (await creditCardsAPI.getAll()).data.cards ?? [],
    });
}

/** This month's usage count per payment method (for ordering the picker). */
export function usePaymentMethodUsage(options: { enabled?: boolean } = {}) {
    const userId = useUserId();
    return useQuery({
        queryKey: queryKeys.paymentMethodUsage(userId),
        enabled: !!userId && (options.enabled ?? true),
        queryFn: async (): Promise<Record<string, number>> => {
            const res = await analyticsAPI.paymentMethods();
            const map: Record<string, number> = {};
            (res.data.breakdown || []).forEach((b: { method: string; count: number }) => { map[b.method] = b.count; });
            return map;
        },
    });
}

// ── Cache updates after a write ──────────────────────────────────────────────

export { invalidateAfterTransactionWrite } from '@/lib/queryClient';

const txDay = (tx: Pick<Transaction, 'date'>) => String(tx?.date ?? '').split('T')[0];

/** Would `tx` appear in the list fetched with `params`? */
export function transactionMatchesParams(tx: Pick<Transaction, 'date' | 'credit_card_id'>, params: TransactionParams): boolean {
    if (params.credit_card_id && tx.credit_card_id !== params.credit_card_id) return false;
    const day = txDay(tx);
    if (params.from || params.to) {
        if (params.from && day < params.from) return false;
        if (params.to && day > params.to) return false;
        return true;
    }
    if (params.month && params.year) {
        const [y, m] = day.split('-').map(Number);
        return y === params.year && m === params.month;
    }
    return true;
}

type CategoryLike = { id: string | number; name: string; icon?: string | null; color?: string | null };

/**
 * Put a just-saved transaction (the server's response row) into every cached
 * transaction list it belongs to, so the list shows it the moment the save
 * returns -- no refetch, no skeleton. The server row has no category join, so
 * the display fields are filled from the categories list.
 */
export function upsertTransactionInCache(qc: QueryClient, saved: Transaction, categories: CategoryLike[] = []) {
    const cat = categories.find(c => String(c.id) === String(saved.category_id));
    const row = cat
        ? { ...saved, category_name: cat.name, category_icon: cat.icon ?? null, category_color: cat.color ?? null }
        : saved;
    for (const [key, list] of qc.getQueriesData<Transaction[]>({ queryKey: ['transactions'] })) {
        if (!Array.isArray(list)) continue;
        const params = (key[2] ?? {}) as TransactionParams;
        const without = list.filter(t => t.id !== row.id);
        const existing = list.find(t => t.id === row.id);
        const next = transactionMatchesParams(row, params)
            ? (existing ? list.map(t => (t.id === row.id ? { ...t, ...row } : t)) : [row, ...list])
            : without;
        qc.setQueryData(key, next);
    }
}

/** Drop transactions from every cached list (after a confirmed delete). */
export function removeTransactionsFromCache(qc: QueryClient, ids: string[]) {
    const idSet = new Set(ids);
    qc.setQueriesData<Transaction[]>({ queryKey: ['transactions'] }, list =>
        Array.isArray(list) ? list.filter(t => !idSet.has(t.id)) : list,
    );
}
